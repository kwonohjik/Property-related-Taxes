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

import type { StockTransferInput, StockTransferResult } from "./types/stock-transfer.types";
import { classifyStockTransfer } from "./stock-classification";
import { calcHoldingPeriod, calcBasicDeduction, floorTaxBase, floorTen, applyDeemedAcquisitionDate, buildAppliedThreshold } from "./stock-transfer-helpers";
import { calcPostListingConversion } from "./stock-valuation-post-listing";
import { calcListedValuation } from "./stock-valuation-listed";
import {
  calcUnlistedValuation,
  calcFaceValueTransferEstimated,
  calcTransferStdPriceForFaceValue,
} from "./stock-valuation-unlisted";
import { applyStockTaxRate } from "./stock-transfer-rate-calc";
import { finalizeStockTax } from "./stock-transfer-finalize";
import { STOCK, STOCK_ESTIMATED_EXPENSE_RATE } from "@/lib/tax-engine/legal-codes/stock";

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

  // 비과세 조기 반환
  if (classification.isExempt) {
    return buildExemptResult(input, classification);
  }

  // ──────────────────────────────────────────────────────────
  // STEP 2: 양도가액 결정 (취득가액 환산 계산을 위해 먼저 산출)
  // ──────────────────────────────────────────────────────────
  let transferPrice = 0;
  let transferPriceBreakdown: StockTransferResult["transferPriceBreakdown"];
  const { shareCount } = input;

  if (input.transferPriceMode === "actual") {
    transferPrice = (input.perShareTransferPrice ?? 0) * shareCount;
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
  let estimatedDeduction: number | undefined;
  let valuationDetail: StockTransferResult["valuationDetail"] | undefined;

  const { acquisitionMode } = input;

  if (acquisitionMode === "actual") {
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
      // 취득 후 상장 — §165⑤ 단서 환산비율
      const postListingResult = calcPostListingConversion(input);
      acquisitionPrice = postListingResult.totalAcquisitionPrice;
      // 취득 후 상장: estimatedBase = 취득기준시가 총액 = 1주당 취득기준시가 × 주식수
      estimatedBase = postListingResult.finalPerShareValue * shareCount;

      valuationDetail = {
        method: "post_listing_conversion",
        netAssetFloorApplied: false,
        finalPerShareValue: postListingResult.finalPerShareValue,
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
        method: unlistedResult.method === "net_asset_only" ? "net_asset_only" : "weighted_avg",
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
      // 상장 — 1개월 종가평균
      const listedResult = calcListedValuation(input);
      acquisitionPrice = listedResult.totalAcquisitionPrice;
      // 상장 1개월 종가평균: 취득기준시가 = 1주당 평균가 × 주식수
      estimatedBase = listedResult.perShareValue * shareCount;
      valuationDetail = {
        method: "monthly_avg_listed",
        netAssetFloorApplied: false,
        finalPerShareValue: listedResult.perShareValue,
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
  // ──────────────────────────────────────────────────────────
  let expenses = 0;
  const { expenseMode } = input;

  if (expenseMode === "actual") {
    expenses = input.actualExpenses ?? 0;
  } else {
    // 개산공제 — estimatedDeduction 사용
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

  const rateResult = applyStockTaxRate(
    taxBase,
    classification.taxCategory,
    input.isSmallMediumEnterprise,
    isShortTermHolding,
  );

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
  return {
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
  };
}

// ============================================================
// 비과세 결과 조립 (조기 반환용)
// ============================================================

function buildExemptResult(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult {
  return {
    taxCategory: classification.taxCategory,
    appliedSection94: classification.appliedSection94,
    section94_2Applied: classification.section94_2Applied,
    isExempt: true,
    exemptReason: classification.exemptReason,

    transferPrice: calcTransferPriceSimple(input),
    transferPriceBreakdown: undefined,

    acquisitionPrice: 0,
    acquisitionMode: input.acquisitionMode,
    usedEstimatedAcquisition: false,
    estimatedBase: undefined,
    estimatedDeduction: undefined,

    valuationDetail: undefined,

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
  };
}

function calcTransferPriceSimple(input: StockTransferInput): number {
  if (input.transferPriceMode === "actual") {
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
