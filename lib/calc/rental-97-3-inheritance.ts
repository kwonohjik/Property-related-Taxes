/**
 * §97의3 상속 임대주택 — 피상속인 임대기간 합산(조특령 §97의3④ → §97⑤3호 · V-14) ⑤④⑧ 단일 소스.
 *
 * 계획서 docs/01-plan/features/rental-97-3-inheritance-merge.plan.md (Q-0~Q-6 권장안 · 2026-11-13).
 * - 상속 자산에서만 보이고(⑤) 실린다(④) — 범위 술어는 §97의5와 같은 leaf(`rental975InheritanceInScope`).
 * - 상속개시일은 감면 칸에 따로 받지 않고 자산 카드 취득일을 쓴다.
 * - 단기→장기 변경신고(2020.7.10 이전 · `shortTermConversionMode === "before"`)와는 함께 쓸 수 없다(Q-2) — ⑤ 경고·⑧ 차단·⑫·엔진.
 */
import { rental975InheritanceInScope } from "./rental-97-5-inheritance";

export const rental973InheritanceInScope = rental975InheritanceInScope;

/** Q-2 — 상속 합산과 변경신고 의제를 함께 켰는가 */
export function rental973InheritanceConflictsConversion(r: { isInherited973?: boolean; shortTermConversionMode?: string }): boolean {
  return r.isInherited973 === true && r.shortTermConversionMode === "before";
}

/** ④ — 토글 ON · 상속 자산 · 세 날짜(상속개시일 = 카드 취득일)가 다 있을 때만. 빈 칸·변경신고 충돌은 ⑧이 막는다. */
export function rental973InheritancePayload(
  r: { isInherited973?: boolean; decedentRegistrationDate973?: string; decedentRentalStartDate973?: string },
  owner: { acquisitionCause?: string; acquisitionDate?: string },
): { inheritanceDate: string; decedentRegistrationDate: string; decedentRentalStartDate: string } | undefined {
  if (!r.isInherited973 || !rental973InheritanceInScope(owner.acquisitionCause)) return undefined;
  if (!owner.acquisitionDate || !r.decedentRegistrationDate973 || !r.decedentRentalStartDate973) return undefined;
  return {
    inheritanceDate: owner.acquisitionDate,
    decedentRegistrationDate: r.decedentRegistrationDate973,
    decedentRentalStartDate: r.decedentRentalStartDate973,
  };
}

/**
 * ⑧⑤ — 합산이 실제로 일어날 때 피상속인 의제 개시일(YYYY-MM-DD) = max(피상속인 등록등일, 임대개시일).
 * 엔진 `rental-97-3.ts`가 안분 ⑤ 개시일로 쓰는 날과 같다(Q-3 Y) — 상속개시일(카드 취득일) 전이라 계속 임대면 안분이 없다.
 * ④가 싣고(`rental973InheritancePayload`) 엔진이 합산하는 조건(날짜 순서·변경신고 비충돌)과 같은 조건에서만 돌려준다.
 */
export function rental973MergedDecedentStart(
  r: { isInherited973?: boolean; decedentRegistrationDate973?: string; decedentRentalStartDate973?: string; shortTermConversionMode?: string },
  owner: { acquisitionCause?: string; acquisitionDate?: string },
): string | undefined {
  const p = rental973InheritancePayload(r, owner);
  if (!p || rental973InheritanceConflictsConversion(r)) return undefined;
  if (p.decedentRegistrationDate >= p.inheritanceDate || p.decedentRentalStartDate >= p.inheritanceDate) return undefined;
  return p.decedentRegistrationDate > p.decedentRentalStartDate ? p.decedentRegistrationDate : p.decedentRentalStartDate;
}
