/**
 * 증여세 메인 계산 엔진 (상증법 §31~§59)
 *
 * 계산 파이프라인 (Phase A — donor 식별자·§58 안분 한도·§57 한도 산식 적용):
 *   1. 재산 평가 (property-valuation.ts)
 *   2. 비과세 차감 (exemption-evaluator.ts)
 *   3. 동일인 10년 합산 (§47 ② 그룹화) — gift-prior-aggregation.ts
 *   4. 증여재산공제 (§53·§53의2)
 *   5. 과세표준 (50만원 미만이면 0)
 *   6. 산출세액 ⑦ (§56 = §26 준용)
 *   7. 세대생략 할증 ⑧⑨⑩⑪⑫⑬ (§57 + 한도 안분)
 *   8. 세액공제 ⑭⑮⑯⑰ (§58 안분 한도 + §69)
 *   9. 결정세액 ⑫(사례1) 또는 ⑱(사례2)
 *  10. filingFormRows 빌드 (12행 또는 18행)
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당).
 */

import { GIFT as GIFT_LAW } from "./legal-codes";
import type {
  GiftTaxInput,
  GiftTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

import { evaluateAllEstateItems, resolveValuationMethod } from "./property-valuation";
import { evaluateExemptions } from "./exemption-evaluator";
import { calcGiftDeductions } from "./deductions/gift-deductions";
import { calcAppraisalFeeDeduction } from "./deductions/appraisal-fee-deduction";
import { calcInstallmentSplit } from "./credits/installment-split";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  calcGiftGenerationSkipSurchargeWithLimit,
} from "./inheritance-gift-common";
import {
  aggregatePriorGiftsForGift,
  getDonorGroup,
} from "./gift-prior-aggregation";
import { safeMultiplyThenDivide } from "./tax-utils";
import { calcGiftTaxCredits } from "./inheritance-gift-tax-credit";
import { buildFilingFormRows } from "./gift-filing-form-rows";
import { buildBesshi10Rows } from "./gift-tax-filing-form-besshi10";
import type { TaxBracket } from "./types";

// ============================================================
// 증여세 과세표준 최소값 (§55 단서)
// ============================================================

const TAX_BASE_MIN = 500_000;

// ============================================================
// 증여세 메인 계산
// ============================================================

export interface GiftTaxEngineOptions {
  brackets?: TaxBracket[];
  /** @deprecated 도달 불가 — 미사용 (gift §59 한도 미적용). */
  foreignPropertyRatio?: number;
}

export function calcGiftTax(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions = {},
): GiftTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;
  const appliedLawDate = input.giftDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([GIFT_LAW.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(input.giftItems);
  const grossGiftValue = valuationResults.reduce(
    (sum, v) => sum + v.valuatedAmount,
    0,
  );
  allBreakdown.push({
    label: "증여재산 평가액 합계 ①",
    amount: grossGiftValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
  });
  for (const vr of valuationResults) {
    allWarnings.push(...vr.warnings);
  }

  // ─────────────────────────────────────────────
  // STEP 2: 비과세 차감
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  if (input.exemptions && input.exemptions.length > 0) {
    const { totalExemptAmount, breakdown: exemptBreakdown } =
      evaluateExemptions(input.exemptions, grossGiftValue);
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // ─────────────────────────────────────────────
  // STEP 3: §47 ② 동일인 합산 (donor 그룹화)
  // ─────────────────────────────────────────────
  const priorAggregation = aggregatePriorGiftsForGift(
    input.priorGiftsWithin10Years,
    input.giftDate,
    input.donor,
  );
  allBreakdown.push(...priorAggregation.breakdown);
  allWarnings.push(...priorAggregation.warnings);
  allLaws.add(GIFT_LAW.AGGREGATION_SAME_PERSON);

  const netCurrentGiftValue = Math.max(0, grossGiftValue - exemptAmount);
  const aggregatedGiftValue =
    netCurrentGiftValue + priorAggregation.totalAmount;

  allBreakdown.push({
    label: "10년 합산 증여가액 ③",
    amount: aggregatedGiftValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
    note: `금번 ${netCurrentGiftValue.toLocaleString()} + 기증여 ${priorAggregation.totalAmount.toLocaleString()}`,
  });

  // ─────────────────────────────────────────────
  // STEP 4: 증여재산공제 ④ (§53·§53의2)
  // ─────────────────────────────────────────────
  const deductionResult = calcGiftDeductions(
    input.deductionInput,
    aggregatedGiftValue,
  );
  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 5: 과세표준 ⑤ (§55 ② — §55① 감정평가수수료 차감, 시행령 §46의2 → §20의3 준용)
  // ─────────────────────────────────────────────
  const hasAppraisalValuation = input.giftItems.some(
    (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
  );
  const appraisalFee = calcAppraisalFeeDeduction(input.appraisalFee, {
    hasAppraisalValuation,
    taxType: "gift",
  });
  const rawTaxBase = Math.max(
    0,
    aggregatedGiftValue - totalDeduction - appraisalFee.total,
  );
  const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;
  if (appraisalFee.total > 0) {
    allBreakdown.push({
      label: "감정평가수수료 공제",
      amount: -appraisalFee.total,
      lawRef: GIFT_LAW.APPRAISAL_FEE,
    });
    allLaws.add(GIFT_LAW.APPRAISAL_FEE);
  }
  allBreakdown.push({
    label: "증여세 과세표준 ⑤",
    amount: taxBase,
    lawRef: GIFT_LAW.TAX_BASE,
    note:
      taxBase === 0 && rawTaxBase > 0
        ? `50만원 미만(${rawTaxBase.toLocaleString()}) — 과세 없음`
        : undefined,
  });

  // ─────────────────────────────────────────────
  // STEP 6: 산출세액 ⑦ (§56 누진세율)
  // ─────────────────────────────────────────────
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  allLaws.add(GIFT_LAW.TAX_RATE);
  allBreakdown.push({
    label: "증여세 산출세액 ⑦",
    amount: computedTax,
    lawRef: GIFT_LAW.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 7: §57 세대생략 할증 + 한도 안분 (⑧⑨⑩⑪⑫⑬)
  // ─────────────────────────────────────────────
  const donorGroup = getDonorGroup(input.donor);
  const surchargeResult = calcGiftGenerationSkipSurchargeWithLimit(
    computedTax,
    donorGroup,
    input.isMinorDonee,
    grossGiftValue,
    priorAggregation,
    taxBase,
  );
  allBreakdown.push(...surchargeResult.breakdown);
  if (surchargeResult.detail !== null) {
    allLaws.add(GIFT_LAW.GENERATION_SKIP);
    if (surchargeResult.detail.surchargeRate === 0.4) {
      allLaws.add(GIFT_LAW.SURCHARGE_MINOR_OVER_2B);
    }
  }

  const totalComputedTaxWithSurcharge =
    computedTax + surchargeResult.additionalSurcharge;

  // ─────────────────────────────────────────────
  // STEP 8: 세액공제 — §58 안분 한도 + §69 (⑭⑮⑯⑰)
  // ─────────────────────────────────────────────
  const creditResult = calcGiftTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    giftAmount: netCurrentGiftValue,
    priorGiftComputedTax: priorAggregation.totalComputedTax,
    priorGiftAddedTaxBase: priorAggregation.priorAddedTaxBase,
    aggregatedTaxBase: taxBase,
  });
  const totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 9: 결정세액
  //   사례 1 (12행): ⑫ = ⑦ − ⑩ − ⑪
  //   사례 2 (18행): ⑱ = ⑬ − ⑯ − ⑰
  //   공통: finalTax = max(0, totalComputedTaxWithSurcharge − totalTaxCredit)
  // ─────────────────────────────────────────────
  const finalTax = Math.max(
    0,
    totalComputedTaxWithSurcharge - totalTaxCredit,
  );
  allBreakdown.push({
    label: "증여세 결정세액",
    amount: finalTax,
    note: "= 산출세액합계 − 세액공제 합계",
  });

  // ─────────────────────────────────────────────
  // STEP 10: 결과 detail 조립
  // ─────────────────────────────────────────────
  const priorGiftCreditDetail =
    priorAggregation.totalComputedTax > 0
      ? {
          priorComputedTax: priorAggregation.totalComputedTax,
          priorAddedTaxBase: priorAggregation.priorAddedTaxBase,
          aggregatedTaxBase: taxBase,
          creditLimit:
            taxBase === 0
              ? 0
              : safeMultiplyThenDivide(computedTax, priorAggregation.priorAddedTaxBase, taxBase),
          priorPaidCredit: creditResult.giftTaxCredit,
        }
      : null;

  // ─────────────────────────────────────────────
  // STEP 11: filingFormRows
  // ─────────────────────────────────────────────
  const bracketLabel = formatBracketRate(taxBase, brackets);
  const filingFormRows = buildFilingFormRows({
    grossGiftValue,
    debtAmount: 0, // 현행 증여세는 채무 미지원
    priorTotal: priorAggregation.totalAmount,
    totalDeduction,
    taxBase,
    bracketRateLabel: bracketLabel,
    computedTax,
    generationSkipDetail: surchargeResult.detail,
    priorGiftCreditDetail,
    reportingCredit: creditResult.filingCredit,
    finalTax,
    hasPriorGifts: priorAggregation.matchedPriorGifts.length > 0,
    // §69 formula 표시 정합 — 외국납부(§59) 차감 후 기준액 echo
    filingCreditBase: creditResult.filingCreditBase,
    foreignTaxCredit: creditResult.foreignTaxCredit,
  });

  // 분납 (§70②) — finalTax 산출 후 내부 계산 (순환 회피). 별지10호 ㊼ cashDeferred echo.
  const installmentSplit = calcInstallmentSplit({
    payableTax: finalTax,
    applyInstallmentSplit: input.applyInstallmentSplit ?? false,
    requestedSplitAmount: input.requestedSplitAmount,
    applyLongTermInstallment: false, // 증여 연부연납 미구현 → 배타 대상 없음
  });

  const partialResult = {
    grossGiftValue,
    exemptAmount,
    aggregatedGiftValue,
    totalDeduction,
    taxBase,
    computedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    totalTaxCredit,
    finalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
    // Phase A 신규
    donorGroup,
    additionalGenerationSkipSurcharge: surchargeResult.additionalSurcharge,
    generationSkipSurchargeDetail: surchargeResult.detail,
    priorGiftCreditDetail,
    filingFormRows,
    // 별지 제10호서식 표시 전용 (default 0)
    publicInterestExclusion: 0,
    publicTrustExclusion: 0,
    disabledTrustExclusion: 0,
    debtAssumed: 0,
    disasterLossDeduction: 0,
    appraisalFeeDeduction: appraisalFee.total,
    appraisalFeeDetail: appraisalFee,
    interestEquivalent: 0,
    museumDeferredTax: 0,
    underreportPenalty: 0,
    latePaymentPenalty: 0,
    publicInterestPenalty: 0,
    installmentPayment: 0,
    cashDeferred: installmentSplit.splitAmount, // §70② 분납 (별지10호 ㊼)
  };

  const besshi10Rows = buildBesshi10Rows(input, partialResult, brackets);

  return {
    ...partialResult,
    besshi10Rows,
  };
}

// ============================================================
// 헬퍼: 세율 구간 라벨 (⑥ 표시용)
// ============================================================

function formatBracketRate(taxBase: number, brackets: TaxBracket[]): string {
  for (const b of brackets) {
    if (taxBase <= 0) return "0%";
    if (b.max === null || taxBase <= b.max) {
      return `${(b.rate * 100).toFixed(0)}%`;
    }
  }
  return "—";
}
