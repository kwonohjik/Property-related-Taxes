/**
 * 대습상속(민법 §1001·§1003②) 입력 검증 — 800줄 정책으로 inheritance-validate.ts에서 분리.
 *
 * 결정-C: 대습 그룹(substituteGroupId 보유)의 원래순위·역할 미선택 차단(자동 안분 fallback 금지).
 * 설계: docs/02-design/features/inheritance-substitute-heir.ui.design.md §Validation
 */

import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

export function validateSubstituteHeirs(heirs: Heir[]): string[] {
  const errors: string[] = [];
  const spouseRoleByGroup = new Map<string, number>();

  for (const h of heirs) {
    if (h.substituteGroupId == null) continue;
    const label = h.name?.trim() || "대습상속인";
    if (!h.substituteForRelation) {
      errors.push(`${label} — 대습상속인의 원래순위(사망 자녀/형제)를 선택하세요`);
    }
    if (!h.substituteRole) {
      errors.push(
        `${label} — 대습상속인의 역할(피대습자의 배우자/직계비속)을 선택하세요`,
      );
    }
    if (h.substituteRole === "spouse") {
      spouseRoleByGroup.set(
        h.substituteGroupId,
        (spouseRoleByGroup.get(h.substituteGroupId) ?? 0) + 1,
      );
    }
  }

  // §1003② 피대습자의 배우자는 1인 — 그룹당 spouse 역할 ≥2 차단
  for (const [, n] of spouseRoleByGroup) {
    if (n >= 2) {
      errors.push(
        "같은 대습 그룹에 피대습자의 배우자(며느리·사위)는 1인만 가능합니다",
      );
      break;
    }
  }

  return errors;
}
