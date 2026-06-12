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
import { calcPostListingConversion } from "./stock-valuation-post-listing";
import type { PostListingValuationResult } from "./stock-valuation-post-listing";
import { synthesizePostListingInput } from "./post-listing-flat-adapter";
import { calcListedValuation } from "./stock-valuation-listed";
import {
  calcUnlistedValuation,
  calcFaceValueTransferEstimated,
  calcTransferStdPriceForFaceValue,
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
      valuationDetail = {
        method: "weighted_avg",
        netAssetFloorApplied: unlistedResult.netAssetFloorApplied,
        netAssetFloorValue: unlistedResult.netAssetFloorValue,
        finalPerShareValue: unlistedResult.perShareValue,
      };
      if (unlistedResult.netAssetFloorApplied) {
        appliedRules.push("80%하한");
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
      };
      if (unlistedResult.netAssetFloorApplied) {
        appliedRules.push("80%하한");
      }
      if (unlistedResult.netAssetOnlyReason) {
        appliedRules.push("80%하한미적용");
      }
      warnings.push(...unlistedResult.warnings);
      for (const rule of unlistedResult.appliedRules) {
        warnings.push(rule); // 비타입 문자열 규칙은 warnings로 전달
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
  //   ★ Bug-B 정정: 환산취득가 모드는 시행령 §163⑥4에 따라 개산공제(취득기준시가×1%) 강제
  //   사용자가 expenseMode="actual"로 두어도 환산 모드에서는 무시되고 개산공제만 적용.
  //   (§97② 단서 swap은 KoreanLaw 검증 후 후속 PR 검토 — 본 PR에서는 미적용)
  // ──────────────────────────────────────────────────────────
  let expenses = 0;
  const { expenseMode } = input;

  if (usedEstimatedAcquisition && estimatedDeduction !== undefined && estimatedDeduction > 0) {
    expenses = estimatedDeduction;
    if (expenseMode === "actual" && (input.actualExpenses ?? 0) > 0) {
      warnings.push(
        "환산취득가 모드에서는 §163⑥4 개산공제(취득기준시가×1%)가 자동 적용됩니다 — 실비 입력값은 무시됩니다."
      );
    }
  } else if (expenseMode === "actual") {
    expenses = input.actualExpenses ?? 0;
  } else {
    expenses = estimatedDeduction ?? 0;
  }

  // ──────────────────────────────────────────────────────────
  // STEP 5: 양도소득금액
  // ──────────────────────────────────────────────────────────
  const transferIncome = transferPrice - acquisitionPrice - expenses;

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
  // 결과 조립
  // ──────────────────────────────────────────────────────────
  const fullResult: StockTransferResult = {
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
} from "./stock-transfer-aggregate";

