/**
 * 종부령 §3⑧ — 5% 요건을 「충족하지 않게 된 때에는 해당 과세연도를 포함하여 연속하는 2개 과세연도까지는 합산배제 임대주택에서 제외」(T-07b).
 * 판정: `comprehensive-exclusion-rent-violation.ts`. 계획서: comprehensive-rental-excl-input-gaps-4.plan.md §3.3
 */
export interface RentalExclusionRentViolationFacts {
  /** 임대료를 5% 넘게 올린 계약일(위반일) — 없으면 위반 없음 */
  rentViolationDate?: Date;
}
