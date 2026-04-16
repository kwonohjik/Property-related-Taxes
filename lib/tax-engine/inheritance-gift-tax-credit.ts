/**
 * 상속세·증여세 세액공제 통합 (상증법 §28~§30·§59·§69)
 *
 * 적용 순서 (반드시 이 순서를 지킬 것):
 *   1. 증여세액공제   (§28)    — 상속세만
 *   2. 외국납부세액공제(§29/§59)
 *   3. 단기재상속공제 (§30)    — 상속세만
 *   4. 신고세액공제   (§69 3%) — (산출세액 - 1~3 공제액) × 3%
 *   5. 조특법 특례   (§30의5·§30의6) — 대체 세율 절감액
 *
 * 결정세액 = max(0, 산출세액 + 세대생략할증 - totalCredit)
 */

import { differenceInYears } from "date-fns";
import { TAX_CREDIT, GIFT as GIFT_LAW } from "./legal-codes";
import type {
  CalculationStep,
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  PriorGift,
  TaxCreditResult,
} from "./types/inheritance-gift.types";
import {
  calcShortTermReinheritCredit,
} from "./credits/short-term-reinheritance";
import {
  calcForeignTaxCredit,
} from "./credits/foreign-tax-credit";
import {
  calcFilingCredit,
} from "./credits/filing-credit";
import {
  calcSpecialTaxTreatment,
} from "./credits/special-tax-treatment";

// ============================================================
// 증여세액공제 (§28) — 10년 이내 증여재산 합산 시 중복 세부담 방지
// ============================================================

/**
 * 증여세액공제 계산 (§28 ①)
 * 사전증여 시 납부한 증여세를 상속세에서 공제.
 *
 * 한도: (가산된 증여재산 과세표준 / 상속세 과세표준) × 산출세액  [§28 ① 안분]
 * → 상증법 §28 ①: 분모는 "상속세 과세표준", 분자는 "가산된 증여재산에 대한 과세표준"
 * → taxBase(과세표준) 미제공 시 taxableEstateValue(과세가액)로 fallback
 *
 * @param priorGifts §13 기간 필터 적용 후 사전증여 내역
 * @param computedTax 상속세 산출세액 (세대생략 할증 포함)
 * @param taxBase 상속세 과세표준 (§28 ① 안분 분모, 법령 준수)
 * @param taxableEstateValue 상속세 과세가액 (taxBase 미제공 시 fallback용)
 */
export function calcGiftTaxCredit(
  priorGifts: PriorGift[],
  computedTax: number,
  taxBase: number,
  taxableEstateValue?: number,
): { creditAmount: number; breakdown: CalculationStep[] } {
  const totalGiftTaxPaid = priorGifts.reduce(
    (sum, g) => sum + g.giftTaxPaid,
    0,
  );

  if (totalGiftTaxPaid <= 0) {
    return {
      creditAmount: 0,
      breakdown: [
        {
          label: "증여세액공제 — 사전 납부 증여세 없음",
          amount: 0,
          lawRef: TAX_CREDIT.GIFT_TAX_CREDIT,
        },
      ],
    };
  }

  // §28 ① 안분 한도: (가산된 증여재산에 대한 과세표준 / 상속세 과세표준) × 산출세액
  // 분자: giftTaxBase(증여세 과세표준) 우선, 미제공 시 giftAmount(gross가액) fallback
  // 분모: 과세표준(taxBase) 우선, 미제공 시 과세가액(taxableEstateValue) fallback
  const totalGiftTaxBase = priorGifts.reduce(
    (sum, g) => sum + (g.giftTaxBase ?? g.giftAmount),
    0,
  );
  const denominator = taxBase > 0 ? taxBase : (taxableEstateValue ?? 0);
  const ratioLimit =
    denominator > 0
      ? Math.floor((totalGiftTaxBase * computedTax) / denominator)  // 곱셈 먼저
      : computedTax;
  const creditAmount = Math.min(totalGiftTaxPaid, ratioLimit);

  const breakdown: CalculationStep[] = [
    {
      label: "10년 이내 사전 납부 증여세 합계",
      amount: totalGiftTaxPaid,
      lawRef: TAX_CREDIT.GIFT_TAX_CREDIT,
    },
  ];

  if (ratioLimit < computedTax) {
    breakdown.push({
      label: `${TAX_CREDIT.GIFT_TAX_CREDIT} ① 안분 한도 (증여세 과세표준 × 산출세액 ÷ 상속세 과세표준)`,
      amount: ratioLimit,
      note: `사전증여 과세표준 ${totalGiftTaxBase.toLocaleString()}원 / 상속세 과세표준 ${denominator.toLocaleString()}원`,
    });
  }

  if (totalGiftTaxPaid > ratioLimit) {
    breakdown.push({
      label: "안분 한도 적용 후 증여세액공제",
      amount: creditAmount,
      note: `초과 ${(totalGiftTaxPaid - ratioLimit).toLocaleString()}원 불공제`,
    });
  }

  return { creditAmount, breakdown };
}

// ============================================================
// 상속세 세액공제 통합 (§28~§30·§69)
// ============================================================

export interface InheritanceTaxCreditParams {
  creditInput: InheritanceTaxCreditInput;
  /** 산출세액 (세대생략 할증 포함 前) */
  computedTax: number;
  /** 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** 국외재산 비율 (0~1, 외국납부세액공제 한도용) */
  foreignPropertyRatio?: number;
  /** 상속세 과세가액 (§28 ① 안분 한도 fallback용) */
  taxableEstateValue: number;
  /**
   * 상속세 과세표준 (§28 ① 안분 한도 분모 — 법령 §28 기준).
   * 제공 시 과세표준을 분모로 사용. 미제공 시 taxableEstateValue(과세가액) fallback.
   */
  taxBase?: number;
  /**
   * 상속개시일 (ISO date) — §28 ① 증여세액공제에서
   * §13 합산 기간(상속인 10년, 비상속인 5년) 외 사전증여를 제외하기 위해 필요
   */
  deathDate?: string;
}

/**
 * 상속세 세액공제 전체 계산 (적용 순서 강제)
 *
 * 순서: 증여세액공제 → 외국납부 → 단기재상속 → 신고세액공제
 */
export function calcInheritanceTaxCredits(
  params: InheritanceTaxCreditParams,
): TaxCreditResult {
  const {
    creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio,
    taxableEstateValue,
    taxBase,
    deathDate,
  } = params;

  const totalComputedTax = computedTax + generationSkipSurcharge;

  const allBreakdown: CalculationStep[] = [
    {
      label: "산출세액 (할증 포함)",
      amount: totalComputedTax,
      lawRef: TAX_CREDIT.GIFT_TAX_CREDIT,
    },
  ];
  const appliedLaws: Set<string> = new Set();

  // 1. 증여세액공제 (§28)
  // §28은 §13에 따라 과세가액에 합산된 증여재산에 대해서만 적용됨.
  // deathDate가 제공된 경우 §13 합산 기간(상속인 10년, 비상속인 5년) 이내 증여만 필터링.
  const allPriorGifts = creditInput.priorGifts ?? [];
  const eligiblePriorGifts = deathDate
    ? allPriorGifts.filter((gift) => {
        const elapsed = differenceInYears(new Date(deathDate), new Date(gift.giftDate));
        const limitYears = gift.isHeir ? 10 : 5;
        return elapsed <= limitYears;
      })
    : allPriorGifts;

  const { creditAmount: giftTaxCredit, breakdown: giftBreakdown } =
    calcGiftTaxCredit(
      eligiblePriorGifts,
      totalComputedTax,
      taxBase ?? 0,          // §28 ① 분모: 과세표준 우선
      taxableEstateValue,    // 과세표준 0이면 과세가액 fallback
    );
  allBreakdown.push(...giftBreakdown);
  appliedLaws.add(TAX_CREDIT.GIFT_TAX_CREDIT);

  let remainingTax = totalComputedTax - giftTaxCredit;

  // 2. 외국납부세액공제 (§29)
  const foreignResult = calcForeignTaxCredit({
    foreignTaxPaid: creditInput.foreignTaxPaid ?? 0,
    computedTax: remainingTax,
    foreignPropertyRatio,
    mode: "inheritance",
  });
  const foreignTaxCredit = foreignResult.creditAmount;
  allBreakdown.push(...foreignResult.breakdown);
  if (foreignTaxCredit > 0) appliedLaws.add(TAX_CREDIT.INH_FOREIGN);

  remainingTax -= foreignTaxCredit;

  // 3. 단기재상속세액공제 (§30)
  // §30 ② 한도는 "당해 상속세 산출세액" 기준 → totalComputedTax(원본)를 한도로 전달하고,
  // 실제 공제 적용은 remainingTax를 초과하지 않도록 별도 클램핑.
  let shortTermReinheritCredit = 0;
  if (
    creditInput.shortTermReinheritYears !== undefined &&
    creditInput.shortTermReinheritTaxPaid !== undefined
  ) {
    const shortTermResult = calcShortTermReinheritCredit({
      priorTaxPaid: creditInput.shortTermReinheritTaxPaid,
      elapsedYears: creditInput.shortTermReinheritYears,
      currentComputedTax: totalComputedTax, // §30 ② 한도: 원래 산출세액 기준
    });
    // 선행 공제 차감 후 잔액을 초과하지 않도록 클램핑
    shortTermReinheritCredit = Math.min(shortTermResult.creditAmount, remainingTax);
    allBreakdown.push(...shortTermResult.breakdown);
    if (shortTermReinheritCredit > 0) appliedLaws.add(TAX_CREDIT.SHORT_TERM_REINH);
    remainingTax -= shortTermReinheritCredit;
  }

  // 4. 신고세액공제 (§69) — 나머지 금액의 3%
  const filingResult = calcFilingCredit({
    isFiledOnTime: creditInput.isFiledOnTime,
    taxBeforeFilingCredit: Math.max(0, remainingTax),
  });
  const filingCredit = filingResult.creditAmount;
  allBreakdown.push(...filingResult.breakdown);
  if (filingCredit > 0) appliedLaws.add(TAX_CREDIT.FILING_CREDIT);

  const totalCredit =
    giftTaxCredit + foreignTaxCredit + shortTermReinheritCredit + filingCredit;

  allBreakdown.push({
    label: "세액공제 합계",
    amount: totalCredit,
  });

  return {
    giftTaxCredit,
    foreignTaxCredit,
    shortTermReinheritCredit,
    filingCredit,
    specialTreatmentCredit: 0, // 상속세: 조특법 특례 없음
    totalCredit,
    breakdown: allBreakdown,
    appliedLaws: Array.from(appliedLaws),
  };
}

// ============================================================
// 증여세 세액공제 통합 (§59·§69 + 조특법 특례)
// ============================================================

export interface GiftTaxCreditParams {
  creditInput: GiftTaxCreditInput;
  /** 산출세액 (세대생략 할증 포함 前) */
  computedTax: number;
  /** 세대생략 할증액 */
  generationSkipSurcharge: number;
  /** 국외재산 비율 */
  foreignPropertyRatio?: number;
  /** 증여재산가액 (특례 절감액 계산용) */
  giftAmount?: number;
  /**
   * 10년 합산 기증여에 이미 납부한 증여세 합계 (§58 ① 기납부세액공제)
   * 합산 증여 시 과거 납부세액을 공제하여 이중과세 방지
   */
  priorGiftTaxPaid?: number;
}

/**
 * 증여세 세액공제 전체 계산 (적용 순서 강제)
 *
 * 순서: 외국납부 → 신고세액공제 → (조특법 특례 절감액)
 * 단, 조특법 특례 선택 시 computedTax 자체가 특례세액이므로 filingCredit은 특례세액 기준
 */
export function calcGiftTaxCredits(params: GiftTaxCreditParams): TaxCreditResult {
  const {
    creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio,
    giftAmount = 0,
    priorGiftTaxPaid = 0,
  } = params;

  const totalComputedTax = computedTax + generationSkipSurcharge;

  const allBreakdown: CalculationStep[] = [
    {
      label: "증여세 산출세액 (할증 포함)",
      amount: totalComputedTax,
      lawRef: GIFT_LAW.TAX_RATE,
    },
  ];
  const appliedLaws: Set<string> = new Set();

  // 0. 기납부세액공제 (§58 ① — 10년 합산 시 과거 납부 증여세 공제)
  let priorPaidCredit = 0;
  if (priorGiftTaxPaid > 0) {
    // 공제 한도: 산출세액을 초과할 수 없음
    priorPaidCredit = Math.min(priorGiftTaxPaid, totalComputedTax);
    allBreakdown.push({
      label: `기납부세액공제 (${GIFT_LAW.PRIOR_TAX_CREDIT} ①) — 합산 기증여 납부 증여세`,
      amount: -priorPaidCredit,
      lawRef: GIFT_LAW.PRIOR_TAX_CREDIT,
      note: `과거 납부액 ${priorGiftTaxPaid.toLocaleString()}원, 산출세액 한도 적용`,
    });
    appliedLaws.add(GIFT_LAW.PRIOR_TAX_CREDIT);
  }

  // 1. 외국납부세액공제 (§59)
  const foreignResult = calcForeignTaxCredit({
    foreignTaxPaid: creditInput.foreignTaxPaid ?? 0,
    computedTax: totalComputedTax,
    foreignPropertyRatio,
    mode: "gift",
  });
  const foreignTaxCredit = foreignResult.creditAmount;
  allBreakdown.push(...foreignResult.breakdown);
  if (foreignTaxCredit > 0) appliedLaws.add(TAX_CREDIT.GIFT_FOREIGN);

  // §58 ① 기납부세액과 외국납부세액을 먼저 차감한 후 신고세액공제(3%) 기준 산정.
  // 신고세액공제는 "기납부 및 외국납부 공제 후 남은 세액"의 3%이므로
  // priorPaidCredit를 반드시 remainingTax에서 차감해야 함.
  let remainingTax = Math.max(0, totalComputedTax - priorPaidCredit - foreignTaxCredit);

  // 2. 조특법 특례 절감액 계산 (선택 시)
  let specialTreatmentCredit = 0;
  if (creditInput.specialTreatment && giftAmount > 0) {
    const specialResult = calcSpecialTaxTreatment({
      type: creditInput.specialTreatment,
      giftAmount,
      normalComputedTax: totalComputedTax,
      startupInvestmentCompleted: creditInput.startupInvestmentCompleted,
    });
    specialTreatmentCredit = specialResult.creditAmount;
    allBreakdown.push(...specialResult.breakdown);
    if (specialTreatmentCredit > 0) {
      appliedLaws.add(
        creditInput.specialTreatment === "startup"
          ? TAX_CREDIT.STARTUP_FUND
          : TAX_CREDIT.FAMILY_BUSINESS,
      );
    }
    // 특례 선택 시 remainingTax도 특례 절감 반영
    remainingTax = Math.max(0, remainingTax - specialTreatmentCredit);
  }

  // 3. 신고세액공제 (§69) — 남은 금액의 3%
  const filingResult = calcFilingCredit({
    isFiledOnTime: creditInput.isFiledOnTime,
    taxBeforeFilingCredit: Math.max(0, remainingTax),
  });
  const filingCredit = filingResult.creditAmount;
  allBreakdown.push(...filingResult.breakdown);
  if (filingCredit > 0) appliedLaws.add(TAX_CREDIT.FILING_CREDIT);

  const totalCredit =
    priorPaidCredit + foreignTaxCredit + specialTreatmentCredit + filingCredit;

  allBreakdown.push({
    label: "세액공제 합계",
    amount: totalCredit,
  });

  return {
    giftTaxCredit: priorPaidCredit, // §58 기납부세액공제 (상속세 §28과 유사)
    foreignTaxCredit,
    shortTermReinheritCredit: 0, // 증여세: 단기재상속 없음
    filingCredit,
    specialTreatmentCredit,
    totalCredit,
    breakdown: allBreakdown,
    appliedLaws: Array.from(appliedLaws),
  };
}
