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
import { STOCK, STOCK_ESTIMATED_EXPENSE_RATE } from "@/lib/tax-engine/legal-codes/stock";
import { allocateLots } from "./lot-allocation";
import { calcSplitModeTax } from "./lot-allocation-tax";
import { computeInformationalAcquisition } from "./exempt-informational-acquisition";
import { applyExemptZeroing } from "./apply-exempt-zeroing";
import { apply163_9Conversion, resolveTransferStd } from "./apply-163-9-conversion";

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

export function calculateStockTransferTax(input: StockTransferInput): StockTransferResult {
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
  if (isSplitMode(input)) {
    const isMajorAndNonSME =
      !input.isSmallMediumEnterprise &&
      (classification.taxCategory === "listed_major" ||
        classification.taxCategory === "unlisted_major");
    lotMatchingDetail = allocateLots(
      input.acquisitionLots!,
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
    if (actualMode === "total") {
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
      // 취득 후 상장 — §165⑤ 본문 (1주당 취득기준시가) + §163⑨ 환산
      // §165⑤: 1주당 취득기준시가 = 상장일 이후 1개월 종가평균 × (취득연도/상장연도 가중평균)
      // §163⑨: 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
      const postListingResult = calcPostListingConversion(synthesizePostListingInput(input));
      const acqStdPerShare = postListingResult.finalPerShareValue;
      // §163⑨ 환산 — transferStd 미입력 시 1주당 양도가 자동 fallback
      const { transferStd, usedFallback } = resolveTransferStd(transferPrice, shareCount, input.transferDatePriceAvg1Month);
      if (usedFallback) warnings.push("양도일 직전 1개월 종가평균 미입력 — 1주당 양도가를 §163⑨ 환산 분모로 자동 사용");
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
      // 상장 — 1개월 종가평균 환산 (시행령 §163⑨ 직접 적용)
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
    // 매매사례가액
    acquisitionPrice = (input.perShareAcquisitionPrice ?? 0) * shareCount;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue: input.perShareAcquisitionPrice ?? 0,
    };

  } else {
    // appraisal — 감정평가액
    acquisitionPrice = (input.perShareAcquisitionPrice ?? 0) * shareCount;
    valuationDetail = {
      method: "actual_acquisition",
      netAssetFloorApplied: false,
      finalPerShareValue: input.perShareAcquisitionPrice ?? 0,
    };
  }

  // 개산공제 계산 (취득기준시가 총액 × 1%) — §163⑥4
  // ★ PR-2 정정: estimatedBase = 취득기준시가 총액 (환산취득가가 아님)
  if (usedEstimatedAcquisition && estimatedBase !== undefined && estimatedBase > 0) {
    estimatedDeduction = Math.floor(estimatedBase * STOCK_ESTIMATED_EXPENSE_RATE);
  }

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
  let splitModeMixedRate = false;
  if (lotMatchingDetail) {
    // split 모드 — sub-lot별 안분 + 세율 적용 + 합산
    const splitTax = calcSplitModeTax(
      taxBase,
      lotMatchingDetail,
      classification.taxCategory,
      input.isSmallMediumEnterprise,
    );
    splitModeMixedRate = splitTax.isMixedRate;
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
    // Round 4 C-02·C-04: 취득 후 상장 환산 echo (UI 결과 카드 게이트용)
    acquiredBeforeListing: input.acquiredBeforeListing,
    postListingDetail,
  };

  // 비과세 분기(listed_non_major_in_market) zero-out — 최종 세액·가산세만 0,
  // 중간 산식값(transferPrice·acquisitionPrice·taxBase·calculatedTax 등)은 echo
  if (classification.isExempt) {
    return applyExemptZeroing(fullResult, classification);
  }
  return fullResult;
}

// ============================================================
// 비과세 결과 조립 (K-OTC 비과세 분기 전용 — 기존 호환)
// ============================================================

function buildExemptResult(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult {
  // 비과세 분기에서도 split 모드면 lotMatchingDetail 검산용 echo
  let lotMatchingDetail: LotMatchingDetail | undefined;
  if (isSplitMode(input)) {
    lotMatchingDetail = allocateLots(
      input.acquisitionLots!,
      input.transferLots!,
      input.costAllocationMethod!,
      false, // 비과세 분기에서 단기 30% 게이트 무의미
      input.isSmallMediumEnterprise,
      input.specificMatchings,
    );
  }

  // 비과세더라도 사용자가 입력한 데이터로 취득가액·평가 상세를 정보용으로 계산해 echo (실 세액은 0 유지)
  const transferPrice = calcTransferPriceSimple(input);
  const info = computeInformationalAcquisition(input, transferPrice, lotMatchingDetail);

  return {
    taxCategory: classification.taxCategory,
    appliedSection94: classification.appliedSection94,
    section94_2Applied: classification.section94_2Applied,
    isExempt: true,
    exemptReason: classification.exemptReason,

    transferPrice,
    transferPriceBreakdown: undefined,

    acquisitionPrice: info.acquisitionPrice,
    acquisitionMode: input.acquisitionMode,
    usedEstimatedAcquisition: info.usedEstimatedAcquisition,
    estimatedBase: info.estimatedBase,
    estimatedDeduction: undefined,

    valuationDetail: info.valuationDetail,

    basicDeductionGroup: classification.basicDeductionGroup,

    expenses: 0,
    expenseMode: input.expenseMode,

    transferIncome: 0,
    basicDeduction: 0,
    taxBase: 0,

    appliedRate: 0,
    progressiveDeduction: undefined,
    calculatedTax: 0,

    underReportPenalty: 0,
    latePaymentPenalty: 0,
    electronicFilingCredit: 0,

    finalTax: 0,
    localIncomeTax: 0,

    holdingPeriodMonths: 0,
    holdingPeriodDays: 0,
    isShortTermHolding: false,

    lthdStartDate: null,

    appliedThreshold: buildAppliedThreshold(input, classification),

    warnings: classification.warnings,
    appliedRules: classification.appliedRules,
    // Round 4 C-02: 비과세 분기에서도 echo (UI 결과 카드 게이트 일관성)
    acquiredBeforeListing: input.acquiredBeforeListing,
  };
}

function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
    const actualMode = input.transferActualInputMode ?? "per_share";
    if (actualMode === "total") return input.transferTotalPrice ?? 0;
    return (input.perShareTransferPrice ?? 0) * input.shareCount;
  }
  return (
    (input.exchangePropertyValue ?? 0) +
    (input.exchangeDebtRelief ?? 0) +
    (input.exchangeCash ?? 0)
  );
}

// ============================================================
// 다자산 합산 결과 타입
// ============================================================

export interface StockTransferAggregateResult {
  /** 종목별 단건 결과 배열 */
  items: StockTransferResult[];
  /** 합산 양도소득금액 */
  totalTransferIncome: number;
  /**
   * 그룹별 기본공제 합계
   * - stock: §103②2호 그룹 (주식 §94①3 가·나목)
   * - real_estate_and_other_asset: §103②1호 그룹 (기타자산 §94①4)
   */
  basicDeductionByGroup: {
    stock: number;
    real_estate_and_other_asset: number;
  };
  /** 합산 과세표준 (그룹별 기본공제 1회 적용 후) */
  totalTaxBase: number;
  /** 합산 산출세액 */
  totalCalculatedTax: number;
  /** 합산 가산세 */
  totalUnderReportPenalty: number;
  /** 합산 전자신고 공제 (전체 1회) */
  electronicFilingCredit: number;
  /** 합산 최종세액 */
  totalFinalTax: number;
  /** 합산 지방소득세 */
  totalLocalIncomeTax: number;
}

/**
 * 다자산 합산 계산 — §103② 기본공제 그룹별 1회 한도 적용
 *
 * "aggregate" 모드:
 *   1. 각 종목 단건 계산 (realEstateGroupBasicDeductionUsed 연동)
 *   2. 그룹별 기본공제를 250만원 한도 내에서 배분
 *   3. 합산 세액은 단건 세액 합계 (그룹별 기본공제 중복 없음)
 *
 * "each_item" 모드:
 *   - 각 종목 그대로 합산 (기본공제 중복 가능 — 단건 계산 보조용)
 */
export function calculateStockTransferTaxAggregate(
  inputs: StockTransferInput[],
  deductionMode: "each_item" | "aggregate" = "aggregate",
): StockTransferAggregateResult {
  const BASIC_DEDUCTION_LIMIT = 2_500_000;

  if (deductionMode === "each_item" || inputs.length === 1) {
    // 단건 또는 each_item 모드 — 개별 계산 합산
    const items = inputs.map((input) => calculateStockTransferTax(input));
    const totalTransferIncome = items.reduce((s, r) => s + r.transferIncome, 0);
    const totalCalculatedTax = items.reduce((s, r) => s + r.calculatedTax, 0);
    const totalUnderReportPenalty = items.reduce((s, r) => s + r.underReportPenalty, 0);
    const electronicFilingCredit = items.some((r) => r.electronicFilingCredit > 0)
      ? 20_000
      : 0;
    const totalFinalTax = Math.max(
      0,
      totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit,
    );
    const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

    return {
      items,
      totalTransferIncome,
      basicDeductionByGroup: {
        stock: items
          .filter((r) => r.basicDeductionGroup === "stock")
          .reduce((s, r) => s + r.basicDeduction, 0),
        real_estate_and_other_asset: items
          .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
          .reduce((s, r) => s + r.basicDeduction, 0),
      },
      totalTaxBase: items.reduce((s, r) => s + r.taxBase, 0),
      totalCalculatedTax,
      totalUnderReportPenalty,
      electronicFilingCredit,
      totalFinalTax,
      totalLocalIncomeTax,
    };
  }

  // "aggregate" 모드 — §103② 그룹별 기본공제 1회 한도 배분
  // STEP 1: 각 종목 기본공제 최대 소진으로 단건 계산 (순수 소득금액 파악)
  const rawItems = inputs.map((input) =>
    calculateStockTransferTax({
      ...input,
      // 부동산 그룹은 이미 소진됨으로 처리 → 실질적 기본공제 0
      realEstateGroupBasicDeductionUsed: BASIC_DEDUCTION_LIMIT,
    }),
  );

  // STEP 2: 그룹별 소득금액 합산
  const stockGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "stock")
    .reduce((s, r) => s + r.transferIncome, 0);

  const otherAssetGroupIncome = rawItems
    .filter((r) => r.basicDeductionGroup === "real_estate_and_other_asset")
    .reduce((s, r) => s + r.transferIncome, 0);

  const stockBasicDeduction = Math.min(Math.max(0, stockGroupIncome), BASIC_DEDUCTION_LIMIT);
  const otherAssetBasicDeduction = Math.min(
    Math.max(0, otherAssetGroupIncome),
    BASIC_DEDUCTION_LIMIT,
  );

  // STEP 3: 종목별 기본공제 순차 배분 후 재계산
  //
  // §103② 기본공제는 그룹별 연간 1회 250만원.
  // 입력 순서 기준 앞 종목부터 최대 소진.
  //
  // 주식 그룹(그룹2):
  //   - 엔진 내부 calcBasicDeduction은 "stock" 그룹을 항상 min(income, 250만) 적용
  //   - realEstateGroupBasicDeductionUsed로 제어 불가 (별도 그룹)
  //   - 해결: 첫 종목은 input 그대로(기본공제 full), 나머지는 transferIncome을
  //     "이전 소진량만큼 빼서" 과표를 조정한 결과를 rawItems[i] 기반으로 패치
  //
  // 기타자산 그룹(그룹1):
  //   - realEstateGroupBasicDeductionUsed로 직접 제어 가능

  let stockUsed = 0;        // 주식 그룹 기본공제 누적 사용량
  let otherAssetUsed = 0;   // 기타자산 그룹 누적 사용량

  const processedItems = inputs.map((input, i) => {
    const r = rawItems[i];
    if (r.isExempt) return r;

    const income = r.transferIncome;

    if (r.basicDeductionGroup === "stock") {
      // 이 종목에서 실제 적용할 기본공제
      const remaining = Math.max(0, BASIC_DEDUCTION_LIMIT - stockUsed);
      const deductThis = Math.min(Math.max(0, income), remaining);
      stockUsed += deductThis;

      if (stockUsed - deductThis === 0 || deductThis > 0) {
        // 기본공제 잔여분 있음 → input 그대로 계산 (엔진이 min(income, 250만) 적용)
        return calculateStockTransferTax(input);
      } else {
        // 기본공제 소진 → rawItems[i]가 이미 realEstateGroupBasicDeductionUsed=LIMIT으로 계산됨
        // 하지만 주식 그룹은 그 영향 안 받음 → rawItems[i]에는 basicDeduction=min(income,250만) 포함
        // → 수동 패치: rawItems[i] 결과에서 basicDeduction을 0으로, taxBase를 income으로 재조정
        // → 세율·산출세액을 다시 applyStockTaxRate로 계산
        const taxBaseWithoutDeduction = Math.floor(Math.max(0, income));
        const rateResult = applyStockTaxRate(
          taxBaseWithoutDeduction,
          r.taxCategory,
          input.isSmallMediumEnterprise,
          r.isShortTermHolding,
          r.isExempt, // 비과세 분기 산식 echo
        );
        const newCalculatedTax = floorTen(rateResult.calculatedTax);
        const newFinalize = finalizeStockTax(newCalculatedTax, input);
        return {
          ...r,
          basicDeduction: 0,
          taxBase: taxBaseWithoutDeduction,
          appliedRate: rateResult.appliedRate,
          progressiveDeduction: rateResult.progressiveDeduction,
          calculatedTax: newCalculatedTax,
          underReportPenalty: newFinalize.underReportPenalty,
          latePaymentPenalty: newFinalize.latePaymentPenalty,
          electronicFilingCredit: newFinalize.electronicFilingCredit,
          finalTax: newFinalize.finalTax,
          localIncomeTax: newFinalize.localIncomeTax,
        };
      }
    } else {
      // 기타자산 그룹: realEstateGroupBasicDeductionUsed로 직접 제어
      const adjustedInput: StockTransferInput = {
        ...input,
        realEstateGroupBasicDeductionUsed: otherAssetUsed,
      };
      const recalc = calculateStockTransferTax(adjustedInput);
      otherAssetUsed += recalc.basicDeduction;
      return recalc;
    }
  });

  const totalTransferIncome = processedItems.reduce((s, r) => s + r.transferIncome, 0);
  const totalCalculatedTax = processedItems.reduce((s, r) => s + r.calculatedTax, 0);
  const totalUnderReportPenalty = processedItems.reduce((s, r) => s + r.underReportPenalty, 0);

  // 전자신고 공제는 합산 1회
  const anyElectronic = inputs.some((inp) => inp.isElectronicFiling);
  const electronicFilingCredit = anyElectronic && totalCalculatedTax > 0 ? 20_000 : 0;

  const totalFinalTax = Math.max(
    0,
    Math.floor((totalCalculatedTax + totalUnderReportPenalty - electronicFilingCredit) / 10) * 10,
  );
  const totalLocalIncomeTax = Math.floor((totalCalculatedTax * 0.10) / 10) * 10;

  return {
    items: processedItems,
    totalTransferIncome,
    basicDeductionByGroup: {
      stock: stockBasicDeduction,
      real_estate_and_other_asset: otherAssetBasicDeduction,
    },
    totalTaxBase: processedItems.reduce((s, r) => s + r.taxBase, 0),
    totalCalculatedTax,
    totalUnderReportPenalty,
    electronicFilingCredit,
    totalFinalTax,
    totalLocalIncomeTax,
  };
}
