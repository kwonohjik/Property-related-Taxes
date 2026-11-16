/**
 * 종부령 §3⑦4호 공실 2년(T-12) — 화면이 「무엇을 묻는가」의 단일 소스(⑤ 표시 · ④ 전송 · ⑧ 차단 공용).
 * - 4·9호(「소유」)는 묻지 않는다. 3·5·6호는 묻는다(5호는 임대료 칸이 없어도 공실은 묻는다).
 * - 공실이면 그해 계약이 없다 — 5% 토글·임대료 칸을 숨기고 ⑧·⑫의 직전 임대료 필수도 면제(Q-5 a · 막다른 길 방지).
 *   ④는 공실이면 `currentRent: 0`·`isInitialContract: true`·`previousRent` 미전송(남은 값이 엔진에 닿지 않게).
 * 판정: `lib/tax-engine/comprehensive-exclusion-vacancy.ts`. 계획서: comprehensive-rental-excl-input-gaps-4.plan.md §3.2
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { isOwnedRentalType } from "./comprehensive-rental-459ho";

/** 공실 토글을 묻는가 */
export function asksVacancy(registrationType: string): boolean {
  return !isOwnedRentalType(registrationType);
}

/** 이 주택을 공실로 보내는가(묻는 유형이고 토글 ON) — ⑤ 임대료 칸 숨김 · ④ · ⑧ 공용 */
export function isVacantEntry(p: PropertyEntry, registrationType: string): boolean {
  return asksVacancy(registrationType) && p.rentalVacantAtAssessment === true;
}

/** ④ — 공실일 때만 보낸다 */
export function rentalVacancyApiFields(p: PropertyEntry, registrationType: string) {
  return isVacantEntry(p, registrationType)
    ? { rentalVacantAtAssessment: true as const, vacancyEvictionDate: p.vacancyEvictionDate || undefined }
    : {};
}

/** ⑧ — 공실이면 퇴거일 필수 · 임대개시일 ≤ 퇴거일 ≤ 과세기준일 */
export function validateVacancyInputs(p: PropertyEntry, registrationType: string, assessmentYear: string, label: string): string | null {
  if (!isVacantEntry(p, registrationType)) return null;
  const evict = p.vacancyEvictionDate ?? "";
  if (!evict) return `${label}: 과세기준일 현재 공실이면 기존 임차인 퇴거일을 입력하세요 — 퇴거일부터 2년 이내만 계속 임대로 봅니다 (종합부동산세법 시행령 §3⑦4호).`;
  if (evict > `${assessmentYear}-06-01`) return `${label}: 기존 임차인 퇴거일이 과세기준일(${assessmentYear}.6.1.) 뒤입니다 — 과세기준일 현재 공실이 아니면 공실 토글을 끄세요.`;
  if (p.rentalStartDate && evict < p.rentalStartDate) return `${label}: 기존 임차인 퇴거일이 임대개시일보다 앞섭니다 — 날짜를 확인하세요.`;
  return null;
}
