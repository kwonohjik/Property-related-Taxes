/**
 * 상속세 요약 ↔ 배부표 정합 (영리법인 면제 §3의2② · §69 신고세액공제)
 *
 * docs/00-pm/inheritance-filing-credit-corporate-exemption.plan.md
 *
 * 목적: §69 신고세액공제를 배부표(상속인별 `Math.round` 합, PDF 책 1867)와 정확히 일치시킨다.
 *
 * **가드 — 배부표 §69 기준 합이 요약 §69 기준과 일치할 때만** per-heir round 합을 채택한다.
 *   요약 §69 기준 = (산출세액 + 할증) − §28 − §29 − §30 − 영리법인 면제(§3의2②)  [calcInheritanceTaxCredits]
 *   배부표 §69 기준 = Σ perHeir.preFilingCreditTax (= 산출세액상당액 + 할증 − §28 안분)
 *   두 기준이 같으면 차이는 floor(요약 단일) ↔ round 합(배부표)의 ±N원 정밀도뿐 → 배부표가 더 정밀.
 *   다르면 배부표가 §28(doneeId 누락)·할증(수유자 미플래그)·§29·§30을 요약과 다르게 모델링한 것이므로
 *   요약 단일값을 그대로 유지한다(회귀 방지).
 *
 * finalTax는 요약 구성요소에서 §69만 교체해 재도출(배부표 computedTaxShare 분기 미사용).
 *
 * Pure Engine — DB 호출 없음, 순수 함수.
 */

import type { HeirAllocationResult } from "./types/inheritance-allocation-result.types";
import type { TaxCreditResult } from "./types/inheritance-tax-credit.types";

export interface SummaryCreditReconciliation {
  filingCredit: number;
  filingCreditBase: number;
  totalCredit: number;
  finalTax: number;
}

/**
 * 배부표 per-heir round 합으로 요약 §69·결정세액 정밀화 (가드 충족 시).
 *
 * @param allocation calcHeirAllocation 결과 (per-heir ⑬⑭ 포함)
 * @param credit     요약 credit 엔진 산출값 (§28·§29·§30·§69·기준·합계)
 * @param finalTax   STEP 12 결정세액 (영리법인 면제 차감 후)
 * @returns 정합된 값. 가드 미충족 시 요약 값 그대로 반환(무변경).
 */
export function reconcileSummaryWithAllocation(
  allocation: HeirAllocationResult,
  credit: TaxCreditResult,
  finalTax: number,
): SummaryCreditReconciliation {
  const summaryBase = credit.filingCreditBase ?? 0;
  const ph = Object.values(allocation.perHeir);
  const allocBase = ph.reduce((s, h) => s + h.preFilingCreditTax, 0);

  const kept: SummaryCreditReconciliation = {
    filingCredit: credit.filingCredit,
    filingCreditBase: summaryBase,
    totalCredit: credit.totalCredit,
    finalTax,
  };
  // 가드: 배부표 §69 기준 ≠ 요약 §69 기준 → 배부표 미채택(요약 유지·회귀 방지).
  if (allocBase !== summaryBase) return kept;

  const allocFilingCredit = ph.reduce((s, h) => s + h.filingCredit, 0);
  const otherCredits = credit.foreignTaxCredit + credit.shortTermReinheritCredit;
  // §69만 per-heir round 합으로 교체, 결정세액은 그 차액(filingDelta)만 보정.
  const filingDelta = allocFilingCredit - credit.filingCredit;

  return {
    filingCredit: allocFilingCredit,
    filingCreditBase: allocBase,
    totalCredit: credit.giftTaxCredit + otherCredits + allocFilingCredit,
    finalTax: Math.max(0, finalTax - filingDelta),
  };
}
