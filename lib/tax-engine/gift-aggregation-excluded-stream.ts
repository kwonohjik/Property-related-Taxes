/**
 * §41의3·§41의5 합산배제증여재산 본세 스트림 (Phase A1)
 *
 * 법령(법제처 검증 2026-06-25):
 *  - §47①: 합산배제증여재산 정의에 §41의3·§41의5 포함
 *  - §47② 단서: 10년 합산 격리 ("합산배제증여재산의 경우에는 그러하지 아니하다")
 *  - §55①3호: 과세표준 = 증여재산가액 − 감정평가수수료 − 3천만원 (§53·§53의2·§54 미적용 — 4호 전용)
 *  - §56 일반세율 · §57 세대생략 할증 · §69 신고세액공제
 *
 * 일반 스트림과 독립: §47② prior 격리, §53 증여재산공제 미적용.
 */
import { GIFT as GIFT_LAW } from "./legal-codes";
import {
  evaluateAllEstateItems,
  resolveValuationMethod,
} from "./property-valuation";
import { calcAppraisalFeeDeduction } from "./deductions/appraisal-fee-deduction";
import {
  calcInheritanceGiftTax,
  calcGiftGenerationSkipSurchargeWithLimit,
} from "./inheritance-gift-common";
import {
  aggregatePriorGiftsForGift,
  getDonorGroup,
} from "./gift-prior-aggregation";
import { calcGiftTaxCredits } from "./inheritance-gift-tax-credit";
import type {
  EstateItem,
  GiftTaxInput,
  CalculationStep,
} from "./types/inheritance-gift.types";
import type { TaxBracket } from "./types";

/** §55①3호 합산배제증여재산 정액공제 */
const AGG_EXCL_DEDUCTION = 30_000_000;
/** §55② 과세최저한 */
const TAX_BASE_MIN = 500_000;

export interface AggregationExcludedStreamResult {
  /** 합산배제재산 평가액 합계 */
  grossValue: number;
  /** §55①3호 감정평가수수료 */
  appraisalFee: number;
  /** 과세표준 (증여재산가액 − 수수료 − 3천만원) */
  taxBase: number;
  /** §56 산출세액 */
  computedTax: number;
  /** §57 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** §58·§69 세액공제 합계 */
  totalCredit: number;
  /** 합산배제 스트림 결정세액 */
  finalTax: number;
  breakdown: CalculationStep[];
  warnings: string[];
}

/**
 * 합산배제증여재산(§41의3·§41의5)만으로 본세 스트림 계산.
 * 일반 스트림과 합산되기 전의 독립 결과를 반환한다.
 */
export function calcAggregationExcludedStream(
  items: EstateItem[],
  input: GiftTaxInput,
  brackets: TaxBracket[],
): AggregationExcludedStreamResult {
  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  // 평가
  const valuationResults = evaluateAllEstateItems(items);
  const grossValue = valuationResults.reduce((s, v) => s + v.valuatedAmount, 0);
  for (const vr of valuationResults) warnings.push(...vr.warnings);
  breakdown.push({
    label: "합산배제증여재산 평가액 (§47①)",
    amount: grossValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
  });

  // §55①3호 감정평가수수료
  const hasAppraisal = items.some(
    (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
  );
  const appraisalFeeResult = calcAppraisalFeeDeduction(input.appraisalFee, {
    hasAppraisalValuation: hasAppraisal,
    taxType: "gift",
  });
  const appraisalFee = appraisalFeeResult.total;
  if (appraisalFee > 0) {
    breakdown.push({
      label: "감정평가수수료 공제",
      amount: -appraisalFee,
      lawRef: GIFT_LAW.APPRAISAL_FEE,
    });
  }

  // §55①3호 과세표준 = 증여재산가액 − 감정평가수수료 − 3천만원 (§53·§54 미적용)
  const rawTaxBase = Math.max(0, grossValue - appraisalFee - AGG_EXCL_DEDUCTION);
  const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;
  breakdown.push({
    label: "합산배제 증여세 과세표준",
    amount: taxBase,
    lawRef: GIFT_LAW.TAX_BASE,
    note: "§55①3호 — 증여재산가액 − 3천만원 (§53·§54 미적용)",
  });

  // §56 산출세액
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  breakdown.push({
    label: "합산배제 산출세액",
    amount: computedTax,
    lawRef: GIFT_LAW.TAX_RATE,
  });

  // §57 세대생략 할증 (§47② prior 격리 → 빈 aggregation)
  const emptyPrior = aggregatePriorGiftsForGift([], input.giftDate, input.donor);
  const donorGroup = getDonorGroup(input.donor);
  const surchargeResult = calcGiftGenerationSkipSurchargeWithLimit(
    computedTax,
    donorGroup,
    input.isMinorDonee,
    grossValue,
    emptyPrior,
    taxBase,
    input.isSubstituteGift,
  );
  breakdown.push(...surchargeResult.breakdown);

  // §69 신고세액공제 (prior 격리 → §58 기납부 0)
  const creditResult = calcGiftTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    foreignPropertyRatio: undefined,
    giftAmount: grossValue,
    priorGiftComputedTax: 0,
    priorGiftAddedTaxBase: 0,
    aggregatedTaxBase: taxBase,
  });
  breakdown.push(...creditResult.breakdown);

  const finalTax = Math.max(
    0,
    computedTax + surchargeResult.additionalSurcharge - creditResult.totalCredit,
  );
  breakdown.push({
    label: "합산배제 결정세액",
    amount: finalTax,
    note: "= 산출세액 + 세대생략 할증 − 세액공제",
  });

  return {
    grossValue,
    appraisalFee,
    taxBase,
    computedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    totalCredit: creditResult.totalCredit,
    finalTax,
    breakdown,
    warnings,
  };
}
