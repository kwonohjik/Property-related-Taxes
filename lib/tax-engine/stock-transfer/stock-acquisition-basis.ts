/**
 * 주식 양도소득세 — **STEP 3 취득가액 결정** (오케스트레이터에서 분리)
 *
 * `acquisitionMode` 4종(actual / face_value / estimated / sale_case)과
 * 환산(`estimated`) 하위 **5분기**(취득후상장 · 거래정지(양도) · 비상장 보충평가 ·
 * 취득일 거래정지 · 상장 1개월 종가평균)를 모두 여기서 가른다.
 *
 * [800줄 정책 분할 2026-08-11] `stock-transfer-tax.ts`(793줄)에서 추출했다.
 * **로직은 한 줄도 바꾸지 않았다** — `appliedRules`/`warnings` 직접 push를
 * delta 배열 반환으로 돌린 것이 유일한 차이다(호출부가 기존 순서대로 병합한다).
 *
 * ⚠️ §97의2① 이월과세의 **취득측 오버라이드**(`acquisitionStdPriceOverridePerShare`)가
 *    이 파일의 환산 분기 3곳과 `stock-valuation-unlisted.ts` 2곳에 걸려 있다.
 *    분기를 늘릴 때 오버라이드를 빠뜨리면 이월과세 환산이 **조용히 수증자 기준**이 된다.
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음.
 */

import type { StockTransferInput, StockTransferResult, LotMatchingDetail } from "./types/stock-transfer.types";
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
import { apply163_9Conversion, resolveTransferStd } from "./apply-163-9-conversion";
import { STOCK_ESTIMATED_EXPENSE_RATE } from "@/lib/tax-engine/legal-codes/stock";

export interface AcquisitionBasisResult {
  acquisitionPrice: number;
  usedEstimatedAcquisition: boolean;
  estimatedBase: number | undefined;
  estimatedDeduction: number | undefined;
  valuationDetail: StockTransferResult["valuationDetail"] | undefined;
  postListingDetail: PostListingValuationResult | undefined;
  /** 호출부가 기존 순서대로 `appliedRules`에 병합한다 */
  appliedRulesDelta: StockTransferResult["appliedRules"];
  /** 호출부가 기존 순서대로 `warnings`에 병합한다 */
  warningsDelta: string[];
}

/**
 * STEP 3 — 취득가액·개산공제 산정.
 *
 * @param transferPrice      STEP 2에서 확정된 양도가액 (환산의 분자로 쓰인다)
 * @param lotMatchingDetail  split 모드 매칭 결과 (있으면 lot 합계를 그대로 쓴다)
 */
export function resolveAcquisitionBasis(
  input: StockTransferInput,
  transferPrice: number,
  lotMatchingDetail: LotMatchingDetail | undefined,
): AcquisitionBasisResult {
  const { shareCount } = input;
  const appliedRulesDelta: StockTransferResult["appliedRules"] = [];
  const warningsDelta: string[] = [];

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
    appliedRulesDelta.push("장부분실액면가");

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
      appliedRulesDelta.push("80%하한");
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
      // §97의2①1호 — 이월과세면 분자를 **증여자 취득 당시** 기준시가로 대체한다.
      const acqStdPerShare =
        input.acquisitionStdPriceOverridePerShare ?? postListingResult.finalPerShareValue;
      // §176의2②1호 환산 — transferStd 미입력 시 1주당 양도가 자동 fallback
      const { transferStd, usedFallback } = resolveTransferStd(transferPrice, shareCount, input.transferDatePriceAvg1Month);
      if (usedFallback) warningsDelta.push("양도일 이전 1개월 종가평균 미입력 — 1주당 양도가를 §176의2②1호 환산 분모로 자동 사용");
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
        if (!warningsDelta.includes(rule)) warningsDelta.push(rule);
      }
      warningsDelta.push(...postListingResult.warnings);

      if (postListingResult.monthlyAccrualApplied) {
        appliedRulesDelta.push("월할가산");
      }

    } else if (input.tradingHaltAtTransfer) {
      // 거래정지·관리종목 → 비상장 보충 평가 우회 (§165③)
      appliedRulesDelta.push("거래정지우회");
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
        acquisitionNetAssetFloorApplied: unlistedResult.acquisitionNetAssetFloorApplied,
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
        appliedRulesDelta.push("80%하한");
      }
      if (unlistedResult.netAssetOnlyReason) {
        appliedRulesDelta.push("80%하한미적용");
      }
      if (unlistedResult.section1659Detail) {
        appliedRulesDelta.push("월할가산");
      }
      warningsDelta.push(...unlistedResult.warnings);
      for (const rule of unlistedResult.appliedRules) {
        if (!appliedRulesDelta.includes(rule as typeof appliedRulesDelta[number])) {
          // 문자열 규칙은 warnings로 전달
          warningsDelta.push(rule);
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
        acquisitionNetAssetFloorApplied: unlistedResult.acquisitionNetAssetFloorApplied,
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
        appliedRulesDelta.push("80%하한");
      }
      if (unlistedResult.netAssetOnlyReason) {
        appliedRulesDelta.push("80%하한미적용");
      }
      if (unlistedResult.section1659Detail) {
        appliedRulesDelta.push("월할가산");
      }
      warningsDelta.push(...unlistedResult.warnings);
      for (const rule of unlistedResult.appliedRules) {
        warningsDelta.push(rule); // 비타입 문자열 규칙은 warnings로 전달
      }

    } else if (input.tradingHaltAtAcquisition) {
      // [C-1] 취득일 거래정지 — 취득시 기준시가만 §165④ 보충 평가 (소령 §165③ 후문, §165⑤ 비적용 판정)
      // 분모(양도시)는 1개월 종가평균 유지. unlisted 분기 뒤 배치 = 상장만 도달 (M-5 가드)
      appliedRulesDelta.push("취득일거래정지우회");
      const acqSideRaw = calcAcquisitionStdPerShareSupplementary(input);
      // §97의2①1호 — 이월과세면 취득측을 **증여자 취득 당시** 기준시가로 대체한다.
      const acqSide =
        input.acquisitionStdPriceOverridePerShare !== undefined
          ? { ...acqSideRaw, perShare: input.acquisitionStdPriceOverridePerShare }
          : acqSideRaw;
      const haltTransferStd = Math.floor(input.transferDatePriceAvg1Month ?? 0);
      if (acqSide.perShare <= 0 || haltTransferStd <= 0) {
        // division 가드 — validate 우회(엔진 직접 호출) 방어
        acquisitionPrice = 0;
        estimatedBase = 0;
        warningsDelta.push(
          haltTransferStd <= 0
            ? "양도일 이전 1개월 종가평균이 0 이하 — 환산취득가 산출 불가"
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
        // §165④1 단서 실제 발동 여부 — 하드코딩 false 였다(하한이 걸려도 결과뷰·신고서가 계속 false).
        netAssetFloorApplied: acqSide.floorApplied,
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
      warningsDelta.push(...acqSide.warnings);
      for (const rule of acqSide.appliedRules) {
        warningsDelta.push(rule); // 비타입 문자열 규칙(법령 인용)은 warnings로 전달
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
      // 입력 누락 방어 분기의 사유를 응답에 남긴다 — 형제 분기(취득일 거래정지·비상장 보충평가)와 대칭.
      warningsDelta.push(...listedResult.warnings);
      // [B-4 M-8 §165⑨] 상장 종가평균 양도·취득 동일 — §81④ 2호(보정 없음) 정보성 안내.
      // §81④ 1호 산식은 사업연도 기준시가 모수라 상장(§99①3 종가평균) 미적용.
      if (
        listedResult.perShareTransferStdPrice > 0 &&
        listedResult.perShareTransferStdPrice === listedResult.perShareAcquisitionStdPrice
      ) {
        warningsDelta.push("§165⑨ — 상장 양도·취득 종가평균이 동일합니다(§81④ 2호, 보정 없음).");
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

  /**
   * [부담부증여 §159①] 개산공제 base에만 채무비율(B/C)을 안분한다.
   *
   * `acquisitionPrice`는 어느 환산 분기에서든 `transferPrice`(=채무 B) 기반이라 이미
   * 안분돼 있지만, `estimatedBase`는 **취득 당시 기준시가 × 전체 주식수**라 안분이 없다.
   * 종전에는 이 보정이 비상장 분기 **안쪽**에만 있어 상장 환산의 개산공제가 C/B배 과대였다
   * (부담부증여 상장 경로가 종가평균을 못 보내 취득가액이 0인 동안 가려져 있었다).
   * 분기별로 두면 새 환산 분기가 생길 때마다 같은 누락이 재발하므로 **합류 지점 1곳**에 둔다.
   */
  if (
    estimatedBase !== undefined &&
    input.burdenedGiftDebtRatio !== undefined &&
    input.burdenedGiftDebtRatio > 0 &&
    input.burdenedGiftDebtRatio < 1
  ) {
    estimatedBase = Math.floor(estimatedBase * input.burdenedGiftDebtRatio);
  }

  // 개산공제 계산 (취득기준시가 총액 × 1%) — §163⑥4
  // ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가가 아님)
  if (usedEstimatedAcquisition && estimatedBase !== undefined && estimatedBase > 0) {
    estimatedDeduction = Math.floor(estimatedBase * STOCK_ESTIMATED_EXPENSE_RATE);
  }


  return {
    acquisitionPrice,
    usedEstimatedAcquisition,
    estimatedBase,
    estimatedDeduction,
    valuationDetail,
    postListingDetail,
    appliedRulesDelta,
    warningsDelta,
  };
}
