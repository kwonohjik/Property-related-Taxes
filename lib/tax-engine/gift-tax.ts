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

import { evaluateAllEstateItems, resolveValuationMethod, COLLATERAL_DEBT_NOTICE } from "./property-valuation";
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
import { deriveFarmlandReduction, toFarmlandReductionDetail } from "./gift-farmland-reduction";
import { calcAggregationExcludedStream } from "./gift-aggregation-excluded-stream";
import {
  formatBracketRate,
  TAX_BASE_MIN,
  type GiftTaxEngineOptions,
} from "./gift-tax-helpers";
import { calcGiftTaxTwoStream } from "./gift-tax-two-stream";

// 대납 gross-up 엔진 re-export (분리 파일 — 800줄 정책)
export { calcGiftTaxWithDonorPaidTax } from "./gift-tax-grossup";
// GiftTaxEngineOptions re-export (800줄 정책 — gift-tax-helpers.ts 분리, 기존 import 경로 보존)
export type { GiftTaxEngineOptions } from "./gift-tax-helpers";

// ============================================================
// 증여세 메인 계산
// ============================================================

export function calcGiftTax(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions = {},
): GiftTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;

  // ─────────────────────────────────────────────
  // STEP 0: 조특법 특례 2-스트림 분기
  //   specialTreatment 선택 시 특례 스트림과 일반 스트림을 분리 계산.
  //   §30의5⑪: 일반 자산은 특례 스트림 과세가액에 §47② 합산 금지.
  //   §30의5①후단: 특례 prior는 기간무관 합산.
  //   §30의5⑫: §69(신고세액공제) 배제 (특례 스트림에만 적용).
  // ─────────────────────────────────────────────
  if (input.creditInput?.specialTreatment) {
    return calcGiftTaxTwoStream(input, options, brackets);
  }

  const appliedLawDate = input.giftDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([GIFT_LAW.TAXABLE_VALUE]);

  // 합산배제증여재산(§41의3·§41의5) 분리 — §47② 격리·§55①3호 별도 과세표준.
  // 빈 배열이면 ordinaryGiftItems === giftItems → 현행 동작 100% 보존.
  const aggExclItems = input.giftItems.filter((i) => i.isAggregationExcludedGift);
  const ordinaryGiftItems = input.giftItems.filter(
    (i) => !i.isAggregationExcludedGift,
  );

  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(ordinaryGiftItems);
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
    // §14 부채명세 공제는 상속세 전용 — 증여세 결과에서 담보채무 §14 안내 제외
    allWarnings.push(...vr.warnings.filter((w) => w !== COLLATERAL_DEBT_NOTICE));
  }

  // ─────────────────────────────────────────────
  // STEP 2: 비과세 차감
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  if (input.exemptions && input.exemptions.length > 0) {
    const { totalExemptAmount, breakdown: exemptBreakdown } =
      evaluateExemptions(input.exemptions, grossGiftValue, "gift");
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // ─────────────────────────────────────────────
  // STEP 2.5: §47① 부담부증여 채무인수 합산
  //   법령: 상증법 §47① — "증여재산에 담보된 채무로서 수증자가 인수한 금액을 뺀 금액"
  //   자산별 assumedDebtForGift 합산 → 음수 가드
  // ─────────────────────────────────────────────
  const assumedDebtTotal = Math.max(
    0,
    ordinaryGiftItems.reduce(
      (sum, item) => sum + (item.assumedDebtForGift ?? 0),
      0,
    ),
  );
  if (assumedDebtTotal > 0) {
    allBreakdown.push({
      label: "부담부증여 수증자 인수 채무 ②",
      amount: -assumedDebtTotal,
      lawRef: GIFT_LAW.TAXABLE_VALUE,
      note: "§47① — 과세가액에서 차감",
    });
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

  // §47① 채무인수 차감 후 순 과세가액 산출 (음수 불가)
  const netCurrentGiftValue = Math.max(
    0,
    grossGiftValue - exemptAmount - assumedDebtTotal,
  );

  // 채무가 재산가액을 초과하면 경고
  if (assumedDebtTotal > 0 && assumedDebtTotal >= grossGiftValue - exemptAmount) {
    allWarnings.push(
      "채무인수액이 증여재산가액(비과세 차감 후)을 초과하여 과세가액을 0으로 처리합니다.",
    );
  }

  // STEP G-3: _donorPaidTaxAddition — aggregatedGiftValue에만 가산 (netCurrentGiftValue 불변 → §53 공제 동결)
  const donorPaidTaxAddition = input._donorPaidTaxAddition ?? 0;
  const aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount + donorPaidTaxAddition;
  const aggregatedNote = `금번 ${netCurrentGiftValue.toLocaleString()} + 기증여 ${priorAggregation.totalAmount.toLocaleString()}${donorPaidTaxAddition > 0 ? ` + 대납가산 ${donorPaidTaxAddition.toLocaleString()}` : ""}`;
  allBreakdown.push({ label: "10년 합산 증여가액 ③", amount: aggregatedGiftValue, lawRef: GIFT_LAW.TAXABLE_VALUE, note: aggregatedNote });

  // ─────────────────────────────────────────────
  // STEP 4: 증여재산공제 ④ (§53·§53의2)
  // ─────────────────────────────────────────────
  const deductionResult = calcGiftDeductions(
    input.deductionInput,
    aggregatedGiftValue,
    netCurrentGiftValue, // §46①2호 안분 분자·분모는 금번 증여 순 과세가액(사전증여 제외)
  );
  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 5: 과세표준 ⑤ (§55 ② — §55① 감정평가수수료 차감, 시행령 §46의2 → §20의3 준용)
  // ─────────────────────────────────────────────
  const hasAppraisalValuation = ordinaryGiftItems.some(
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
    input.isSubstituteGift,
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
  // STEP 7.5: 조특법 §71 영농자녀 농지 증여세 감면 (gift-farmland-reduction-71)
  //   감면농지(isFarmlandGiftReduction) 있을 때만. ㉣ 분모는 priorAggregation.totalComputedTax(full).
  //   §58·§69·finalTax 연계: G-5(§69 base 차감) + G-6(finalTax 차감).
  // ─────────────────────────────────────────────
  const farmlandReductionResult = deriveFarmlandReduction(
    input.giftItems,
    valuationResults.map((v) => v.valuatedAmount),
    input.priorGiftsWithin10Years,
    input.giftDate,
    computedTax,
    priorAggregation.totalComputedTax,
  );
  const farmlandReduction = farmlandReductionResult?.reductionAmount ?? 0;
  if (farmlandReductionResult !== null) {
    allBreakdown.push(...farmlandReductionResult.breakdown);
    allWarnings.push(...farmlandReductionResult.warnings);
    allLaws.add(GIFT_LAW.FARMLAND_REDUCTION);
  }

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
    farmlandReductionAmount: farmlandReduction,
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
    totalComputedTaxWithSurcharge - totalTaxCredit - farmlandReduction,
  );
  allBreakdown.push({
    label: "증여세 결정세액",
    amount: finalTax,
    note: farmlandReduction > 0
      ? "= 산출세액합계 − 세액공제 합계 − 농지 감면세액(§71)"
      : "= 산출세액합계 − 세액공제 합계",
  });

  // ─────────────────────────────────────────────
  // STEP 9.5: 합산배제증여재산(§41의3·§41의5) 스트림 — §47② 격리·§55①3호 별도 과세표준
  //   일반 스트림과 독립 계산 후 결과 합산. 빈 배열이면 null → 현행 동작 보존.
  // ─────────────────────────────────────────────
  const aggExcl =
    aggExclItems.length > 0
      ? calcAggregationExcludedStream(aggExclItems, input, brackets)
      : null;
  if (aggExcl) {
    allBreakdown.push(...aggExcl.breakdown);
    for (const w of aggExcl.warnings) allWarnings.push(w);
  }
  const combinedFinalTax = finalTax + (aggExcl?.finalTax ?? 0);

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
    debtAmount: assumedDebtTotal, // §47① 부담부증여 채무인수액
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
    // ⑤ formula 표시 정합 — 비과세·감정평가수수료 차감 표기 (0이면 생략)
    exemptTotal: exemptAmount,
    appraisalFeeTotal: appraisalFee.total,
  });

  // 분납 (§70②) — finalTax 산출 후 내부 계산 (순환 회피). 별지10호 ㊼ cashDeferred echo.
  const installmentSplit = calcInstallmentSplit({
    payableTax: combinedFinalTax,
    applyInstallmentSplit: input.applyInstallmentSplit ?? false,
    requestedSplitAmount: input.requestedSplitAmount,
    applyLongTermInstallment: false, // 증여 연부연납 미구현 → 배타 대상 없음
  });

  const partialResult = {
    grossGiftValue: grossGiftValue + (aggExcl?.grossValue ?? 0),
    exemptAmount,
    aggregatedGiftValue,
    totalDeduction,
    taxBase: taxBase + (aggExcl?.taxBase ?? 0),
    computedTax: computedTax + (aggExcl?.computedTax ?? 0),
    generationSkipSurcharge:
      surchargeResult.additionalSurcharge + (aggExcl?.generationSkipSurcharge ?? 0),
    totalTaxCredit: totalTaxCredit + (aggExcl?.totalCredit ?? 0),
    finalTax: combinedFinalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
    // Phase A 신규
    donorGroup,
    additionalGenerationSkipSurcharge:
      surchargeResult.additionalSurcharge + (aggExcl?.generationSkipSurcharge ?? 0),
    generationSkipSurchargeDetail: surchargeResult.detail,
    // §57① 단서 적용 여부 echo (단서로 할증이 배제된 경우에만 true)
    generationSkipProvisoApplied: input.isSubstituteGift === true ? true : undefined,
    priorGiftCreditDetail,
    filingFormRows,
    // 동시증여 2-pass 안분 분모 산출용 echo (gift-tax.ts STEP 3 계산값 노출 — 산식 영향 0)
    netCurrentGiftValue,
    // 별지 제10호서식 표시 전용 (default 0)
    publicInterestExclusion: 0,
    publicTrustExclusion: 0,
    disabledTrustExclusion: 0,
    debtAssumed: assumedDebtTotal, // §47① 부담부증여 채무인수액 (0이면 0 echo)
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
    // 조특법 §71 농지 감면 detail (gift-farmland-reduction-71) — 미신청 시 null
    farmlandReductionDetail: farmlandReductionResult
      ? toFarmlandReductionDetail(farmlandReductionResult)
      : null,
    // 합산배제증여재산(§41의3·§41의5) 별도 스트림 echo — 결과뷰 별도 카드 (별지 서식은 일반분 유지)
    aggregationExcludedDetail: aggExcl
      ? {
          grossValue: aggExcl.grossValue,
          taxBase: aggExcl.taxBase,
          computedTax: aggExcl.computedTax,
          generationSkipSurcharge: aggExcl.generationSkipSurcharge,
          totalCredit: aggExcl.totalCredit,
          finalTax: aggExcl.finalTax,
          breakdown: aggExcl.breakdown,
        }
      : undefined,
    ...(options._echoGrossUp !== undefined ? { donorPaidTaxGrossUp: options._echoGrossUp } : {}), // gross-up echo 주입 → derivePriorGiftAddition 참조
  };

  const besshi10Rows = buildBesshi10Rows(input, partialResult, brackets);

  return {
    ...partialResult,
    besshi10Rows,
  };
}
