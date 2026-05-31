/**
 * 사전증여 수증자(donee) 파생 헬퍼 — single-source.
 *
 * 상속세 모드 사전증여에서 수증자(doneeId = Step1 Heir)를 선택하면
 * §13 분류(beneficiaryType)·§13 cutoff(isHeir)·§53 증여재산공제 관계(doneeRelation)를
 * 선택된 Heir에서 자동 도출. UI(GiftRowEditor)·anchor 공용.
 *
 * Plan:   docs/00-pm/inheritance-prior-gift-donee-redesign.plan.md
 * Design: docs/02-design/features/inheritance-prior-gift-donee-redesign.design.md
 *
 * 도메인 규칙: 증여인 = 항상 피상속인 / 수증인 = Step1 heirs 중 선택.
 *   → 수증자 지정은 doneeId 하나로 충분. 나머지는 본 헬퍼로 파생.
 */

import type {
  Heir,
  HeirRelation,
  DonorRelation,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/** Heir.relation이 비상속인(수유자·영리법인)인지 판정 */
export function isNonHeirRelation(relation: HeirRelation): boolean {
  return relation === "legatee" || relation === "corporate";
}

/**
 * Heir.id → isHeir 도출 (§13 cutoff: 상속인 10년 / 비상속인 5년).
 * Heir.isHeir prop 명시 우선, 없으면 relation으로 추론.
 */
export function deriveIsHeirFromHeir(h: Heir): boolean {
  if (h.isHeir !== undefined) return h.isHeir;
  return !isNonHeirRelation(h.relation);
}

/**
 * Heir → beneficiaryType (§13 분류 우월 키).
 *
 * ★ relation만 보면 deriveIsHeirFromHeir(isHeir prop 우선)과 어긋나 cutoff·분류 모순 →
 *   Heir 객체를 받아 deriveIsHeirFromHeir과 동일 기준으로 일관화.
 *   - corporate → "corporate" (§13①2호 5년 + §3의2②)
 *   - deriveIsHeirFromHeir=false (legatee or isHeir prop=false) → "legatee" (비상속인 5년)
 *   - 그 외 → "heir" (상속인 10년)
 */
export function deriveBeneficiaryTypeFromHeir(
  h: Heir,
): "heir" | "legatee" | "corporate" {
  if (h.relation === "corporate") return "corporate";
  if (!deriveIsHeirFromHeir(h)) return "legatee";
  return "heir";
}

/**
 * Heir.relation → DonorRelation (§53 증여재산공제 관계 도출, 제안값).
 *
 * 미성년 직계존속(lineal_ascendant_minor)·미성년 직계비속(child+미성년)은
 * 본 PR 미도출(성인 기준 제안값, 사용자 수정 가능) — 정밀 판정은 후속.
 * legatee·corporate는 §53 공제 대상 아님 → undefined.
 */
export function deriveDoneeRelationFromHeir(
  relation: HeirRelation,
): DonorRelation | undefined {
  switch (relation) {
    case "spouse":
      return "spouse"; // 배우자 6억
    case "child":
      return "lineal_descendant"; // 직계비속 5천(미성년 2천)
    case "lineal_ascendant":
      return "lineal_ascendant_adult"; // 직계존속 5천
    case "sibling":
    case "other":
      return "other_relative"; // 기타 친족 1천
    case "legatee":
    case "corporate":
      return undefined; // 비친족·법인 — §53 공제 대상 아님
  }
}
