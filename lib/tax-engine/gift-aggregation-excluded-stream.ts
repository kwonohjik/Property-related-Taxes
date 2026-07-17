/**
 * 합산배제증여재산 본세 스트림 (Phase A1 · G-4 §55① 호분기 확장)
 *
 * 법령(법제처 검증 2026-06-25·2026-07-17):
 *  - §47①: 합산배제증여재산 = §31①3호·§40①2·3호·§41의3·§41의5·§42의3·§45·§45의2~§45의4
 *  - §47② 단서: 10년 합산 격리 ("합산배제증여재산의 경우에는 그러하지 아니하다")
 *  - §55① 과세표준 호분기 (감정평가수수료 차감은 각 호 공통):
 *      1호 §45의2 명의신탁: 명의신탁재산금액 (3천만 공제 없음)
 *      2호 §45의3·§45의4 일감몰아주기·사업기회: 증여의제이익 (3천만 공제 없음)
 *      3호 그 밖의 합산배제: 증여재산가액 − 3천만원 (§53·§53의2·§54 미적용)
 *  - §56 일반세율 · §57 세대생략 할증 · §69 신고세액공제
 *
 * 일반 스트림과 독립: §47② prior 격리, §53 증여재산공제 미적용.
 */
import { GIFT as GIFT_LAW } from "./legal-codes";
import {
  evaluateAllEstateItems,
  resolveValuationMethod,
  COLLATERAL_DEBT_NOTICE,
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

/** §55① 호분기 그룹 키 (표시·계산 순서: 3호 → 1호 → 2호) */
type AggExclClass = "general" | "nominee_trust" | "deemed_profit";
const CLASS_ORDER: AggExclClass[] = ["general", "nominee_trust", "deemed_profit"];
const CLASS_LABEL: Record<AggExclClass, string> = {
  general: "합산배제(§55①3호)",
  nominee_trust: "명의신탁(§55①1호)",
  deemed_profit: "증여의제이익(§55①2호)",
};
/** §55① 호별 정액공제 — 3호만 3천만, 1·2호는 공제 없음 */
function classDeduction(cls: AggExclClass): number {
  return cls === "general" ? AGG_EXCL_DEDUCTION : 0;
}
function resolveAggExclClass(item: EstateItem): AggExclClass {
  return item.aggregationExcludedClass ?? "general";
}

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
 * 합산배제증여재산만으로 본세 스트림 계산 (§55① 호분기).
 * 일반 스트림과 합산되기 전의 독립 결과를 반환한다.
 *
 * @param mainStreamHasAppraisal 일반 스트림이 이미 폼전역 감정평가수수료를 차감했는지 (M-2 이중공제 방지).
 *   true면 합산배제 스트림은 수수료를 재차감하지 않는다(폼전역 수수료는 단일 pool).
 */
export function calcAggregationExcludedStream(
  items: EstateItem[],
  input: GiftTaxInput,
  brackets: TaxBracket[],
  mainStreamHasAppraisal: boolean = false,
): AggregationExcludedStreamResult {
  const breakdown: CalculationStep[] = [];
  const warnings: string[] = [];

  // 평가
  const valuationResults = evaluateAllEstateItems(items);
  const grossValue = valuationResults.reduce((s, v) => s + v.valuatedAmount, 0);
  // §14 담보채무 안내는 상속세 전용 → 증여 결과에서 제외 (메인 스트림 gift-tax.ts와 동일 필터)
  for (const vr of valuationResults)
    warnings.push(...vr.warnings.filter((w) => w !== COLLATERAL_DEBT_NOTICE));
  breakdown.push({
    label: "합산배제증여재산 평가액 (§47①)",
    amount: grossValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
  });

  // §55① 감정평가수수료 — 폼전역 수수료는 단일 pool. 일반 스트림이 이미 차감했으면(M-2) 재차감 금지.
  const hasAppraisal = items.some(
    (i) => (i.valuationMethod ?? resolveValuationMethod(i)) === "appraisal",
  );
  const appraisalFeeResult = calcAppraisalFeeDeduction(input.appraisalFee, {
    hasAppraisalValuation: hasAppraisal && !mainStreamHasAppraisal,
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

  // §55① 호분기 과세표준 — 자산을 호별 그룹으로 나눠 각 호의 정액공제 적용 후 산출세액 합산.
  //   감정평가수수료(단일 pool)는 최우선 present 그룹의 과세표준에서 차감(§55① 각 호 공통 차감항목).
  const valuationByItem = new Map<EstateItem, number>();
  items.forEach((it, idx) => valuationByItem.set(it, valuationResults[idx]?.valuatedAmount ?? 0));
  const grossByClass = new Map<AggExclClass, number>();
  for (const it of items) {
    const cls = resolveAggExclClass(it);
    grossByClass.set(cls, (grossByClass.get(cls) ?? 0) + (valuationByItem.get(it) ?? 0));
  }
  const feeClass = CLASS_ORDER.find((c) => (grossByClass.get(c) ?? 0) > 0); // 수수료 귀속 그룹 (present 최우선)

  let taxBase = 0;
  let computedTax = 0;
  for (const cls of CLASS_ORDER) {
    const gross = grossByClass.get(cls) ?? 0;
    if (gross <= 0) continue;
    const feeForClass = cls === feeClass ? appraisalFee : 0;
    const rawBase = Math.max(0, gross - feeForClass - classDeduction(cls));
    const classBase = rawBase < TAX_BASE_MIN ? 0 : rawBase;
    const classTax = calcInheritanceGiftTax(classBase, brackets);
    taxBase += classBase;
    computedTax += classTax;
    breakdown.push({
      label: `${CLASS_LABEL[cls]} 과세표준`,
      amount: classBase,
      lawRef: GIFT_LAW.TAX_BASE,
      note:
        cls === "general"
          ? "§55①3호 — 증여재산가액 − 3천만원 (§53·§54 미적용)"
          : cls === "nominee_trust"
            ? "§55①1호 — 명의신탁재산금액 (3천만 공제 없음)"
            : "§55①2호 — 증여의제이익 (3천만 공제 없음)",
    });
  }
  breakdown.push({
    label: "합산배제 산출세액",
    amount: computedTax,
    lawRef: GIFT_LAW.TAX_RATE,
    note: "호별 과세표준 산출세액 합계 (§56)",
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
  // C-15: §59 외국납부세액공제(foreignTaxPaid)는 메인 스트림에 일원화 — 합산배제 스트림에서 제거해
  //   메인+합산배제 각각 전액 공제되던 2배 공제 방지 (실제 부과받은 외국세액 1회분만 공제, §59).
  // H-30: 조특법 §30의5·§30의6 특례공제(specialTreatment)는 특례 스트림 전용 — 합산배제 스트림에서 제거
  //   (2스트림 경로에서 creditInput.specialTreatment 누출 시 합산배제세액이 특례공제로 과다감소).
  const creditResult = calcGiftTaxCredits({
    creditInput: { ...input.creditInput, foreignTaxPaid: undefined, specialTreatment: undefined },
    computedTax,
    generationSkipSurcharge: surchargeResult.additionalSurcharge,
    giftDate: input.giftDate, // §69 신고세액공제율 증여연도 기준 (H-22 — 미전달 시 3% 고정 버그)
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
