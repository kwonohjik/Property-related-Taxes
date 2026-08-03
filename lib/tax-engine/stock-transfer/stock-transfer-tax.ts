/**
 * 주식 양도소득세 — 오케스트레이터
 *
 * calculateStockTransferTax(input): StockTransferResult
 *
 * 계산 파이프라인 (STEP 1~12):
 *   1. 과세대상 판정 + 비과세 조기 반환
 *   2. 취득가액 결정 (실가 / 환산 / 액면가)
 *   3. 양도가액 결정
 *   4. 필요경비 (실가 / 개산공제 §163⑥4)
 *   5. 양도소득금액 = 양도가 − 취득가 − 필요경비
 *   6. 기본공제 §103②
 *   7. 과세표준 (1원 미만 절사 §47②)
 *   8. 세율 적용 (§104①11 / §55)
 *   9. 산출세액 (10원 미만 절사 §47①)
 *  10. 가산세·세액공제
 *  11. 지방소득세 (10원 미만 절사 §47③)
 *  12. 최종 결과 조립
 *
 * 법령: 소득세법 2026.4.21. 시행
 */

import type { StockTransferInput, StockTransferResult, LotMatchingDetail } from "./types/stock-transfer.types";
import type { ForeignStockInput, ForeignStockResult } from "./types/foreign-stock.types";
import type { ExitTaxInput, ExitTaxResult } from "./types/exit-tax.types";
import { calculateForeignStockTax } from "./foreign-stock";
import { calculateExitTax } from "./exit-tax";
import { classifyStockTransfer } from "./stock-classification";
import { calcHoldingPeriod, calcBasicDeduction, floorTaxBase, floorTen, applyDeemedAcquisitionDate, buildAppliedThreshold } from "./stock-transfer-helpers";
import { computeCross89Adjustment } from "../comparative-104-5-cross";
import { NBL_HEAVY_CORP_BRACKETS } from "./stock-rate-tables";
/** §104①9호 카테고리 — `stock-transfer-aggregate.ts`와 같은 집합(둘 다 다목·라목에 얹힌다) */
const NBL_HEAVY_CORP_CATEGORIES: ReadonlySet<StockTransferResult["taxCategory"]> = new Set([
  "other_asset_block_shareholder_nbl",
  "other_asset_heavy_re_nbl",
]);
import { calcPostListingConversion } from "./stock-valuation-post-listing";
import type { PostListingValuationResult } from "./stock-valuation-post-listing";
import { synthesizePostListingInput } from "./post-listing-flat-adapter";
import { calcListedValuation } from "./stock-valuation-listed";
import {
  calcUnlistedValuation,
  calcFaceValueTransferEstimated,
  calcTransferStdPriceForFaceValue,
  calcAcquisitionStdPerShareSupplementary,
} from "./stock-valuation-unlisted";
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import { buildPr2Detail } from "./stock-transfer-pr2-detail";
import { applyCapitalAdjustmentsToLots } from "./lot-capital-adjustments";
import { STOCK, STOCK_ESTIMATED_EXPENSE_RATE } from "@/lib/tax-engine/legal-codes/stock";
import { allocateLots } from "./lot-allocation";
import { calcSplitModeTax } from "./lot-allocation-tax";
import { buildExemptResult } from "./stock-transfer-exempt-result";
import { applyExemptZeroing } from "./apply-exempt-zeroing";
import { apply163_9Conversion, resolveTransferStd } from "./apply-163-9-conversion";
import { calcSecuritiesTransactionTax } from "./securities-transaction-tax";

// ============================================================
// split 모드 판정 헬퍼
// ============================================================

function isSplitMode(input: StockTransferInput): boolean {
  return !!(
    input.acquisitionLots &&
    input.acquisitionLots.length > 0 &&
    input.transferLots &&
    input.transferLots.length > 0 &&
    input.costAllocationMethod
  );
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 해외주식 양도소득세 오버로드 (PR-4A)
 * marketType="foreign_stock" 시 foreign-stock.ts 엔진으로 위임
 */
export function calculateStockTransferTax(input: ForeignStockInput): ForeignStockResult;
/**
 * 국외전출세 오버로드 (PR-4B)
 * marketType="exit_tax" 시 exit-tax.ts 엔진으로 위임
 */
export function calculateStockTransferTax(input: ExitTaxInput): ExitTaxResult;
export function calculateStockTransferTax(input: StockTransferInput): StockTransferResult;
export function calculateStockTransferTax(
  input: StockTransferInput | ForeignStockInput | ExitTaxInput,
): StockTransferResult | ForeignStockResult | ExitTaxResult {
  // foreign_stock 분기 — PR-4A 독립 도메인
  if ((input as ForeignStockInput).marketType === "foreign_stock") {
    return calculateForeignStockTax(input as ForeignStockInput);
  }

  // exit_tax 분기 — PR-4B 독립 도메인
  if ((input as ExitTaxInput).marketType === "exit_tax") {
    return calculateExitTax(input as ExitTaxInput);
  }

  return calculateStockTransferTaxInternal(input as StockTransferInput);
}

/**
 * 단건 내부 계산 — foreign/exit 라우팅 없이 일반 주식 파이프라인만 실행.
 * 다자산 합산 엔진(`stock-transfer-aggregate.ts`)이 종목별로 재사용.
 * @internal 외부(API·UI)는 오버로드된 `calculateStockTransferTax`를 사용.
 */
export function calculateStockTransferTaxInternal(input: StockTransferInput): StockTransferResult {
  const warnings: string[] = [];
  const appliedRules: StockTransferResult["appliedRules"] = [];

  // ──────────────────────────────────────────────────────────
  // STEP 1: 과세대상 판정
  // ──────────────────────────────────────────────────────────
  const classification = classifyStockTransfer(input);

  // appliedRules 병합
  for (const rule of classification.appliedRules) {
    if (!appliedRules.includes(rule)) appliedRules.push(rule);
  }
  warnings.push(...classification.warnings);

  // 비과세 분기는 STEP 1~12 정상 실행 후 마지막에 finalTax·가산세만 0으로 zeroing.
  // (조기 반환 제거 — 사용자가 입력한 데이터로 산출세액·과세표준까지 모두 echo하기 위함.
  //  실 세액에 영향 없음 — applyExemptZeroing이 최종 분기에서 처리.)
  // 단, marketType이 unlisted/other_asset 등 STEP 2~11에서 안전 계산이 불가능한 K-OTC 비과세는
  // 기존 buildExemptResult 경로 유지하여 그래이스풀하게 처리.
  if (classification.isExempt &&
      (classification.exemptReason === "kotc_sme_mid" || classification.exemptReason === "kotc_venture")) {
    return buildExemptResult(input, classification);
  }

  // ──────────────────────────────────────────────────────────
  // split 모드 사전 계산 (lot 매칭 — STEP 2/3/5/8 분기에서 사용)
  // ──────────────────────────────────────────────────────────
  let lotMatchingDetail: LotMatchingDetail | undefined;
  let lotCapitalAdjustmentsDetail: StockTransferResult["lotCapitalAdjustmentsDetail"];
  if (isSplitMode(input)) {
    const isMajorAndNonSME =
      !input.isSmallMediumEnterprise &&
      (classification.taxCategory === "listed_major" ||
        classification.taxCategory === "unlisted_major");
    // [A-2] 자본조정 lot 전처리 — 발생일 이전 보유 lot만 희석 (allocateLots 직전)
    let effectiveLots = input.acquisitionLots!;
    if (input.capitalAdjustments && input.capitalAdjustments.length > 0) {
      const ca = applyCapitalAdjustmentsToLots(effectiveLots, input.capitalAdjustments);
      effectiveLots = ca.adjustedLots;
      lotCapitalAdjustmentsDetail = ca.perLotApplied;
      warnings.push(...ca.warnings);
      // 자본조정 규칙은 warnings로 전달 — 단일모드(pr2-detail.ts) 패턴 일치, appliedRules union 미변경
      for (const r of ca.appliedRules) if (!warnings.includes(r)) warnings.push(r);
    }
    lotMatchingDetail = allocateLots(
      effectiveLots,
      input.transferLots!,
      input.costAllocationMethod!,
      isMajorAndNonSME,
      input.isSmallMediumEnterprise,
      input.specificMatchings,
    );
    // appliedRules push
    if (input.costAllocationMethod === "specific") appliedRules.push("로트개별법");
    else if (input.costAllocationMethod === "fifo") appliedRules.push("로트선입선출");
    else if (input.costAllocationMethod === "moving_avg") appliedRules.push("로트이동평균");
    warnings.push(...lotMatchingDetail.warnings);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 2: 양도가액 결정 (취득가액 환산 계산을 위해 먼저 산출)
  // ──────────────────────────────────────────────────────────
  let transferPrice = 0;
  let transferPriceBreakdown: StockTransferResult["transferPriceBreakdown"];
  const { shareCount } = input;

  if (lotMatchingDetail) {
    // split 모드 — lot 합계 사용
    transferPrice = lotMatchingDetail.totalTransferPrice;
  } else if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";  // 3중 패턴 default
    if (
      input.transferMarketSamplePrice !== undefined &&
      input.transferMarketSamplePrice > 0
    ) {
      // R-1' 매매사례가액 우선 (영§176의2③1호) — perShareTransferPrice 무시
      transferPrice = Math.floor(input.transferMarketSamplePrice) * shareCount;
    } else if (actualMode === "total") {
      transferPrice = input.transferTotalPrice ?? 0;                  // 총액 직접 사용
    } else {
      transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;
    }
  } else {
    // exchange — 부동산 + 채무면제 + 현금
    const property = input.exchangePropertyValue ?? 0;
    const debt = input.exchangeDebtRelief ?? 0;
    const cash = input.exchangeCash ?? 0;
    transferPrice = property + debt + cash;
    transferPriceBreakdown = { property, debt, cash };
  }

  // ──────────────────────────────────────────────────────────
  // STEP 3: 취득가액 결정
  // ──────────────────────────────────────────────────────────
  let acquisitionPrice = 0;
  let usedEstimatedAcquisition = false;
  let estimatedBase: number | undefined;   // 개산공제 기준 = 취득기준시가 총액 (§163⑥4)
  let postListingDetail: PostListingValuationResult | undefined;  // Round 4 C-04 echo
  let estimatedDeduction: number | undefined;
  let valuationDetail: StockTransferResult["valuationDetail"] | undefined;

  const { acquisitionMode } = input;

  if (lotMatchingDetail) {
    // split 모드 — lot 합계 취득가 사용 (actual만 허용 — Zod·validate에서 차단)
    acquisitionPrice = lotMatchingDetail.totalAcquisitionPrice;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue:
        lotMatchingDetail.weightedAvgPerShare ??
        (lotMatchingDetail.matched[0]?.perShareBuyPrice ?? 0),
    };
  } else if (acquisitionMode === "actual") {
    // 실거래가
    acquisitionPrice = (input.perShareAcquisitionPrice ?? 0) * shareCount;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue: input.perShareAcquisitionPrice ?? 0,
    };

  } else if (acquisitionMode === "face_value") {
    // §99①4 장부분실 액면가
    // 취득기준시가 = 액면가, 양도기준시가 = 비상장 보충 평가
    // 환산취득가 = 양도가 × (액면가 / 양도기준시가)
    usedEstimatedAcquisition = true;
    appliedRules.push("장부분실액면가");

    // 양도기준시가 산출 (§165④1 가중평균 + 80% 하한)
    const transferStdResult = calcTransferStdPriceForFaceValue(input);
    const faceValue = input.faceValuePerShare ?? 0;

    // 환산취득가 = 양도가 × 액면가 / 양도기준시가
    acquisitionPrice = calcFaceValueTransferEstimated(
      transferPrice,
      faceValue,
      transferStdResult.perShare,
    );

    // 개산공제 기준 = 취득기준시가 총액 = 액면가 × 주식수 (§163⑥4)
    estimatedBase = faceValue * shareCount;

    valuationDetail = {
      method: "face_value",
      netAssetFloorApplied: transferStdResult.netAssetFloorApplied,
      netAssetFloorValue: transferStdResult.netAssetFloorValue,
      finalPerShareValue: faceValue,
    };

    if (transferStdResult.netAssetFloorApplied) {
      appliedRules.push("80%하한");
    }

  } else if (acquisitionMode === "estimated") {
    // 환산취득가
    usedEstimatedAcquisition = true;

    if (input.acquiredBeforeListing) {
      // [C-3] 거래정지(양도)+취득후상장은 법령상 양립 불가(§165⑤ 양도일 §3항 전제 ↔ §52의2③ 거래정지 제외).
      //   validate G-5 + Zod refine 이중 차단 → 본 분기는 거래정지 미동반 전제(post-listing 先行 안전).
      // 취득 후 상장 — §165⑤ 본문 (1주당 취득기준시가) + 시령 §176의2②1호 환산 (D-2 정정)
      // §165⑤: 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도/상장연도 가중평균)
      // §176의2②1호: 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
      const postListingResult = calcPostListingConversion(synthesizePostListingInput(input));
      const acqStdPerShare = postListingResult.finalPerShareValue;
      // §176의2②1호 환산 — transferStd 미입력 시 1주당 양도가 자동 fallback
      const { transferStd, usedFallback } = resolveTransferStd(transferPrice, shareCount, input.transferDatePriceAvg1Month);
      if (usedFallback) warnings.push("양도일 직전 1개월 종가평균 미입력 — 1주당 양도가를 §176의2②1호 환산 분모로 자동 사용");
      acquisitionPrice = apply163_9Conversion(transferPrice, acqStdPerShare, transferStd, postListingResult.totalAcquisitionPrice);
      estimatedBase = acqStdPerShare * shareCount;       // §163⑥4 base
      postListingDetail = postListingResult;
      const dailyMode = input.transferStdInputMode === "daily";
      valuationDetail = {
        method: "post_listing_conversion", netAssetFloorApplied: false, finalPerShareValue: acqStdPerShare,
        conversionAcqStdPerShare: acqStdPerShare, conversionTransferStd: transferStd, conversionUsedFallback: usedFallback,
        transferDailyModeUsed: dailyMode, transferDailyAverage: dailyMode ? (input.transferDatePriceAvg1Month ?? 0) : undefined,
      };

      for (const rule of postListingResult.appliedRules) {
        if (!warnings.includes(rule)) warnings.push(rule);
      }
      warnings.push(...postListingResult.warnings);

      if (postListingResult.monthlyAccrualApplied) {
        appliedRules.push("월할가산");
      }

    } else if (input.tradingHaltAtTransfer) {
      // 거래정지·관리종목 → 비상장 보충 평가 우회 (§165③)
      appliedRules.push("거래정지우회");
      const unlistedResult = calcUnlistedValuation(input, transferPrice);
      acquisitionPrice = unlistedResult.totalAcquisitionPrice;
      // 개산공제 기준 = 취득기준시가 총액
      estimatedBase = unlistedResult.acquisitionStdPriceTotal;
      // [C-2] 비상장 분기와 동일 passthrough — full/사례49/순자산단독/§165⑨ 결과 카드 정합
      valuationDetail = {
        method:
          unlistedResult.method === "acq_face_value_only"
            ? "acq_face_value_only"
            : unlistedResult.method === "net_asset_only"
              ? "net_asset_only"
              : "weighted_avg",
        netAssetFloorApplied: unlistedResult.netAssetFloorApplied,
        netAssetFloorValue: unlistedResult.netAssetFloorValue,
        finalPerShareValue: unlistedResult.perShareValue,
        weightedAvgPerShare: unlistedResult.weightedAvgRaw !== undefined
          ? Math.floor(unlistedResult.weightedAvgRaw)
          : undefined,
        acqFaceValuePerShare: input.acqFaceValuePerShare,
        niPerShare: unlistedResult.netIncomeValue,
        naPerShare: unlistedResult.netAssetValue,
        isHeavyRE: input.isHeavyRealEstateForValuation,
        netAssetOnlyReason: unlistedResult.netAssetOnlyReason,
        acquisitionStdPriceTotal: unlistedResult.acquisitionStdPriceTotal,
        section1659Detail: unlistedResult.section1659Detail,
      };
      if (unlistedResult.netAssetFloorApplied) {
        appliedRules.push("80%하한");
      }
      if (unlistedResult.netAssetOnlyReason) {
        appliedRules.push("80%하한미적용");
      }
      if (unlistedResult.section1659Detail) {
        appliedRules.push("월할가산");
      }
      warnings.push(...unlistedResult.warnings);
      for (const rule of unlistedResult.appliedRules) {
        if (!appliedRules.includes(rule as typeof appliedRules[number])) {
          // 문자열 규칙은 warnings로 전달
          warnings.push(rule);
        }
      }

    } else if (input.marketType === "unlisted") {
      // 비상장 보충 평가 (§165④1 + 80% 하한 + 순자산 단독 4사유)
      const unlistedResult = calcUnlistedValuation(input, transferPrice);
      acquisitionPrice = unlistedResult.totalAcquisitionPrice;
      // ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가 아님)
      estimatedBase = unlistedResult.acquisitionStdPriceTotal;
      // [부담부증여 §159] estimatedBase(개산공제 §163⑥4 base)에만 채무비율 안분.
      // acquisitionPrice는 transferPrice(=채무B) 기반 환산이라 자동 안분됨 — 이중안분 금지.
      if (
        input.burdenedGiftDebtRatio !== undefined &&
        input.burdenedGiftDebtRatio > 0 &&
        input.burdenedGiftDebtRatio < 1
      ) {
        estimatedBase = Math.floor(estimatedBase * input.burdenedGiftDebtRatio);
      }
      valuationDetail = {
        // [사례 49] acq_face_value_only는 그대로 passthrough (UI 결과 카드 분기용)
        method:
          unlistedResult.method === "acq_face_value_only"
            ? "acq_face_value_only"
            : unlistedResult.method === "net_asset_only"
              ? "net_asset_only"
              : "weighted_avg",
        netAssetFloorApplied: unlistedResult.netAssetFloorApplied,
        netAssetFloorValue: unlistedResult.netAssetFloorValue,
        finalPerShareValue: unlistedResult.perShareValue,
        weightedAvgPerShare: unlistedResult.weightedAvgRaw !== undefined
          ? Math.floor(unlistedResult.weightedAvgRaw)
          : undefined,
        // [GAP-D 사례 49] FormulaCard 입력값 echo — 역산 회피
        acqFaceValuePerShare: input.acqFaceValuePerShare,
        niPerShare: unlistedResult.netIncomeValue,
        naPerShare: unlistedResult.netAssetValue,
        isHeavyRE: input.isHeavyRealEstateForValuation,
        netAssetOnlyReason: unlistedResult.netAssetOnlyReason,
        acquisitionStdPriceTotal: unlistedResult.acquisitionStdPriceTotal,
        // [B-4 §165⑨ 본체] 양도·취득 기준시가 동일 월할 보정 echo
        section1659Detail: unlistedResult.section1659Detail,
      };
      if (unlistedResult.netAssetFloorApplied) {
        appliedRules.push("80%하한");
      }
      if (unlistedResult.netAssetOnlyReason) {
        appliedRules.push("80%하한미적용");
      }
      if (unlistedResult.section1659Detail) {
        appliedRules.push("월할가산");
      }
      warnings.push(...unlistedResult.warnings);
      for (const rule of unlistedResult.appliedRules) {
        warnings.push(rule); // 비타입 문자열 규칙은 warnings로 전달
      }

    } else if (input.tradingHaltAtAcquisition) {
      // [C-1] 취득일 거래정지 — 취득시 기준시가만 §165④ 보충 평가 (소령 §165③ 후문, §165⑤ 비적용 판정)
      // 분모(양도시)는 1개월 종가평균 유지. unlisted 분기 뒤 배치 = 상장만 도달 (M-5 가드)
      appliedRules.push("취득일거래정지우회");
      const acqSide = calcAcquisitionStdPerShareSupplementary(input);
      const haltTransferStd = Math.floor(input.transferDatePriceAvg1Month ?? 0);
      if (acqSide.perShare <= 0 || haltTransferStd <= 0) {
        // division 가드 — validate 우회(엔진 직접 호출) 방어
        acquisitionPrice = 0;
        estimatedBase = 0;
        warnings.push(
          haltTransferStd <= 0
            ? "양도일 직전 1개월 종가평균이 0 이하 — 환산취득가 산출 불가"
            : "취득시 보충평가액이 0 이하 — 취득연도 순손익·순자산가치를 확인하세요",
        );
      } else {
        // 환산취득가 = 양도가 × (취득 보충평가 / 양도 종가평균) — BigInt overflow 안전, 총액 floor 1회
        acquisitionPrice = Number(
          (BigInt(transferPrice) * BigInt(acqSide.perShare)) / BigInt(haltTransferStd),
        );
        estimatedBase = acqSide.perShare * shareCount; // §163⑥4 base
      }
      valuationDetail = {
        method: "halt_acquisition_conversion",
        netAssetFloorApplied: false, // 분자(취득기준시가) 80% 하한 미적용 관행
        finalPerShareValue: acqSide.perShare,
        conversionAcqStdPerShare: acqSide.perShare,
        conversionTransferStd: haltTransferStd,
        weightedAvgPerShare: Math.floor(acqSide.weightedRaw),
        niPerShare: input.acquisitionYearNetIncomePerShare,
        naPerShare: input.acquisitionYearNetAssetPerShare,
        isHeavyRE: input.isHeavyRealEstateForValuation,
        netAssetOnlyReason: input.netAssetOnlyReason,
        acquisitionStdPriceTotal: acqSide.perShare * shareCount,
      };
      warnings.push(...acqSide.warnings);
      for (const rule of acqSide.appliedRules) {
        warnings.push(rule); // 비타입 문자열 규칙(법령 인용)은 warnings로 전달
      }

    } else {
      // 상장 — 1개월 종가평균 환산 (시행령 §176의2②1호 직접 적용 — D-2 정정)
      const listedResult = calcListedValuation(input, transferPrice);
      acquisitionPrice = listedResult.totalAcquisitionPrice;
      // ★ Bug-B 정정: §163⑥4 개산공제 base = 취득기준시가 총액 (양도기준시가 아님)
      estimatedBase = listedResult.stdPriceTotalForEstimatedDeduction;
      valuationDetail = {
        method: "monthly_avg_listed",
        netAssetFloorApplied: false,
        // ★ Bug-A 정정: 환산 후 1주당 취득가 (기존: 양도시 기준시가 그대로 = 잘못된 값)
        finalPerShareValue: listedResult.perShareAcquisitionPrice,
      };
      // [B-4 M-8 §165⑨] 상장 종가평균 양도·취득 동일 — §81④ 2호(보정 없음) 정보성 안내.
      // §81④ 1호 산식은 사업연도 기준시가 모수라 상장(§99①3 종가평균) 미적용.
      if (
        listedResult.perShareTransferStdPrice > 0 &&
        listedResult.perShareTransferStdPrice === listedResult.perShareAcquisitionStdPrice
      ) {
        warnings.push("§165⑨ — 상장 양도·취득 종가평균이 동일합니다(§81④ 2호, 보정 없음).");
      }
    }

  } else if (acquisitionMode === "sale_case") {
    // R-1' 매매사례가액 — 영§176의2③1호 (주권상장법인 주식등 제외)
    // 우선순위: acquisitionMarketSamplePrice → perShareAcquisitionPrice (legacy fallback)
    const samplePerShare = input.acquisitionMarketSamplePrice && input.acquisitionMarketSamplePrice > 0
      ? Math.floor(input.acquisitionMarketSamplePrice)
      : (input.perShareAcquisitionPrice ?? 0);
    acquisitionPrice = samplePerShare * shareCount;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue: samplePerShare,
    };

  } else {
    // 이론상 도달 불가 — acquisitionMode 4종 enum 모두 위에서 분기됨
    acquisitionPrice = 0;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue: 0,
    };
  }

  // 개산공제 계산 (취득기준시가 총액 × 1%) — §163⑥4
  // ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가가 아님)
  if (usedEstimatedAcquisition && estimatedBase !== undefined && estimatedBase > 0) {
    estimatedDeduction = Math.floor(estimatedBase * STOCK_ESTIMATED_EXPENSE_RATE);
  }

  // STEP 3.5 + 3.7: PR-2 detail (매매사례가액 + 자본조정) — sibling helper
  // [A-2 STEP1-1] split 모드는 자본조정이 lot 전처리에서 이미 반영됨 → buildPr2Detail 글로벌 display 제외(이중적용 차단)
  const pr2Input = isSplitMode(input)
    ? { ...input, capitalAdjustments: undefined }
    : input;
  const pr2 = buildPr2Detail(pr2Input, shareCount, acquisitionPrice, acquisitionMode);
  const marketSampleDetail = pr2.marketSampleDetail;
  const capitalAdjustmentsDetail = pr2.capitalAdjustmentsDetail;
  warnings.push(...pr2.warningsDelta);

  // ──────────────────────────────────────────────────────────
  // STEP 4: 필요경비
  //   환산취득가 모드 본문: 시행령 §163⑥4 개산공제(취득기준시가×1%) (§97②2호 본문)
  //   [B-2] 단서: (환산취득가+개산공제) < (자본적지출+양도비) → 후자를 필요경비 전체로 대체 (§97②2호 단서)
  //     소령 §163⑫ → §176의2②1호(주식 환산 명시) → §97①1나목 "환산취득가액으로 하는 경우" 해당.
  //     sale_case는 usedEstimatedAcquisition 미설정이라 본 게이트 미진입 (구조적 배제).
  // ──────────────────────────────────────────────────────────
  let expenses = 0;
  let swapApplied = false;
  let swapComparison: StockTransferResult["swapComparison"];
  const { expenseMode } = input;

  if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
    const directSide = input.actualExpenses ?? 0; // 자본적지출 + 양도비 합계 (expenseMode 무관)
    const estimatedSide = acquisitionPrice + estimatedDeduction; // 가목 = 환산취득가 + 개산공제
    if (directSide > estimatedSide) {
      // 단서 발동 — "적은 경우" 문리상 동률(==)은 본문
      swapApplied = true;
      expenses = directSide;
      swapComparison = { estimatedSide, directSide, chosen: "direct" };
      appliedRules.push("§97②단서swap");
      warnings.push(
        "§97②2호 단서 적용 — (환산취득가+개산공제)보다 실제 필요경비(자본적지출+양도비)가 커 후자를 필요경비로 합니다. 양도차익 계산에서 환산취득가는 차감되지 않습니다."
      );
    } else {
      expenses = estimatedDeduction;
      if (directSide > 0) {
        swapComparison = { estimatedSide, directSide, chosen: "estimated" };
        warnings.push(
          "환산취득가 모드 — §97②2호 단서 비교 결과 (환산취득가+개산공제)가 입력 실비 이상이므로 본문(개산공제)을 적용합니다."
        );
      }
    }
  } else if (expenseMode === "actual") {
    expenses = input.actualExpenses ?? 0;
  } else {
    expenses = estimatedDeduction ?? 0;
  }

  // ──────────────────────────────────────────────────────────
  // STEP 5: 양도소득금액
  //   [B-2] swap 시 가목(환산취득가+개산공제) 전체가 나목으로 대체 → 취득가액 차감 제외
  // ──────────────────────────────────────────────────────────
  const transferIncome = swapApplied
    ? transferPrice - expenses
    : transferPrice - acquisitionPrice - expenses;

  // ──────────────────────────────────────────────────────────
  // STEP 6: 기본공제 §103②
  // ──────────────────────────────────────────────────────────
  const basicDeduction = calcBasicDeduction(
    transferIncome,
    classification.basicDeductionGroup,
    input.realEstateGroupBasicDeductionUsed,
  );

  // ──────────────────────────────────────────────────────────
  // STEP 7: 과세표준 (1원 미만 절사 §47②)
  // ──────────────────────────────────────────────────────────
  const taxBaseRaw = Math.max(0, transferIncome - basicDeduction);
  const taxBase = floorTaxBase(taxBaseRaw);

  // ──────────────────────────────────────────────────────────
  // STEP 8: 보유기간 + 세율 적용
  // ──────────────────────────────────────────────────────────

  // 의제취득일 처리 (1985.12.31. 이전 취득)
  const rawHoldingResult = calcHoldingPeriod(input);
  const { effectiveDate: holdingStartDate, isDeemedApplied } = applyDeemedAcquisitionDate(
    rawHoldingResult.startDate,
  );
  if (isDeemedApplied) {
    appliedRules.push("의제취득일적용");
  }

  // 의제취득일 적용 시 보유기간 재계산
  const holdingResult = isDeemedApplied
    ? calcHoldingPeriod({ ...input, acquisitionDate: holdingStartDate })
    : rawHoldingResult;

  // 단기보유 판정 (비중소기업 대주주 1년 미만 → 30%)
  const isShortTermHolding =
    holdingResult.isShortTerm &&
    !input.isSmallMediumEnterprise &&
    (classification.taxCategory === "listed_major" ||
      classification.taxCategory === "unlisted_major");

  if (isShortTermHolding) {
    appliedRules.push("단기30%");
  }

  let rateResult: ReturnType<typeof applyStockTaxRate>;
  if (lotMatchingDetail) {
    // split 모드 — sub-lot별 안분 + 세율 적용 + 합산
    const splitTax = calcSplitModeTax(
      taxBase,
      lotMatchingDetail,
      classification.taxCategory,
      input.isSmallMediumEnterprise,
    );
    // appliedRate echo — 혼합 시 0 (UI에서 "혼합" 라벨), 단일 시 첫 sub-lot 세율 또는 비대주주 단일 세율
    const firstNonZeroRate = lotMatchingDetail.matched.find((m) => m.appliedRate > 0)?.appliedRate ?? 0;
    rateResult = {
      appliedRate: splitTax.isMixedRate ? 0 : firstNonZeroRate,
      calculatedTax: splitTax.calculatedTax,
      progressiveDeduction: undefined,
      appliedRuleRef: STOCK.SECTION_104_1_11_GA_2_PROGRESSIVE,
      isShortTermRate: lotMatchingDetail.matched.some((m) => m.isShortTerm),
    };
    if (splitTax.mixedNote) warnings.push(splitTax.mixedNote);
  } else {
    rateResult = applyStockTaxRate(
      taxBase,
      classification.taxCategory,
      input.isSmallMediumEnterprise,
      isShortTermHolding,
      classification.isExempt, // 비과세 분기에서도 산식 echo
    );
  }

  // ──────────────────────────────────────────────────────────
  // STEP 9: 산출세액 (10원 미만 절사 §47①)
  // ──────────────────────────────────────────────────────────
  const calculatedTax = floorTen(rateResult.calculatedTax);

  // ──────────────────────────────────────────────────────────
  // STEP 10~12: Finalize (가산세·공제·지방세)
  // ──────────────────────────────────────────────────────────
  const finalizeResult = finalizeStockTax(calculatedTax, input);
  warnings.push(...(finalizeResult.appliedRules ?? []));

  // ──────────────────────────────────────────────────────────
  // STEP 12.5: 증권거래세 정보성 산출 (appended step)
  // 양도세와 별도 납부 의무 — 합산 금지 (정보성 echo)
  // applyExemptZeroing은 spread이므로 본 필드 자동 보존 (실측 확인)
  // ──────────────────────────────────────────────────────────
  const stxResult = calcSecuritiesTransactionTax(input, transferPrice);

  // ──────────────────────────────────────────────────────────
  // §104⑤ 본문 후단 — 8호·9호 **동일 자산 의제** 조정액 (안내 전용)
  // ──────────────────────────────────────────────────────────
  // 부동산 엔진과 주식 엔진이 분리돼 §104⑤이 교차 조합을 아우르지 못한다. 사용자가 부동산
  // 결과에서 「§104①8호 버킷 과세표준」을 옮겨 적으면, 이 종목의 9호분과 **한 버킷으로 합산**
  // 했을 때 늘어나는 세액을 계산해 **안내**한다.
  // ⚠️ **세액에 반영하지 않는다** — §104⑤은 전체 산출세액을 하나로 정하므로 조정액에 귀속이 없다.
  //   여기서 `calculatedTax`에 더하면 **주식 신고서 금액이 틀어진다**(계획서 §5-B G-4).
  // ⚠️ §104⑤**1호 비교는 하지 않는다**(G-5) — 반대편 과세표준 합계·산출세액이 필요해 입력이
  //   4칸이 된다. 결과 카드가 그 한계를 문구로 알린다.
  const cross1045Adjustment = NBL_HEAVY_CORP_CATEGORIES.has(classification.taxCategory)
    ? computeCross89Adjustment({
        clause8TaxBase: input.crossClause8TaxBase ?? 0,
        clause9TaxBase: taxBase,
        nbl89Brackets: NBL_HEAVY_CORP_BRACKETS,
      })
    : undefined;

  // §104⑤ **크로스 조정용 호별 echo**(C-3a / 2b-3) — 조건 없이 항상 싣는다.
  //
  // `cross1045Adjustment`는 사용자가 `crossClause8TaxBase`를 **입력했을 때만** 생기는데,
  // 이력 기반 교차 합산은 **입력 없이 저장된 결과만 읽어** 두 엔진을 합친다.
  // ⇒ 「이 종목이 §104①1호인가 9호인가 + 그 과세표준·세액」을 무조건 노출한다.
  //
  // 🔒 **기타자산(§94①4호)이고 비과세가 아닐 때만** 값이 실린다 — 주식(§94①3호)은 §104⑤ 본문이
  //   열거하지 않아 대상이 아니고, 비과세는 aggregate `computeOtherAssetComparativeTax`가
  //   `!r.isExempt`로 거르는 것과 규약을 맞춘다.
  const isOtherAssetTarget =
    classification.basicDeductionGroup === "real_estate_and_other_asset" &&
    !classification.isExempt;
  const isClause9 = isOtherAssetTarget && NBL_HEAVY_CORP_CATEGORIES.has(classification.taxCategory);
  const isClause1 = isOtherAssetTarget && !isClause9;

  // ──────────────────────────────────────────────────────────
  // 결과 조립
  // ──────────────────────────────────────────────────────────
  const fullResult: StockTransferResult = {
    ...(cross1045Adjustment ? { cross1045Adjustment } : {}),
    clause1BucketTaxBase: isClause1 ? taxBase : 0,
    clause1BucketTax: isClause1 ? calculatedTax : 0,
    clause9TaxBase: isClause9 ? taxBase : 0,
    clause9Tax: isClause9 ? calculatedTax : 0,
    taxCategory: classification.taxCategory,
    appliedSection94: classification.appliedSection94,
    section94_2Applied: classification.section94_2Applied,
    isExempt: false,
    exemptReason: undefined,

    transferPrice,
    transferPriceBreakdown,

    acquisitionPrice,
    acquisitionMode: input.acquisitionMode,
    usedEstimatedAcquisition,
    estimatedBase,
    estimatedDeduction,
    swapApplied,
    swapComparison,

    valuationDetail,
    marketSampleDetail,
    capitalAdjustmentsDetail,

    basicDeductionGroup: classification.basicDeductionGroup,

    expenses,
    expenseMode: input.expenseMode,

    transferIncome,
    basicDeduction,
    taxBase,

    appliedRate: rateResult.appliedRate,
    progressiveDeduction: rateResult.progressiveDeduction,
    calculatedTax,

    underReportPenalty: finalizeResult.underReportPenalty,
    latePaymentPenalty: finalizeResult.latePaymentPenalty,
    electronicFilingCredit: finalizeResult.electronicFilingCredit,

    finalTax: finalizeResult.finalTax,
    localIncomeTax: finalizeResult.localIncomeTax,

    holdingPeriodMonths: holdingResult.months,
    holdingPeriodDays: holdingResult.days,
    isShortTermHolding,

    lthdStartDate: null,

    appliedThreshold: buildAppliedThreshold(input, classification),

    warnings,
    appliedRules,
    lotMatchingDetail,
    lotCapitalAdjustmentsDetail,
    // Round 4 C-02·C-04: 취득 후 상장 환산 echo (UI 결과 카드 게이트용)
    acquiredBeforeListing: input.acquiredBeforeListing,
    postListingDetail,
    // STEP 12.5: 증권거래세 정보성 echo (설계 E5-ⓐ)
    securitiesTransactionTax: stxResult,
  };

  // 비과세 분기(listed_non_major_in_market) zero-out — 최종 세액·가산세만 0,
  // 중간 산식값(transferPrice·acquisitionPrice·taxBase·calculatedTax 등)은 echo
  if (classification.isExempt) {
    return applyExemptZeroing(fullResult, classification);
  }
  return fullResult;
}

// [GAP-B] buildExemptResult + calcTransferPriceSimple → stock-transfer-exempt-result.ts로 분리
//         800줄 정책 준수. import 후 그대로 호출.

// [D-1] 다자산 합산 엔진 → stock-transfer-aggregate.ts로 분리 (800줄 정책).
//       외부 import 경로 보존을 위해 re-export (import 무변경).
export {
  calculateStockTransferTaxAggregate,
  type StockTransferAggregateResult,
  type OtherAssetComparativeTax,
} from "./stock-transfer-aggregate";

