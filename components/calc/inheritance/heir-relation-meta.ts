/**
 * heir-relation-meta.ts — 상속인 관계 메타 (공유 상수 모듈)
 *
 * HeirComposition.tsx·CorporateHeirFields.tsx 양쪽에서 import.
 * gift-tax-form-shared.tsx:84 RELATION_LABELS (DonorRelation용) 와 충돌 회피를 위해
 * 상속인 전용 라벨은 HEIR_RELATION_LABELS 로 명명.
 *
 * 계획서: docs/00-pm/inheritance-corporate-shareholder-heir-dropdown.plan.md §3-2 G1
 */

import type { HeirRelation } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 상속인 관계 → 표시 라벨.
 * (충돌 회피명: gift-tax-form-shared.tsx:84 RELATION_LABELS는 DonorRelation 전용)
 */
export const HEIR_RELATION_LABELS: Record<HeirRelation, string> = {
  spouse: "배우자",
  child: "자녀",
  lineal_ascendant: "직계존속 (부모·조부모)",
  sibling: "형제자매",
  other: "기타",
  legatee: "수유자",
  corporate: "법인",
};

/**
 * 자연인 법정상속인 5종 (corporate·legatee 제외).
 * §3의2② 부표 5 그룹1 필터 기준.
 */
export const HEIR_RELATIONS: HeirRelation[] = [
  "spouse",
  "child",
  "lineal_ascendant",
  "sibling",
  "other",
];

/**
 * 상속인 외 특수 관계 (수유자·영리법인).
 * §19·§24 유증액 · §3의2② 부표 5.
 */
export const SPECIAL_RELATIONS: HeirRelation[] = ["legatee", "corporate"];
