/**
 * (1) 신탁이익의 증여 (상증법 §33) — 평가 상증령 §61 / 이자율 상증칙 §19의2
 *
 * 검증: KoreanLaw §33·령§25·§61·칙§19의2 본문(2026-06-19). 계산사례 anchor: 교재 §2장 p.557.
 * 현가 모델: free-realestate-use.ts(§37) — applyRateFraction + 1/(1+r)ⁿ 정수경로.
 *   신탁은 r=3%(칙§19의2① 30/1000) → 1/1.03ⁿ = 100ⁿ/103ⁿ. 장기(n 큼) 가능 → PV는 BigInt 거듭제곱.
 *
 * §61①: 동일수익자=신탁재산 가액 / 다름=원본권(재산−수익권)·수익권(연수익 현가합).
 *   분할 지급(§33③·령§25②)이면 각 회차 증여시기 기준 §61 준용 → 수익 PV합 + 원본(신탁재산 가액).
 *   해지·철회·취소 일시금 > 평가액이면 일시금(§61① 단서 Max).
 */
import { GIFT } from "../legal-codes";
import { applyRateFraction } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, TrustBenefitInput } from "./types";

/** 상증칙 §19의2① 이자율 = 연 1,000분의 30 (수익률 미확정 시 §19의2② 원본×30/1000도 동일) */
const TRUST_RATE = { numer: 30, denom: 1000 } as const;

/** 1/(1.03)ⁿ floor 현재가치 — BigInt 거듭제곱 (103ⁿ > MAX_SAFE_INTEGER 정밀도 회피) */
function trustIncomePV(afterTaxIncome: number, n: number): number {
  if (afterTaxIncome <= 0 || n < 0) return Math.max(0, afterTaxIncome);
  // floor(R × 100ⁿ / 103ⁿ) — BigInt 나눗셈은 0방향 절사 = 양수 floor
  return Number((BigInt(afterTaxIncome) * 100n ** BigInt(n)) / 103n ** BigInt(n));
}

export function calcTrustBenefit(input: TrustBenefitInput): DeemedGiftResult {
  const {
    beneficiaryType,
    trustPropertyValue,
    yieldRate,
    withholdingRate,
    installments,
    surrenderValue,
  } = input;

  const principal = Math.max(0, trustPropertyValue);
  const y = yieldRate ?? TRUST_RATE; // 미확정 → 칙§19의2② 원본×3%
  const yieldUndetermined = yieldRate == null;

  // 세후 연수익 = 원본 × 수익률 − 원천징수 (모두 floor 정수)
  const grossIncome = applyRateFraction(principal, y.numer, y.denom);
  const withholding = applyRateFraction(grossIncome, withholdingRate.numer, withholdingRate.denom);
  const afterTaxIncome = Math.max(0, grossIncome - withholding);

  // 수익권 평가 — 연차별 현가합 (n=0 증여시기 미할인)
  const incomeRows: CalculationStep[] = [];
  let incomeRight = 0;
  const periods = Math.max(0, Math.floor(installments));
  for (let n = 0; n < periods; n++) {
    const pv = trustIncomePV(afterTaxIncome, n);
    incomeRight += pv;
    incomeRows.push({
      label: `수익 ${n + 1}회차 현재가치 (${n}년 할인, 1/1.03^${n})`,
      amount: pv,
      lawRef: GIFT.TRUST_BENEFIT_VALUATION,
    });
  }

  // 신탁이익 — 수익자 구성별 (§61①)
  const benefit =
    beneficiaryType === "diff_income"
      ? incomeRight // 수익만 수령 (2호나목)
      : beneficiaryType === "diff_principal"
        ? Math.max(0, principal - incomeRight) // 원본만 — §61①2호가목 (수익권은 他수익자)
        : incomeRight + principal; // 동일수익자 — 수익 + 원본(신탁재산 가액)

  const deemedGiftValue = Math.max(benefit, surrenderValue ?? 0);
  const surrenderApplied = (surrenderValue ?? 0) > benefit;

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
      amount: beneficiaryType === "diff_principal" ? Math.max(0, principal - incomeRight) : principal,
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
  };
}
