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

import { TAX_CREDIT, GIFT as GIFT_LAW } from "./legal-codes";
import { isWithin13Cutoff } from "./inheritance-gift-common";
import { safeMultiplyThenDivide } from "./tax-utils";
import type {
  CalculationStep,
  InheritanceTaxCreditInput,
  GiftTaxCreditInput,
  PriorGift,
  TaxCreditResult,
} from "./types/inheritance-gift.types";
import {
  calcShortTermReinheritCredit,
  deriveShortTermReinheritBand,
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
 * §28 ① 단서 — 과세가액 5억 이하 전면 배제:
 * "다만, … 상속세 과세가액이 5억원 이하인 경우에는 그러하지 아니하다"
 * → taxableEstateValue ≤ TAX_CREDIT.GIFT_TAX_CREDIT_EXCLUSION_THRESHOLD(5억)이면 공제 0.
 * (국기법 §26의2④⑤ 기간만료 배제 조항은 별도 후속 — TODO 주석 참조)
 *
 * @param priorGifts §13 기간 필터 적용 후 사전증여 내역
 * @param computedTax 상속세 산출세액 (세대생략 할증 포함)
 * @param taxBase 상속세 과세표준 (§28 ① 안분 분모, 법령 준수)
 * @param taxableEstateValue 상속세 과세가액 (taxBase 미제공 시 fallback용 + §28① 단서 임계 비교)
 */
export function calcGiftTaxCredit(
  priorGifts: PriorGift[],
  computedTax: number,
  taxBase: number,
  taxableEstateValue?: number,
): { creditAmount: number; breakdown: CalculationStep[] } {
  // §28 ① 단서: 상속세 과세가액 ≤ 5억이면 증여세액공제 전면 배제
  // taxableEstateValue 미제공(undefined) 시 단서 미적용(보수적 처리 — 과대공제 방향)
  if (
    taxableEstateValue !== undefined &&
    taxableEstateValue <= TAX_CREDIT.GIFT_TAX_CREDIT_EXCLUSION_THRESHOLD
  ) {
    return {
      creditAmount: 0,
      breakdown: [
        {
          label:
            `증여세액공제 배제 — 상속세 과세가액(${taxableEstateValue.toLocaleString()}) ≤ 5억원 (${TAX_CREDIT.GIFT_TAX_CREDIT} ① 단서)`,
          amount: 0,
          lawRef: TAX_CREDIT.GIFT_TAX_CREDIT,
          note:
            "상증법 §28① 단서: 과세가액 5억원 이하이면 증여세액공제 적용하지 아니함",
        },
      ],
    };
  }

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
      note: `사전증여 과세표준 ${totalGiftTaxBase.toLocaleString()} / 상속세 과세표준 ${denominator.toLocaleString()}`,
    });
  }

  if (totalGiftTaxPaid > ratioLimit) {
    breakdown.push({
      label: "안분 한도 적용 후 증여세액공제",
      amount: creditAmount,
      note: `초과 ${(totalGiftTaxPaid - ratioLimit).toLocaleString()} 불공제`,
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
  /** @deprecated 도달 불가 — 미사용. §29 한도는 creditInput.foreignInheritanceTaxBase + taxBase로 계산. */
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
  /**
   * 영리법인 면제세액 (§3의2②). §69①2호 "산출세액에서 공제·감면되는 금액"에 해당 →
   * 신고세액공제 기준세액에서 차감. 배부 발동 시(Path A)는 inheritance-tax.ts STEP 13.5가
   * 배부표 합으로 덮어쓰므로 본 값은 배부 미발동(Path B) fallback 정합용.
   * 기본 0 (영리법인 사전증여 없음).
   */
  corporateExemptionAmount?: number;
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
    taxableEstateValue,
    taxBase,
    deathDate,
    corporateExemptionAmount = 0,
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

  // 1. 증여세액공제 (§28) + 조특법 §30의5⑩ 특례 직접 공제
  // §28①: "제13조에 따라 상속재산에 가산한 증여재산에 대한 증여세액" — §13 기준이 단일 진실.
  // isWithin13Cutoff(inheritance-gift-common.ts)를 재사용하여 §13 합산 집합 == §28 eligible 집합
  // 보장. 일(日) 단위 비교: boundary = subYears(deathDate, limitYears), 경계일 포함.
  //
  // 조특법 §30의5⑩·§30의6⑤: 창업자금·가업승계 특례 prior는 §28② 안분 한도 배제 → 직접 전액 공제.
  // 적용 순서: 일반 §28① 공제(normalPriorGifts) 선행 → 특례 §30의5⑩ 공제(specialPriorGifts) 후행.
  const allPriorGifts = creditInput.priorGifts ?? [];
  const eligiblePriorGifts = deathDate
    ? allPriorGifts.filter((gift) => isWithin13Cutoff(gift, deathDate))
    : allPriorGifts;

  // 일반 prior: §28① 안분 한도 적용
  const normalPriorGifts = eligiblePriorGifts.filter(
    (g) => g.specialTreatmentType === undefined,
  );
  // 특례 prior: §30의5⑩ 직접 공제 대상 (창업자금·가업승계)
  const specialPriorGifts = eligiblePriorGifts.filter(
    (g) => g.specialTreatmentType !== undefined,
  );

  const { creditAmount: giftTaxCredit, breakdown: giftBreakdown } =
    calcGiftTaxCredit(
      normalPriorGifts,
      totalComputedTax,
      taxBase ?? 0,          // §28 ① 분모: 과세표준 우선
      taxableEstateValue,    // 과세표준 0이면 과세가액 fallback
    );
  allBreakdown.push(...giftBreakdown);
  appliedLaws.add(TAX_CREDIT.GIFT_TAX_CREDIT);

  // 조특법 §30의5⑩ 직접 공제: specialTreatmentType prior의 giftTaxPaid 합계
  // 한도: max(0, 산출세액 − 일반 §28 공제분) — 초과환급 불가
  const specialTaxPaidTotal = specialPriorGifts.reduce(
    (s, g) => s + (g.giftTaxPaid ?? 0),
    0,
  );
  const specialTreatmentCredit = Math.min(
    specialTaxPaidTotal,
    Math.max(0, totalComputedTax - giftTaxCredit),
  );
  if (specialTreatmentCredit > 0) {
    allBreakdown.push({
      label: `조특법 §30의5⑩ 특례 증여세액 직접 공제`,
      amount: specialTreatmentCredit,
      lawRef: TAX_CREDIT.STARTUP_FUND_TAX_CREDIT,
    });
    appliedLaws.add(TAX_CREDIT.STARTUP_FUND_TAX_CREDIT);
  }

  let remainingTax = totalComputedTax - giftTaxCredit - specialTreatmentCredit;

  // 2. 외국납부세액공제 (§29 / 상증령 §21①)
  // 한도 = totalComputedTax(원 산출세액, §28 차감 前) × (국외 과세표준 ÷ 전체 과세표준).
  // 실제 공제는 §28 차감 후 잔액(remainingTax)을 초과하지 않도록 클램핑 (§30 패턴).
  const foreignResult = calcForeignTaxCredit({
    foreignTaxPaid: creditInput.foreignTaxPaid ?? 0,
    computedTax: totalComputedTax,
    foreignInheritanceTaxBase: creditInput.foreignInheritanceTaxBase,
    overallTaxBase: taxBase ?? 0,
    mode: "inheritance",
  });
  const foreignTaxCredit = Math.min(foreignResult.creditAmount, remainingTax);
  allBreakdown.push(...foreignResult.breakdown);
  if (foreignTaxCredit > 0) appliedLaws.add(TAX_CREDIT.INH_FOREIGN);

  // §29 산식 표시용 echo — 잔액 클램핑 후 최종 공제액으로 조립 (P1·P3)
  const foreignCreditDetail = foreignResult.detail
    ? { ...foreignResult.detail, creditAmount: foreignTaxCredit }
    : undefined;

  remainingTax -= foreignTaxCredit;

  // 3. 단기재상속세액공제 (§30)
  // §30 ② 한도는 "당해 상속세 산출세액" 기준 → totalComputedTax(원본)를 한도로 전달하고,
  // 실제 공제 적용(§30③)은 remainingTax(산출 − §28 − §29)를 초과하지 않도록 클램핑.
  // band: 1차·2차 상속개시일 자동 도출(올림) 우선, 부재 시 legacy shortTermReinheritYears(수동).
  let shortTermReinheritCredit = 0;
  let shortTermReinheritDetail: TaxCreditResult["shortTermReinheritDetail"] = undefined;
  const stPriorDeath = creditInput.shortTermReinheritPriorDeathDate;
  const stBand =
    stPriorDeath && deathDate
      ? deriveShortTermReinheritBand(stPriorDeath, deathDate)
      : creditInput.shortTermReinheritYears;
  if (
    stBand !== undefined &&
    creditInput.shortTermReinheritTaxPaid !== undefined
  ) {
    const shortTermResult = calcShortTermReinheritCredit({
      priorTaxPaid: creditInput.shortTermReinheritTaxPaid,
      elapsedYears: stBand,
      currentComputedTax: totalComputedTax, // §30 ② 보조 한도
      // 재산별 구분(집행 30-22-1②) — assets 우선, 미입력 시 legacy 단일 분자 / 전부재상속 fallback
      assets: creditInput.shortTermReinheritAssets,
      shortTermReinheritAssetValue: creditInput.shortTermReinheritAssetValue,
      shortTermReinheritPriorEstateValue: creditInput.shortTermReinheritPriorEstateValue,
    });
    // §30③ — 선행 공제 차감 후 잔액(remainingTax)을 초과하지 않도록 클램핑
    shortTermReinheritCredit = Math.min(shortTermResult.creditAmount, remainingTax);
    allBreakdown.push(...shortTermResult.breakdown);
    if (shortTermReinheritCredit > 0) {
      appliedLaws.add(TAX_CREDIT.SHORT_TERM_REINH);
      // echo: 결과뷰 재산별 표 (limit = §30③ 한도 = §30 적용 직전 remainingTax)
      shortTermReinheritDetail = {
        band: shortTermResult.band,
        creditRate: shortTermResult.creditRate,
        priorComputedTax: creditInput.shortTermReinheritTaxPaid,
        priorEstateValue: creditInput.shortTermReinheritPriorEstateValue ?? 0,
        perAsset: shortTermResult.perAsset,
        creditAmount: shortTermResult.perAsset.reduce((s, p) => s + p.credit, 0),
        limit: remainingTax,
      };
    }
    remainingTax -= shortTermReinheritCredit;
  }

  // 4. 신고세액공제 (§69) — 나머지 금액의 3%
  //   §69①2호: 영리법인 면제세액(§3의2②)도 "산출세액에서 공제·감면되는 금액"에 해당 → 기준에서 차감.
  const filingCreditBaseAmount = Math.max(0, remainingTax - corporateExemptionAmount);
  const filingResult = calcFilingCredit({
    isFiledOnTime: creditInput.isFiledOnTime,
    taxBeforeFilingCredit: filingCreditBaseAmount,
  });
  const filingCredit = filingResult.creditAmount;
  allBreakdown.push(...filingResult.breakdown);
  if (filingCredit > 0) appliedLaws.add(TAX_CREDIT.FILING_CREDIT);

  const totalCredit =
    giftTaxCredit + specialTreatmentCredit + foreignTaxCredit + shortTermReinheritCredit + filingCredit;

  allBreakdown.push({
    label: "세액공제 합계",
    amount: totalCredit,
  });

  return {
    giftTaxCredit,
    foreignTaxCredit,
    shortTermReinheritCredit,
    filingCredit,
    specialTreatmentCredit,
    totalCredit,
    breakdown: allBreakdown,
    appliedLaws: Array.from(appliedLaws),
    // §69 산식 노출용 echo (UI TaxCreditBreakdownCard 산출근거 펼침) — PR1
    // §28·§29·§30 + 영리법인 면제(§3의2②) 차감 후·§69 적용 전 값(calcFilingCredit의
    // taxBeforeFilingCredit와 동일). 증여세 경로와 달리 단기재상속공제(§30)까지 반영됨.
    filingCreditBase: filingCreditBaseAmount,
    totalComputedTaxWithSurcharge: totalComputedTax,
    foreignCreditDetail,
    // §30 재산별 표 echo (결과뷰 TaxCreditBreakdownCard)
    shortTermReinheritDetail,
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
  /** @deprecated 도달 불가 — 미사용 (gift §59 한도 미적용). */
  foreignPropertyRatio?: number;
  /** 증여재산가액 (특례 절감액 계산용) */
  giftAmount?: number;
  /**
   * @deprecated Phase A — `priorGiftComputedTax` + `priorGiftAddedTaxBase` + `aggregatedTaxBase` 사용 권장.
   * Legacy: 산출세액 한도 단순 차감. §58 안분 한도식 미적용.
   */
  priorGiftTaxPaid?: number;
  // ===== Phase A: §58 안분 한도식 적용 =====
  /**
   * 가장 최근 합산 회차의 산출세액 ⑦ (= 사례 1·2 PDF 표의 ⑧/⑭).
   * priorAggregation.totalComputedTax 값을 그대로 전달.
   */
  priorGiftComputedTax?: number;
  /**
   * 가장 최근 합산 회차의 합산과세표준 ⑤_prior (§58 한도 분자).
   * priorAggregation.priorAddedTaxBase 값을 그대로 전달.
   */
  priorGiftAddedTaxBase?: number;
  /**
   * 금번 합산과세표준 ⑤ (§58 한도 분모).
   * Phase A: priorGiftComputedTax > 0 일 때만 한도 산식 적용.
   */
  aggregatedTaxBase?: number;
  /**
   * 조특법 §71 농지 감면세액 (gift-farmland-reduction-71).
   * §69 신고세액공제 기준(remainingTax)에서 §58·외국납부와 함께 차감 (G-5).
   * 미입력/0 = 농지 감면 없음(기존 동작 불변).
   */
  farmlandReductionAmount?: number;
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
    giftAmount = 0,
    priorGiftTaxPaid = 0,
    priorGiftComputedTax = 0,
    priorGiftAddedTaxBase = 0,
    aggregatedTaxBase = 0,
    farmlandReductionAmount = 0,
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

  // 0. §58 ① 기납부세액공제 — Phase A 안분 한도식 우선 적용
  //    한도 = floor(⑦(할증 전) × ⑤_prior / ⑤)  [PDF 사례 1·2 ⑨/⑮]
  //    공제액 = Min(가장 최근 합산 회차 ⑦, 한도)  [⑩/⑯]
  let priorPaidCredit = 0;
  const usePhaseAFormula =
    priorGiftComputedTax > 0 && aggregatedTaxBase > 0 && priorGiftAddedTaxBase > 0;

  if (usePhaseAFormula) {
    const limit58 = safeMultiplyThenDivide(computedTax, priorGiftAddedTaxBase, aggregatedTaxBase);
    priorPaidCredit = Math.min(priorGiftComputedTax, limit58);
    allBreakdown.push({
      label: `§58 ① 한도 — ⑦ × ⑤_prior / ⑤`,
      amount: limit58,
      lawRef: GIFT_LAW.PRIOR_TAX_CREDIT_LIMIT_FORMULA,
      note: `${computedTax.toLocaleString()} × ${priorGiftAddedTaxBase.toLocaleString()} / ${aggregatedTaxBase.toLocaleString()}`,
    });
    allBreakdown.push({
      label: `§58 ① 공제액 Min(가산 산출세액, 한도)`,
      amount: -priorPaidCredit,
      lawRef: GIFT_LAW.PRIOR_TAX_CREDIT,
      note: `가산 산출세액 ${priorGiftComputedTax.toLocaleString()}, 한도 ${limit58.toLocaleString()}`,
    });
    appliedLaws.add(GIFT_LAW.PRIOR_TAX_CREDIT);
    appliedLaws.add(GIFT_LAW.PRIOR_TAX_CREDIT_LIMIT_FORMULA);
  } else if (priorGiftTaxPaid > 0) {
    // Legacy: priorGiftTaxPaid 매개변수 (deprecated, 단순 산출세액 한도)
    priorPaidCredit = Math.min(priorGiftTaxPaid, totalComputedTax);
    allBreakdown.push({
      label: `기납부세액공제 (${GIFT_LAW.PRIOR_TAX_CREDIT} ①) — Legacy 단순 차감`,
      amount: -priorPaidCredit,
      lawRef: GIFT_LAW.PRIOR_TAX_CREDIT,
      note: `과거 납부액 ${priorGiftTaxPaid.toLocaleString()}, 산출세액 한도 적용 (Phase A 산식 미사용)`,
    });
    appliedLaws.add(GIFT_LAW.PRIOR_TAX_CREDIT);
  }

  // 1. 외국납부세액공제 (§59)
  const foreignResult = calcForeignTaxCredit({
    foreignTaxPaid: creditInput.foreignTaxPaid ?? 0,
    computedTax: totalComputedTax,
    mode: "gift",
  });
  const foreignTaxCredit = foreignResult.creditAmount;
  allBreakdown.push(...foreignResult.breakdown);
  if (foreignTaxCredit > 0) appliedLaws.add(TAX_CREDIT.GIFT_FOREIGN);

  // §58 ① 기납부세액과 외국납부세액을 먼저 차감한 후 신고세액공제(3%) 기준 산정.
  // 신고세액공제는 "기납부 및 외국납부 공제 후 남은 세액"의 3%이므로
  // priorPaidCredit를 반드시 remainingTax에서 차감해야 함.
  let remainingTax = Math.max(0, totalComputedTax - priorPaidCredit - foreignTaxCredit);

  // 1.5 조특법 §71 농지 감면세액 — §69 기준에서 차감 (G-5). 산식·산출세액 영향 없음(§69 base만 축소).
  if (farmlandReductionAmount > 0) {
    remainingTax = Math.max(0, remainingTax - farmlandReductionAmount);
    allBreakdown.push({
      label: "조특법 §71 농지 감면세액 (§69 신고세액공제 기준 차감)",
      amount: -farmlandReductionAmount,
      lawRef: GIFT_LAW.FARMLAND_REDUCTION,
    });
    appliedLaws.add(GIFT_LAW.FARMLAND_REDUCTION);
  }

  // 2. 조특법 특례 절감액 계산 (선택 시)
  let specialTreatmentCredit = 0;
  if (creditInput.specialTreatment && giftAmount > 0) {
    const specialResult = calcSpecialTaxTreatment({
      type: creditInput.specialTreatment,
      giftAmount,
      normalComputedTax: totalComputedTax,
      startupInvestmentCompleted: creditInput.startupInvestmentCompleted,
      startupNewHiresAtLeast10: creditInput.startupNewHiresAtLeast10,
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

  // D5: §30의5⑪ 신고세액공제 배제 — 특례 적용(specialTreatmentCredit > 0) 시 §69 배제
  // §30의5⑪: "제1항을 적용받는 자에 대하여는 §69를 적용하지 아니한다"
  // §30의6⑤가 §30의5⑪ 준용 → 가업승계 특례에도 동일 배제
  // 미적격(투자미완료·10년미만) 폴백 시 specialTreatmentCredit=0 → §69 정상 적용
  const isSpecialTreatmentApplied = specialTreatmentCredit > 0;

  // 3. 신고세액공제 (§69) — 남은 금액의 3% (D5: 특례 적격 시 배제)
  const filingResult = calcFilingCredit({
    isFiledOnTime: creditInput.isFiledOnTime && !isSpecialTreatmentApplied,
    taxBeforeFilingCredit: Math.max(0, remainingTax),
  });
  const filingCredit = filingResult.creditAmount;
  allBreakdown.push(...filingResult.breakdown);
  // D5: 특례 적격 + 기한 내 신고 시 배제 사유 echo
  if (isSpecialTreatmentApplied && creditInput.isFiledOnTime) {
    allBreakdown.push({
      label: TAX_CREDIT.STARTUP_FUND_NO_FILING_CREDIT + " 적용 — 신고세액공제 배제",
      amount: 0,
      lawRef: TAX_CREDIT.STARTUP_FUND_NO_FILING_CREDIT,
      note: "조특법 §30의5⑪: 과세특례를 적용받는 자에 대하여는 §69(신고세액공제)를 적용하지 아니함",
    });
  }
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
    // §69 산식 노출용 echo (UI TaxCreditBreakdownCard 산출근거 펼침)
    filingCreditBase: Math.max(0, remainingTax),
    totalComputedTaxWithSurcharge: totalComputedTax,
  };
}
