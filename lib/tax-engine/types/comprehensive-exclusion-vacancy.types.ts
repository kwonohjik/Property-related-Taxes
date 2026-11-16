/**
 * 종부령 §3⑦4호 공실 — 「기존 임차인의 퇴거일부터 다음 임차인의 입주일까지의 기간이 2년 이내인 경우에는 계속 임대하는 것으로 본다」.
 * 과세기준일(6.1.) 현재 공실인 주택의 「과세기준일 현재 임대」를 이 조항으로 본다(교재 pp.162~163 · 계획서 V-5).
 * 판정: `comprehensive-exclusion-vacancy.ts`. 계획서: comprehensive-rental-excl-input-gaps-4.plan.md §3.2 (T-12)
 */
export interface RentalExclusionVacancyFacts {
  /** 과세기준일 현재 임차인이 없음(공실) — 4·9호(「소유」)는 보지 않는다 */
  rentalVacantAtAssessment?: boolean;
  /** 기존 임차인 퇴거일 — 공실일 때 2년 판정 기산 */
  vacancyEvictionDate?: Date;
}
