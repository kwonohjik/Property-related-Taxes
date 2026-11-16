/**
 * 종부령 §3⑦4호 공실 2년(T-12) — 과세기준일 현재 공실이면 퇴거일부터 2년 이내만 계속 임대로 본다.
 * - 기간: 「퇴거일부터 … 2년 이내」 — 초일 불산입 · 공휴일 연장 없음(B 유형 `isWithinPeriod` · 계획서 V-4)
 * - 성립하면 경고(2년 안에 다음 임차인이 입주하지 않으면 계속 임대로 보지 않음 · 서면-2023-부동산-2803 · Q-6 a)
 * - 퇴거일 빈칸·과세기준일 뒤·임대개시일 앞은 불성립(화면은 ⑧이 막는다)
 * - 4·9호(「소유」)는 보지 않는다. 공실이면 그해 계약이 없어 5% 비교를 하지 않는다(Q-5 a — 엔진 본체가 `isVacantAtAssessment`로 건너뜀)
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.2
 */
import { isWithinPeriod } from "./civil-period";
import { COMPREHENSIVE_EXCL } from "./legal-codes";
import type { RentalExclusionInput } from "./types/comprehensive.types";

const OWNED_TYPES: ReadonlySet<string> = new Set(["vacant_construction", "public_conversion_pending"]);

/** 이 주택을 공실로 판정하는가(4·9호 제외) */
export function isVacantAtAssessment(input: RentalExclusionInput): boolean {
  return input.rentalVacantAtAssessment === true && !OWNED_TYPES.has(input.registrationType);
}

export function vacancyCheck(input: RentalExclusionInput): { issue: string | null; warning: string | null } {
  if (!isVacantAtAssessment(input)) return { issue: null, warning: null };
  const evict = input.vacancyEvictionDate;
  if (!evict || Number.isNaN(evict.getTime())) return { issue: COMPREHENSIVE_EXCL.VACANCY_EVICTION_DATE_MISSING, warning: null };
  const start = input.rentalStartDate;
  if (evict.getTime() > input.assessmentDate.getTime() || (start && evict.getTime() < start.getTime())) {
    return { issue: COMPREHENSIVE_EXCL.VACANCY_EVICTION_DATE_INVALID, warning: null };
  }
  return isWithinPeriod(evict, 2, input.assessmentDate)
    ? { issue: null, warning: COMPREHENSIVE_EXCL.VACANCY_WITHIN_2Y_WARNING }
    : { issue: COMPREHENSIVE_EXCL.VACANCY_OVER_2Y, warning: null };
}
