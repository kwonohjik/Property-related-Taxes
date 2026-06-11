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
import { TAX_CREDIT } from "./legal-codes";
import type {
  EstateItem,
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
import {
  partitionGiftItems,
  filterSpecialPriors,
  filterOrdinaryPriors,
  calcSpecialTreatmentStream,
} from "./gift-special-stream";
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
  // STEP 2.5: §47① 부담부증여 채무인수 합산
  //   법령: 상증법 §47① — "증여재산에 담보된 채무로서 수증자가 인수한 금액을 뺀 금액"
  //   자산별 assumedDebtForGift 합산 → 음수 가드
  // ─────────────────────────────────────────────
  const assumedDebtTotal = Math.max(
    0,
    input.giftItems.reduce(
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
    // §57① 단서 적용 여부 echo (단서로 할증이 배제된 경우에만 true)
    generationSkipProvisoApplied: input.isSubstituteGift === true ? true : undefined,
    priorGiftCreditDetail,
    filingFormRows,
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

// ============================================================
// 조특법 특례 2-스트림 분리과세 경로
//   §30의5①후단·§30의5⑪·§30의5⑫·§30의6⑤
// ============================================================

/**
 * 2-스트림 분리과세:
 *   특례 스트림: 특례 자산 + 특례 prior(기간무관) → 5억/10억 공제 → 10%/20% → §69 배제
 *   일반 스트림: 일반 자산 + 일반 prior(10년 cutoff) → §53 공제 → §56 누진 → §57·§58·§69
 *   최종 납부세액 = 특례 스트림 세액 + 일반 스트림 세액
 */
function calcGiftTaxTwoStream(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions,
  brackets: TaxBracket[],
): GiftTaxResult {
  const appliedLawDate = input.giftDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([GIFT_LAW.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 0.1: 자산 귀속 분류
  // ─────────────────────────────────────────────
  const partition = partitionGiftItems(input.giftItems);
  if (partition.hasUnassignedItems) {
    // validation(⑧)이 차단해야 하지만 방어 처리: 미설정 자산을 일반 스트림으로 분류하고 경고
    allWarnings.push(
      `혼합 자산 중 ${partition.unassignedCount}개 자산에 특례 귀속(isSpecialTreatmentAsset)이 미설정 — 일반 스트림으로 처리됨. 정확한 계산을 위해 귀속을 명시하세요.`,
    );
  }

  // ─────────────────────────────────────────────
  // STEP 0.2: 자산별 평가
  // ─────────────────────────────────────────────
  const allValuationResults = evaluateAllEstateItems(input.giftItems);
  for (const vr of allValuationResults) allWarnings.push(...vr.warnings);

  // 자산 ID → 평가액 매핑 (id 없으면 인덱스 기반)
  const valuationMap = new Map<EstateItem, number>();
  input.giftItems.forEach((item, idx) => {
    valuationMap.set(item, allValuationResults[idx]?.valuatedAmount ?? 0);
  });

  const specialItemsValue = partition.specialItems.reduce(
    (s, item) => s + (valuationMap.get(item) ?? 0),
    0,
  );
  const ordinaryItemsGrossValue = partition.ordinaryItems.reduce(
    (s, item) => s + (valuationMap.get(item) ?? 0),
    0,
  );

  // §47① 부담부증여 채무 — 자산 귀속별 분리 합산 (특례 자산 / 일반 자산)
  //   특례 자산 채무: 특례 스트림 과세가액(한도)에서 차감 (specialItemsNetValue)
  //   일반 자산 채무: 일반 스트림에서 차감 (STEP 2)
  const specialItemsDebt = Math.max(
    0,
    partition.specialItems.reduce((s, item) => s + (item.assumedDebtForGift ?? 0), 0),
  );
  const ordinaryItemsDebt = Math.max(
    0,
    partition.ordinaryItems.reduce((s, item) => s + (item.assumedDebtForGift ?? 0), 0),
  );
  // §47① — "증여세 과세가액 = 증여재산가액 − 인수 채무". 조특법 §30의5⑬(§30의6⑤ 준용) 보충 적용으로
  //   특례 과세가액(한도) 산정도 채무 차감 후 순가액 기준. (법문 해석 기준, 예규 미확보 — warnings 안내)
  const specialItemsNetValue = Math.max(0, specialItemsValue - specialItemsDebt);
  if (specialItemsDebt > 0 && specialItemsValue > 0) {
    allBreakdown.push({
      label: "가업승계 특례 자산 채무 인수 차감 (§47①)",
      amount: -Math.min(specialItemsDebt, specialItemsValue),
      lawRef: GIFT_LAW.TAXABLE_VALUE,
      note: "특례 과세가액에서 차감 후 한도·공제 적용",
    });
    allWarnings.push(
      "가업승계 과세특례와 부담부증여(§47① 채무 인수)가 동시 적용되는 경우, 특례 과세가액의 채무 차감 적용 범위에 대해 과세관청 해석을 확인하시기 바랍니다.",
    );
    if (specialItemsDebt > specialItemsValue) {
      allWarnings.push(
        "특례 자산의 인수 채무액이 특례 증여재산가액을 초과하여 특례 스트림 과세가액을 0으로 처리합니다.",
      );
    }
  }

  // ─────────────────────────────────────────────
  // STEP 0.3: prior 분류
  //   특례 prior: specialTreatmentType === input.creditInput.specialTreatment
  //   일반 prior: specialTreatmentType === undefined
  // ─────────────────────────────────────────────
  const specialTreatmentType = input.creditInput!.specialTreatment!;
  const specialPriors = filterSpecialPriors(
    input.priorGiftsWithin10Years,
    specialTreatmentType,
  );
  const ordinaryPriorGifts = filterOrdinaryPriors(input.priorGiftsWithin10Years);

  // ─────────────────────────────────────────────
  // STEP 1 (특례 스트림): 특례 세액 계산
  //   §30의5①후단 합산 + 5억/10억 공제 + 10%/20% + 기납부 차감
  //   §69 배제 (§30의5⑪·§30의6⑤)
  // ─────────────────────────────────────────────
  const specialStream = calcSpecialTreatmentStream(
    specialItemsNetValue,
    specialPriors,
    input.creditInput!,
  );
  allBreakdown.push(...specialStream.breakdown);
  allWarnings.push(...specialStream.warnings);

  // 특례 미적격 시 일반 스트림으로 폴백 (모든 자산을 일반 처리)
  // 적격이어도 §30의5①·§30의6① 한도 초과 신규분은 특례 대상이 아니므로 일반 스트림 합산
  // (법문: "창업자금"은 과세가액 50억/100억 한도로 정의, 가업승계 한도는 영위기간별 300/400/600억)
  const effectiveOrdinaryGrossValue = specialStream.isEligible
    ? ordinaryItemsGrossValue + specialStream.excessToOrdinary
    : ordinaryItemsGrossValue + specialItemsValue;
  if (specialStream.isEligible && specialStream.excessToOrdinary > 0) {
    allBreakdown.push({
      label: "특례 한도 초과 신규 증여분 일반 스트림 합산",
      amount: specialStream.excessToOrdinary,
      lawRef:
        specialTreatmentType === "startup"
          ? TAX_CREDIT.STARTUP_FUND
          : TAX_CREDIT.FAMILY_BUSINESS,
      note: "한도 초과분은 특례 미적용 — 일반 증여세 과세",
    });
  }

  // ─────────────────────────────────────────────
  // STEP 2 (일반 스트림): 비과세·채무 차감 + §47 합산
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  if (input.exemptions && input.exemptions.length > 0) {
    const { totalExemptAmount, breakdown: exemptBreakdown } =
      evaluateExemptions(input.exemptions, effectiveOrdinaryGrossValue);
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // 일반 스트림 차감 채무:
  //   적격 → 일반 자산 채무만 (특례 자산 채무는 specialItemsNetValue에서 이미 차감)
  //   미적격 → 특례 자산이 gross로 일반 스트림에 폴백(effectiveOrdinaryGrossValue += specialItemsValue)
  //           되므로 그 채무도 일반 스트림에서 차감
  const assumedDebtTotal = specialStream.isEligible
    ? ordinaryItemsDebt
    : ordinaryItemsDebt + specialItemsDebt;
  if (assumedDebtTotal > 0) {
    allBreakdown.push({
      label: "부담부증여 수증자 인수 채무 (일반 스트림)",
      amount: -assumedDebtTotal,
      lawRef: GIFT_LAW.TAXABLE_VALUE,
    });
  }

  const ordinaryNetValue = Math.max(
    0,
    effectiveOrdinaryGrossValue - exemptAmount - assumedDebtTotal,
  );

  // §47② 일반 prior 합산 (specialTreatmentType prior 제외는 gift-prior-aggregation에서 처리)
  const priorAggregation = aggregatePriorGiftsForGift(
    ordinaryPriorGifts,
    input.giftDate,
    input.donor,
  );
  allBreakdown.push(...priorAggregation.breakdown);
  allWarnings.push(...priorAggregation.warnings);
  allLaws.add(GIFT_LAW.AGGREGATION_SAME_PERSON);

  const aggregatedOrdinaryValue = ordinaryNetValue + priorAggregation.totalAmount;
  allBreakdown.push({
    label: "일반 스트림 합산 증여가액",
    amount: aggregatedOrdinaryValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
    note: `일반 자산 ${ordinaryNetValue.toLocaleString()} + 일반 prior ${priorAggregation.totalAmount.toLocaleString()}`,
  });

  // ─────────────────────────────────────────────
  // STEP 3 (일반 스트림): §53·§53의2 공제
  // ─────────────────────────────────────────────
  const deductionResult = calcGiftDeductions(
    input.deductionInput,
    aggregatedOrdinaryValue,
  );
  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 4 (일반 스트림): 과세표준 (§55)
  // ─────────────────────────────────────────────
  const hasAppraisalValuation = partition.ordinaryItems.some(
    (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
  );
  const appraisalFee = calcAppraisalFeeDeduction(input.appraisalFee, {
    hasAppraisalValuation,
    taxType: "gift",
  });
  const rawOrdinaryTaxBase = Math.max(
    0,
    aggregatedOrdinaryValue - totalDeduction - appraisalFee.total,
  );
  const ordinaryTaxBase =
    rawOrdinaryTaxBase < TAX_BASE_MIN ? 0 : rawOrdinaryTaxBase;
  allBreakdown.push({
    label: "일반 스트림 과세표준",
    amount: ordinaryTaxBase,
    lawRef: GIFT_LAW.TAX_BASE,
  });

  // ─────────────────────────────────────────────
  // STEP 5 (일반 스트림): 산출세액 §56
  // ─────────────────────────────────────────────
  const ordinaryComputedTax = calcInheritanceGiftTax(ordinaryTaxBase, brackets);
  allLaws.add(GIFT_LAW.TAX_RATE);
  allBreakdown.push({
    label: "일반 스트림 산출세액",
    amount: ordinaryComputedTax,
    lawRef: GIFT_LAW.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 6 (일반 스트림): §57 세대생략 할증
  // ─────────────────────────────────────────────
  const donorGroup = getDonorGroup(input.donor);
  const surchargeResult = calcGiftGenerationSkipSurchargeWithLimit(
    ordinaryComputedTax,
    donorGroup,
    input.isMinorDonee,
    effectiveOrdinaryGrossValue,
    priorAggregation,
    ordinaryTaxBase,
    input.isSubstituteGift,
  );
  allBreakdown.push(...surchargeResult.breakdown);
  if (surchargeResult.detail !== null) {
    allLaws.add(GIFT_LAW.GENERATION_SKIP);
    if (surchargeResult.detail.surchargeRate === 0.4) {
      allLaws.add(GIFT_LAW.SURCHARGE_MINOR_OVER_2B);
    }
  }
  const ordinaryTotalWithSurcharge =
    ordinaryComputedTax + surchargeResult.additionalSurcharge;

  // ─────────────────────────────────────────────
  // STEP 7 (일반 스트림): §58 + §69 세액공제
  //   T-09: 2-스트림 경로에서 specialTreatmentCredit=0 강제
  //         → creditInput에서 specialTreatment를 제거하여 전달
  // ─────────────────────────────────────────────
  const ordinaryCreditInput = {
    ...input.creditInput!,
    specialTreatment: undefined as undefined, // T-09: 2-스트림 시 일반 스트림에서 특례 크레딧 0
  };
  const creditResult = calcGiftTaxCredits({
    creditInput: ordinaryCreditInput,
    computedTax: ordinaryComputedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    giftAmount: ordinaryNetValue,
    priorGiftComputedTax: priorAggregation.totalComputedTax,
    priorGiftAddedTaxBase: priorAggregation.priorAddedTaxBase,
    aggregatedTaxBase: ordinaryTaxBase,
  });
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 8: 최종 납부세액 합산
  //   특례 스트림 세액(§69 배제) + 일반 스트림 세액(§57·§58·§69)
  // ─────────────────────────────────────────────
  const ordinaryFinalTax = Math.max(
    0,
    ordinaryTotalWithSurcharge - creditResult.totalCredit,
  );
  const finalTax = specialStream.finalTax + ordinaryFinalTax;

  allBreakdown.push(
    {
      label: "특례 스트림 납부세액",
      amount: specialStream.finalTax,
    },
    {
      label: "일반 스트림 납부세액",
      amount: ordinaryFinalTax,
    },
    {
      label: "최종 납부세액 합계",
      amount: finalTax,
      note: "= 특례 스트림 + 일반 스트림",
    },
  );

  // ─────────────────────────────────────────────
  // STEP 9: 결과 detail 조립
  // ─────────────────────────────────────────────
  const priorGiftCreditDetail =
    priorAggregation.totalComputedTax > 0
      ? {
          priorComputedTax: priorAggregation.totalComputedTax,
          priorAddedTaxBase: priorAggregation.priorAddedTaxBase,
          aggregatedTaxBase: ordinaryTaxBase,
          creditLimit:
            ordinaryTaxBase === 0
              ? 0
              : safeMultiplyThenDivide(
                  ordinaryComputedTax,
                  priorAggregation.priorAddedTaxBase,
                  ordinaryTaxBase,
                ),
          priorPaidCredit: creditResult.giftTaxCredit,
        }
      : null;

  const bracketLabel = formatBracketRate(ordinaryTaxBase, brackets);
  const filingFormRows = buildFilingFormRows({
    grossGiftValue: effectiveOrdinaryGrossValue,
    debtAmount: assumedDebtTotal,
    priorTotal: priorAggregation.totalAmount,
    totalDeduction,
    taxBase: ordinaryTaxBase,
    bracketRateLabel: bracketLabel,
    computedTax: ordinaryComputedTax,
    generationSkipDetail: surchargeResult.detail,
    priorGiftCreditDetail,
    reportingCredit: creditResult.filingCredit,
    finalTax,
    hasPriorGifts: priorAggregation.matchedPriorGifts.length > 0,
    filingCreditBase: creditResult.filingCreditBase,
    foreignTaxCredit: creditResult.foreignTaxCredit,
    exemptTotal: exemptAmount,
    appraisalFeeTotal: appraisalFee.total,
  });

  const installmentSplit = calcInstallmentSplit({
    payableTax: finalTax,
    applyInstallmentSplit: input.applyInstallmentSplit ?? false,
    requestedSplitAmount: input.requestedSplitAmount,
    applyLongTermInstallment: false,
  });

  const partialResult = {
    // 일반 스트림 기준 필드 (filingFormRows와 신고서 표시용)
    grossGiftValue: effectiveOrdinaryGrossValue,
    exemptAmount,
    aggregatedGiftValue: aggregatedOrdinaryValue,
    totalDeduction,
    taxBase: ordinaryTaxBase,
    computedTax: ordinaryComputedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    totalTaxCredit: creditResult.totalCredit,
    finalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults: allValuationResults,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
    donorGroup,
    additionalGenerationSkipSurcharge: surchargeResult.additionalSurcharge,
    generationSkipSurchargeDetail: surchargeResult.detail,
    generationSkipProvisoApplied: input.isSubstituteGift === true ? true : undefined,
    priorGiftCreditDetail,
    filingFormRows,
    // 별지 제10호서식 (기본값)
    publicInterestExclusion: 0,
    publicTrustExclusion: 0,
    disabledTrustExclusion: 0,
    // 별지 ㉒ §47 채무액 — 일반 스트림 채무 (besshi10·결과뷰 요약 모두 일반 스트림 컨텍스트).
    //   특례 자산 채무는 specialStreamDebt로 분리 (2-스트림 카드 표시) — 자기일관성 유지.
    debtAssumed: assumedDebtTotal,
    disasterLossDeduction: 0,
    appraisalFeeDeduction: appraisalFee.total,
    appraisalFeeDetail: appraisalFee,
    interestEquivalent: 0,
    museumDeferredTax: 0,
    underreportPenalty: 0,
    latePaymentPenalty: 0,
    publicInterestPenalty: 0,
    installmentPayment: 0,
    cashDeferred: installmentSplit.splitAmount,
    // 2-스트림 전용 결과 필드 (T-03)
    specialStreamTax: specialStream.finalTax,
    ordinaryStreamTax: ordinaryFinalTax,
    specialStreamAggregatedValue: specialStream.aggregatedValue,
    // 특례 자산 §47① 인수 채무 (한도 차감분) — 2-스트림 카드 표시용
    specialStreamDebt: Math.min(specialItemsDebt, specialItemsValue) || undefined,
  };

  const besshi10Rows = buildBesshi10Rows(input, partialResult, brackets);

  return {
    ...partialResult,
    besshi10Rows,
  };
}
