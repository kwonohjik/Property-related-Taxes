/**
 * (1) 신탁이익의 증여 (상증법 §33) — 평가 상증령 §61·§62 / 이자율 상증칙 §19의2
 *
 * 검증: KoreanLaw §33·령§25·§61·§62·칙§19의2 본문(2026-06-19). 계산사례 anchor: 교재 §2장 p.557.
 *
 * §33①: 원본권(1호)·수익권(2호) **각각 증여**(증여시기 분리, §25①). 분할은 §25② → 증여시기 기준 §61 준용.
 * §61①: 1호 동일수익자=신탁재산 가액 / 2호 다른수익자(가.원본권=재산−수익권 / 나.수익권=연수익 현가합).
 *   단서: 평가기준일 현재 전체 해지·철회·취소 일시금 > 평가액 → 일시금(합계 Max).
 * §61②→§62: 수익시기 미정 — 무기(§62 2호)=20년 / 종신(§62 3호)=기대여명(소수점 버림 floor).
 *   유기(§62 1호) 20배 cap은 §61 미준용(연수만 차용) → 신탁 PV에 미적용.
 * §19의2: ① 이자율 3%(30/1000) / ② 미확정 시 원본×3% / ③ §62 이자율 3%.
 *
 * D2(교재·사용자 확인): 동일수익자라도 원본권·수익권을 별개 증여로 분리 산출(subGifts 2건). 합계만 표시.
 */
import { GIFT } from "../legal-codes";
import { applyRateFraction } from "../tax-utils";
import { getLifeExpectancyFloor } from "../data/life-expectancy-2023";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, TrustBenefitInput } from "./types";

/** 상증칙 §19의2① 이자율 = 연 1,000분의 30 (수익률 미확정 시 §19의2② 원본×30/1000도 동일) */
const TRUST_RATE = { numer: 30, denom: 1000 } as const;

/** 1/(1.03)ⁿ floor 현재가치 — BigInt 거듭제곱 (103ⁿ > MAX_SAFE_INTEGER 정밀도 회피) */
function trustIncomePV(afterTaxIncome: number, n: number): number {
  const exp = Math.max(0, Math.floor(n));
  if (afterTaxIncome <= 0) return Math.max(0, afterTaxIncome);
  // floor(R × 100ⁿ / 103ⁿ) — BigInt 나눗셈은 0방향 절사 = 양수 floor
  return Number((BigInt(afterTaxIncome) * 100n ** BigInt(exp)) / 103n ** BigInt(exp));
}

/** §61②→§62 수익권 현가합 항 수(연수) 결정 */
function resolveIncomePeriods(input: TrustBenefitInput): number {
  const annuity = input.incomeAnnuityType ?? "finite";
  if (annuity === "perpetual") return 20; // §62 2호 무기정기금
  if (annuity === "lifetime") {
    // §62 3호 종신 — 기대여명 floor
    if (input.expectedRemainingYears != null) return Math.max(0, Math.floor(input.expectedRemainingYears));
    if (input.beneficiaryGender && input.beneficiaryAge != null) {
      return getLifeExpectancyFloor(input.beneficiaryGender, input.beneficiaryAge);
    }
    return 0;
  }
  return Math.max(0, Math.floor(input.installments ?? 0)); // §62 1호 유기 (입력 회차)
}

export function calcTrustBenefit(input: TrustBenefitInput): DeemedGiftResult {
  const { beneficiaryType, trustPropertyValue, yieldRate, withholdingRate, surrenderValue } = input;

  const principal = Math.max(0, trustPropertyValue);
  const y = yieldRate ?? TRUST_RATE; // 미확정 → 칙§19의2② 원본×3%
  const yieldUndetermined = yieldRate == null;

  // 세후 연수익 = 원본 × 수익률 − 원천징수 (모두 floor 정수)
  const grossIncome = applyRateFraction(principal, y.numer, y.denom);
  const withholding = applyRateFraction(grossIncome, withholdingRate.numer, withholdingRate.denom);
  const afterTaxIncome = Math.max(0, grossIncome - withholding);

  // 수익권 평가 — 연차별 현가합 (nₖ = k × 간격; 연1회·평가기준일=첫수익시기면 0,1,2…)
  const periods = resolveIncomePeriods(input);
  const interval = input.incomeIntervalYears && input.incomeIntervalYears > 0 ? input.incomeIntervalYears : 1;
  const incomeRows: CalculationStep[] = [];
  let incomeRight = 0;
  for (let k = 0; k < periods; k++) {
    const disc = Math.floor(k * interval);
    const pv = trustIncomePV(afterTaxIncome, disc);
    incomeRight += pv;
    incomeRows.push({
      label: `수익 ${k + 1}회차 현재가치 (${disc}년 할인, 1/1.03^${disc})`,
      amount: pv,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }

  // 권리별 평가액 (§61①)
  const incomeValue = incomeRight; // 수익권 (2호나목)
  const principalValue =
    beneficiaryType === "diff_principal"
      ? Math.max(0, principal - incomeRight) // 원본권 = 신탁재산 − 수익권 (2호가목)
      : principal; // 동일수익자(1호)·원본만 외 = 신탁재산 가액

  // §33①1·2호 별개 증여 — subGifts 분리 (D2)
  const subGifts: NonNullable<DeemedGiftResult["subGifts"]> = [];
  if (beneficiaryType !== "diff_income") {
    subGifts.push({
      right: "principal",
      giftDate: input.principalGiftDate,
      value: principalValue,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }
  if (beneficiaryType !== "diff_principal") {
    subGifts.push({
      right: "income",
      giftDate: input.incomeGiftDate,
      value: incomeValue,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }

  const total = subGifts.reduce((s, g) => s + g.value, 0);
  // §61① 단서 — 전체 해지 일시금 > 합계 → 일시금 (권리별 아님)
  const surrenderApplied = (surrenderValue ?? 0) > total;
  const deemedGiftValue = Math.max(total, surrenderValue ?? 0);

  const breakdown: CalculationStep[] = [
    { label: "신탁재산(원본) 가액", amount: principal, lawRef: GIFT.TRUST_BENEFIT },
    {
      label: yieldUndetermined
        ? "세후 연수익 (수익률 미확정 → 원본 × 3%, 칙§19의2②)"
        : `세후 연수익 (원본 × 수익률 − 원천징수)`,
      amount: afterTaxIncome,
      lawRef: GIFT.TRUST_BENEFIT_RATE,
    },
    ...incomeRows,
    { label: "수익권 평가 (현가합)", amount: incomeRight, lawRef: GIFT.TRUST_BENEFIT_VALUATION },
  ];
  if (beneficiaryType !== "diff_income") {
    breakdown.push({
      label:
        beneficiaryType === "diff_principal"
          ? "원본권 평가 (신탁재산 − 수익권, §61①2호가목)"
          : "원본권 평가 (신탁재산 가액, §61①1호)",
      amount: principalValue,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }
  if (surrenderApplied) {
    breakdown.push({
      label: "해지·철회 일시금 (§61① 단서 — 평가액보다 큼)",
      amount: surrenderValue ?? 0,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }
  breakdown.push({
    label: "증여재산가액",
    amount: deemedGiftValue,
    lawRef: GIFT.TRUST_BENEFIT,
    note: surrenderApplied ? "해지일시금 적용" : undefined,
  });

  return {
    type: "trust_benefit",
    applied: deemedGiftValue > 0,
    deemedGiftValue,
    breakdown,
    legalBasis: GIFT.TRUST_BENEFIT,
    thresholdEcho: {
      afterTaxIncome,
      incomeRight,
      principalIncluded: beneficiaryType !== "diff_income",
      surrenderApplied,
    },
    subGifts: surrenderApplied ? undefined : subGifts, // 일시금 대체 시 합계 1건(분리 무의미)
  };
}
