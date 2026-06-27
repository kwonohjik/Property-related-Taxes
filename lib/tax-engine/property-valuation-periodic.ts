/**
 * 정기금을 받을 권리 평가 (상증법 §65①·상증령 §62·상증칙 §19의2③)
 *   유기정기금(1호): Σ 각연도 정기금/(1+3%)ⁿ (n=경과연수). 단 1년분×20 초과 불가
 *   무기정기금(2호): 1년분 정기금 × 20
 *   종신정기금(3호): 기대여명 연수(소수점 버림)까지 Σ (제1호 식)
 *   단서: 철회·해지·취소 일시금 > 각호 평가액 → 일시금 (Max)
 *
 * ⚠️ 20배 cap은 유기정기금 전용 — 신탁수익권(§61)·무기·종신에는 미적용.
 *   현가 코어(pvAt3pct, ordinary n=1..N)·기대여명 floor는 valuation-annuity-core 공유.
 *
 * property-valuation.ts에서 분리 (800줄 정책). evaluateEstateItem dispatch가 호출.
 * 잔존연수(periodicRemainingYears)는 lib/calc에서 평가기준일~만기/기대여명으로 합성 주입.
 */

import { VALUATION } from "./legal-codes";
import { pvAt3pct } from "./valuation-annuity-core";
import { TaxCalculationError, TaxErrorCode } from "./tax-errors";
import type {
  EstateItem,
  PropertyValuationResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

export function evaluatePeriodicPayment(item: EstateItem): PropertyValuationResult {
  if (item.category !== "periodic_payment") {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "evaluatePeriodicPayment: 정기금받을권리 자산이 아닙니다.",
    );
  }

  const type = item.periodicAnnuityType ?? "finite";
  const annual = Math.max(0, item.periodicAnnualAmount ?? 0);
  const cap = annual * 20; // §62 1호 단서·2호 — 1년분 × 20

  const breakdown: CalculationStep[] = [
    { label: "1년분 정기금액", amount: annual, lawRef: VALUATION.PERIODIC_PAYMENT },
  ];

  let body: number;
  if (type === "perpetual") {
    // §62 2호 무기정기금 = 1년분 × 20
    body = cap;
    breakdown.push({ label: "무기정기금 평가 (1년분 × 20, §62 2호)", amount: body, lawRef: VALUATION.PERIODIC_PAYMENT });
  } else {
    // 유기(finite)·종신(lifetime) — ordinary annuity n=1..N 현가합
    const N = Math.max(0, Math.floor(item.periodicRemainingYears ?? 0));
    let pv = 0;
    for (let n = 1; n <= N; n++) {
      const term = pvAt3pct(annual, n);
      pv += term;
      breakdown.push({
        label: `${n}년차 정기금 현재가치 (1/1.03^${n})`,
        amount: term,
        lawRef: VALUATION.PERIODIC_PAYMENT,
      });
    }
    if (type === "finite") {
      // §62 1호 단서 — 1년분 × 20 한도
      const capped = Math.min(pv, cap);
      breakdown.push({
        label:
          capped < pv
            ? `유기정기금 평가 (현가합 ${pv.toLocaleString()} → 1년분×20 한도 적용, §62 1호 단서)`
            : "유기정기금 평가 (현가합, §62 1호)",
        amount: capped,
        lawRef: VALUATION.PERIODIC_PAYMENT,
      });
      body = capped;
    } else {
      // 종신(§62 3호) — 기대여명 현가합, 20배 cap 미적용
      breakdown.push({ label: "종신정기금 평가 (기대여명 현가합, §62 3호)", amount: pv, lawRef: VALUATION.PERIODIC_PAYMENT });
      body = pv;
    }
  }

  const surrender = Math.max(0, item.periodicSurrenderValue ?? 0);
  const surrenderApplied = surrender > body;
  const valuatedAmount = Math.max(body, surrender);
  if (surrenderApplied) {
    breakdown.push({
      label: "해지·철회 일시금 (§62 본문 단서 — 평가액보다 큼)",
      amount: surrender,
      lawRef: VALUATION.PERIODIC_PAYMENT,
    });
  }

  return {
    estateItemId: item.id,
    method: "standard_price",
    valuatedAmount,
    breakdown,
    warnings: surrenderApplied ? ["해지일시금이 평가액보다 커 일시금 적용(§62 본문 단서)"] : [],
  };
}
