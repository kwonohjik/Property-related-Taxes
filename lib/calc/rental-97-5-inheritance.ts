/**
 * §97의5 상속 임대주택 — 피상속인 임대기간 합산(조특령 §97의5③ → §97⑤3호 · V-13) ⑤④⑧ 단일 소스.
 *
 * 계획서 docs/01-plan/features/rental-97-5-inheritance-merge.plan.md (사용자 결정 2026-11-13 Q-F·Q-G).
 * - 토글은 **상속 자산**에서만 보이고(⑤) 실린다(④). 원인을 바꿔 남은 토글은 읽지 않는다(숨은 칸을 ⑧이 막으면 막다른 길).
 * - 상속개시일은 감면 칸에 따로 받지 않고 **자산 카드 취득일**(상속 자산은 「상속개시일」 칸)을 쓴다 — 이중 입력 방지.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function rental975InheritanceInScope(acquisitionCause: string | undefined): boolean {
  return acquisitionCause === "inheritance";
}

/** ④ — 토글 ON · 상속 자산 · 세 날짜(상속개시일 = 카드 취득일)가 다 있을 때만. 빈 칸은 ⑧이 막는다. */
export function rental975InheritancePayload(
  r: { isInherited975?: boolean; decedentRegistrationDate975?: string; decedentRentalStartDate975?: string },
  owner: { acquisitionCause?: AssetForm["acquisitionCause"]; acquisitionDate?: string },
): { inheritanceDate: string; decedentRegistrationDate: string; decedentRentalStartDate: string } | undefined {
  if (!r.isInherited975 || !rental975InheritanceInScope(owner.acquisitionCause)) return undefined;
  if (!owner.acquisitionDate || !r.decedentRegistrationDate975 || !r.decedentRentalStartDate975) return undefined;
  return {
    inheritanceDate: owner.acquisitionDate,
    decedentRegistrationDate: r.decedentRegistrationDate975,
    decedentRentalStartDate: r.decedentRentalStartDate975,
  };
}
