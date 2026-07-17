/**
 * 증여세 조특법 특례 2-스트림 분리과세 경로 (§30의5①후단·§30의5⑪·§30의5⑫·§30의6⑤)
 *
 * 800줄 정책으로 gift-tax.ts에서 분리 (2026-06-26).
 * calcGiftTax STEP 0 (creditInput.specialTreatment 선택)에서만 호출.
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당).
 */

import { GIFT as GIFT_LAW, TAX_CREDIT } from "./legal-codes";
import type {
  EstateItem,
  GiftTaxInput,
  GiftTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";
import type { TaxBracket } from "./types";

import { evaluateAllEstateItems, resolveValuationMethod, COLLATERAL_DEBT_NOTICE } from "./property-valuation";
import { evaluateExemptions } from "./exemption-evaluator";
import { calcGiftDeductions } from "./deductions/gift-deductions";
import { calcAppraisalFeeDeduction } from "./deductions/appraisal-fee-deduction";
import { calcInstallmentSplit } from "./credits/installment-split";
import {
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
import { calcAggregationExcludedStream } from "./gift-aggregation-excluded-stream";
import { formatBracketRate, TAX_BASE_MIN, type GiftTaxEngineOptions } from "./gift-tax-helpers";

/**
 * 2-스트림 분리과세:
 *   특례 스트림: 특례 자산 + 특례 prior(기간무관) → 5억/10억 공제 → 10%/20% → §69 배제
 *   일반 스트림: 일반 자산 + 일반 prior(10년 cutoff) → §53 공제 → §56 누진 → §57·§58·§69
 *   최종 납부세액 = 특례 스트림 세액 + 일반 스트림 세액
 */
export function calcGiftTaxTwoStream(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions,
  brackets: TaxBracket[],
): GiftTaxResult {
  const appliedLawDate = input.giftDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([GIFT_LAW.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 0.0: 합산배제증여재산(§41의3·§45의2 등) 분리 — 특례/일반 어느 스트림에도 합산 금지.
  //   §47② 격리·§55① 호별 과세표준 별도 계산 후 최종 세액에 합산 (H-30·G-4).
  //   빈 배열이면 twoStreamItems === giftItems → 현행 2-스트림 동작 100% 보존.
  // ─────────────────────────────────────────────
  const aggExclItems = input.giftItems.filter((i) => i.isAggregationExcludedGift);
  const twoStreamItems = input.giftItems.filter((i) => !i.isAggregationExcludedGift);

  // ─────────────────────────────────────────────
  // STEP 0.1: 자산 귀속 분류 (합산배제 제외분만 특례/일반 분류)
  // ─────────────────────────────────────────────
  const partition = partitionGiftItems(twoStreamItems);
  if (partition.hasUnassignedItems) {
    // validation(⑧)이 차단해야 하지만 방어 처리: 미설정 자산을 일반 스트림으로 분류하고 경고
    allWarnings.push(
      `혼합 자산 중 ${partition.unassignedCount}개 자산에 특례 귀속(isSpecialTreatmentAsset)이 미설정 — 일반 스트림으로 처리됨. 정확한 계산을 위해 귀속을 명시하세요.`,
    );
  }

  // ─────────────────────────────────────────────
  // STEP 0.2: 자산별 평가
  // ─────────────────────────────────────────────
  const allValuationResults = evaluateAllEstateItems(twoStreamItems);
  for (const vr of allValuationResults)
    allWarnings.push(...vr.warnings.filter((w) => w !== COLLATERAL_DEBT_NOTICE)); // §14 상속세 전용 제외

  // 자산 ID → 평가액 매핑 (id 없으면 인덱스 기반)
  const valuationMap = new Map<EstateItem, number>();
  twoStreamItems.forEach((item, idx) => {
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
      evaluateExemptions(input.exemptions, effectiveOrdinaryGrossValue, "gift");
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
    ordinaryNetValue, // §46①2호 안분 분자·분모는 금번 일반 스트림 순 과세가액(사전증여 제외)
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

  // 합산배제 스트림 (H-30·G-4) — 특례·일반과 독립. M-2: 일반 스트림이 수수료 차감했으면 재차감 방지.
  const aggExcl =
    aggExclItems.length > 0
      ? calcAggregationExcludedStream(aggExclItems, input, brackets, hasAppraisalValuation)
      : null;
  if (aggExcl) {
    allBreakdown.push(...aggExcl.breakdown);
    for (const w of aggExcl.warnings) allWarnings.push(w);
  }

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
    giftDate: input.giftDate, // §69 신고세액공제율 증여연도 기준 (H-21 — 미전달 시 3% 고정 버그)
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
  const finalTax = specialStream.finalTax + ordinaryFinalTax + (aggExcl?.finalTax ?? 0);

  allBreakdown.push(
    {
      label: "특례 스트림 납부세액",
      amount: specialStream.finalTax,
    },
    {
      label: "일반 스트림 납부세액",
      amount: ordinaryFinalTax,
    },
    ...(aggExcl
      ? [{ label: "합산배제 스트림 납부세액", amount: aggExcl.finalTax }]
      : []),
    {
      label: "최종 납부세액 합계",
      amount: finalTax,
      note: aggExcl
        ? "= 특례 스트림 + 일반 스트림 + 합산배제 스트림"
        : "= 특례 스트림 + 일반 스트림",
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
    // 별지 최하단(⑫/⑱)은 일반분 산식 "⑦−⑩−⑪"이므로 일반 스트림 결정세액만 전달.
    // 특례세액은 별도 카드(specialStreamTax)로 표시 (메인 경로 gift-tax.ts 규약과 동일).
    finalTax: ordinaryFinalTax,
    hasPriorGifts: priorAggregation.matchedPriorGifts.length > 0,
    filingCreditBase: creditResult.filingCreditBase,
    // §69 신고세액공제율 — 미전달 시 별지 서식 라벨이 3% 고정(gift-filing-form-rows `?? 0.03`)이 되어
    //   계산이 적용한 증여연도별 율(2017 7%·2018 5%)과 어긋난다 (메인 경로 gift-tax.ts:403과 동일 전달).
    filingCreditRate: creditResult.filingCreditRate,
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
    // 합산배제증여재산 별도 스트림 echo (H-30·G-4) — 결과뷰 별도 카드. 빈 배열이면 undefined(현행 보존).
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
    // 2-스트림 전용 결과 필드 (T-03)
    specialStreamTax: specialStream.finalTax,
    ordinaryStreamTax: ordinaryFinalTax,
    specialStreamAggregatedValue: specialStream.aggregatedValue,
    // 특례 자산 §47① 인수 채무 (한도 차감분) — 2-스트림 카드 표시용
    specialStreamDebt: Math.min(specialItemsDebt, specialItemsValue) || undefined,
  };
  // H-47: 별지10호 ㊺ 자진납부는 서식 산식(㉞ 산출세액계 − 세액공제)상 일반 스트림 결정세액이어야 한다.
  //   partialResult.finalTax는 특례+일반(+합산배제) combined이므로 그대로 쓰면 ㊺가 filingFormRows ⑫와 어긋난다.
  //   → 일반 스트림 결정세액(ordinaryFinalTax)으로 교체. 특례·합산배제는 별도 카드(specialStreamTax·aggregationExcludedDetail).
  const besshi10Rows = buildBesshi10Rows(
    input,
    { ...partialResult, finalTax: ordinaryFinalTax },
    brackets,
  );

  return {
    ...partialResult,
    besshi10Rows,
    specialTreatmentType: input.creditInput?.specialTreatment, // M-3: §71② 연부연납 15년 구분 echo
  };
}
