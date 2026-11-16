/**
 * 종부령 §3⑧ 5% 위반 뒤 2개 과세연도 제외(T-07b) — 화면이 「무엇을 묻는가」의 단일 소스(⑤ 표시 · ④ 전송 · ⑧ 차단 공용).
 * - 묻는 유형은 엔진 `rentViolationApplies`(1·2·7·8·10·11호 — 9호 제외)와 같다. §3⑧은 2020.2.11. 신설이라 2020 과세연도부터 묻는다.
 * - 토글(기본 OFF — 말소 토글처럼 예외 사실 · Q-9 a) → 「5% 넘게 올린 계약일」. 공실이어도 묻는다(위반 효과는 공실과 무관).
 * 계획서: docs/01-plan/features/comprehensive-rental-excl-input-gaps-4.plan.md §3.3
 */
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";
import { rentViolationApplies } from "@/lib/tax-engine/comprehensive-exclusion-rent-violation";

export function asksRentViolation(registrationType: string, assessmentYear: string): boolean {
  return rentViolationApplies(registrationType) && (parseInt(assessmentYear) || 0) >= 2020;
}

function recorded(p: PropertyEntry, registrationType: string, assessmentYear: string): boolean {
  return asksRentViolation(registrationType, assessmentYear) && p.rentViolationRecorded === true;
}

/** ④ — 묻고 토글 ON일 때만 보낸다 */
export function rentViolationApiFields(p: PropertyEntry, registrationType: string, assessmentYear: string) {
  return recorded(p, registrationType, assessmentYear) ? { rentViolationDate: p.rentViolationDate || undefined } : {};
}

/** ⑧ — 토글 ON이면 계약일 필수 */
export function validateRentViolationInputs(p: PropertyEntry, registrationType: string, assessmentYear: string, label: string): string | null {
  if (!recorded(p, registrationType, assessmentYear) || p.rentViolationDate) return null;
  return `${label}: 임대료를 5% 넘게 올린 계약일을 입력하세요 — 그 과세연도와 다음 과세연도는 합산배제되지 않습니다 (종합부동산세법 시행령 §3⑧).`;
}
