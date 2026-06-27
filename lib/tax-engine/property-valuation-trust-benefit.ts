/**
 * 신탁의 이익을 받을 권리 평가 (상증법 §65①·상증령 §61·상증칙 §19의2)
 *   1호 동일수익자          = 평가기준일 현재 신탁재산 가액 (수익권 PV 미가산)
 *   2호가목 원본권(수익자 다름) = 신탁재산 가액 − 수익권 현가합
 *   2호나목 수익권(수익자 다름) = Σ (각 연도 세후수익) / (1+3%)ⁿ
 *   단서: 철회·해지·취소 일시금 > 각호 평가액 → 일시금 (Max)
 *
 * ⚠️ §33 증여의제(gift-deemed/trust-benefit.ts)의 동일수익자 합산(원본+수익)과 다름 —
 *   §61 재산평가의 1호는 신탁재산 가액 그 자체(KoreanLaw 상증령 §61① 본문 검증 2026-06-27).
 *   현가 코어(pvAt3pct)·이자율만 공유, 권리별 조립은 본 파일 전용.
 *
 * property-valuation.ts에서 분리 (800줄 정책). evaluateEstateItem dispatch가 호출.
 * 수익 회차수(trustRemainingYears)는 lib/calc에서 평가기준일~수익시기로 합성 주입.
 */

import { VALUATION } from "./legal-codes";
import { applyRateFraction } from "./tax-utils";
import { pvAt3pct } from "./valuation-annuity-core";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  EstateItem,
  PropertyValuationResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

/** 상증칙 §19의2① 이자율 = 연 1,000분의 30 (수익률 미확정 시 §19의2② 원본×30/1000도 동일) */
const TRUST_RATE = { numer: 30, denom: 1000 } as const;

/** 결정 B 경량 — 신탁재산 구성 항목 평가액 합 = 평가기준일 현재 신탁재산 가액(§61①·법 §60~65) */
function sumTrustAssets(item: EstateItem): number {
  return (item.trustAssets ?? []).reduce((s, a) => s + Math.max(0, a.value ?? 0), 0);
}

export function evaluateTrustBenefit(item: EstateItem): PropertyValuationResult {
  if (item.category !== "trust_benefit") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluateTrustBenefit: 신탁수익권 자산이 아닙니다.",
    );
  }

  const beneficiaryType = item.trustBeneficiaryType ?? "same";
  const principal = sumTrustAssets(item);

  // 세후 연수익 = 신탁재산 × 수익률 − 원천징수 (수익률 미확정 → 원본×3%, 칙§19의2②)
  const yieldUndetermined = item.trustYieldRateNumer == null;
  const y = yieldUndetermined
    ? TRUST_RATE
    : { numer: item.trustYieldRateNumer ?? 0, denom: item.trustYieldRateDenom ?? 100 };
  const gross = applyRateFraction(principal, y.numer, y.denom);
  const withholding =
    item.trustWithholdingRateNumer != null
      ? applyRateFraction(gross, item.trustWithholdingRateNumer, item.trustWithholdingRateDenom ?? 100)
      : 0;
  const afterTax = Math.max(0, gross - withholding);

  // 수익권 현가합 (§61①2호나) — 신탁 startIndex=0 (평가기준일=첫수익시기 가정, annuity-due)
  const N = Math.max(0, Math.floor(item.trustRemainingYears ?? 0));
  const incomeRows: CalculationStep[] = [];
  let incomeRight = 0;
  for (let k = 0; k < N; k++) {
    const pv = pvAt3pct(afterTax, k);
    incomeRight += pv;
    incomeRows.push({
      label: `수익 ${k + 1}회차 현재가치 (${k}년 할인, 1/1.03^${k})`,
      amount: pv,
      lawRef: VALUATION.TRUST_BENEFIT_RIGHT,
    });
  }

  // 권리별 평가 (§61①)
  const valueByRight =
    beneficiaryType === "diff_income"
      ? incomeRight // 2호나목 수익권
      : beneficiaryType === "diff_principal"
        ? Math.max(0, principal - incomeRight) // 2호가목 원본권 = 신탁재산 − 수익권
        : principal; // 1호 동일수익자 = 신탁재산 가액 (수익권 PV 미가산)

  const surrender = Math.max(0, item.trustSurrenderValue ?? 0);
  const surrenderApplied = surrender > valueByRight;
  const valuatedAmount = Math.max(valueByRight, surrender);

  const breakdown: CalculationStep[] = [
    { label: "신탁재산 가액 (평가기준일 현재, §60~65)", amount: principal, lawRef: VALUATION.TRUST_BENEFIT_RIGHT },
  ];
  if (beneficiaryType !== "same") {
    breakdown.push({
      label: yieldUndetermined
        ? "세후 연수익 (수익률 미확정 → 신탁재산 × 3%, 칙§19의2②)"
        : "세후 연수익 (신탁재산 × 수익률 − 원천징수)",
      amount: afterTax,
      lawRef: VALUATION.ANNUITY_RATE,
    });
    breakdown.push(...incomeRows);
    breakdown.push({ label: "수익권 평가 (현가합, §61①2호나)", amount: incomeRight, lawRef: VALUATION.TRUST_BENEFIT_RIGHT });
  }
  breakdown.push({
    label:
      beneficiaryType === "diff_income"
        ? "수익권 평가액 (§61①2호나)"
        : beneficiaryType === "diff_principal"
          ? "원본권 평가액 (신탁재산 − 수익권, §61①2호가)"
          : "신탁수익권 평가액 (동일수익자 = 신탁재산 가액, §61①1호)",
    amount: valueByRight,
    lawRef: VALUATION.TRUST_BENEFIT_RIGHT,
  });
  if (surrenderApplied) {
    breakdown.push({
      label: "해지·철회 일시금 (§61① 단서 — 평가액보다 큼)",
      amount: surrender,
      lawRef: VALUATION.TRUST_BENEFIT_RIGHT,
    });
  }

  return {
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount,
    breakdown,
    warnings: surrenderApplied ? ["해지일시금이 평가액보다 커 일시금 적용(§61① 단서)"] : [],
  };
}
