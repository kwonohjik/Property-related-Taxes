/**
 * deemed-category-policy — 간주상속재산 분류(§8·§9·§10) 호환 카테고리 정책
 *
 * Plan estate-card-followup-phase2 §INT-4·O-P2-6 · Design §3.1
 *
 * 분리 사유:
 *   - PR-F의 pickPreservedFields(category-change-policy.ts)가 호환성 검증에 필요
 *   - PropertyValuationForm 내부 상수를 lib/calc로 격상하여 재사용
 *   - PropertyValuationForm은 본 모듈에서 re-export 받아 기존 사용 사이트 호환
 *
 * 법령 근거:
 *   - §8 보험금: 본질적으로 금전 → 현금·예금·기타만 허용
 *   - §9 신탁재산: 부동산·증권·금전신탁 다양 → 전체 허용
 *   - §10 퇴직금·연금: 본질적으로 금전 → 현금·예금만 허용
 */

import type { AssetCategory } from "@/lib/tax-engine/types/inheritance-gift.types";

/** PropertyValuationForm에서 처리하는 카테고리 (stock 2종 제외) */
export type SupportedCategory = Exclude<
  AssetCategory,
  "listed_stock" | "unlisted_stock"
>;

export type DeemedCategoryKey = "none" | "insurance" | "trust" | "retirement";

/** 상속세 폼에서 노출하는 SupportedCategory 전체 (deposit 포함) */
const INHERITANCE_CATEGORIES: SupportedCategory[] = [
  "real_estate_apartment",
  "real_estate_building",
  "real_estate_land",
  "cash",
  "financial",
  "deposit",
  "other",
];

/**
 * 간주상속재산 분류별 허용 카테고리.
 */
export const DEEMED_ALLOWED_CATEGORIES: Record<DeemedCategoryKey, SupportedCategory[]> = {
  none: INHERITANCE_CATEGORIES,
  insurance: ["cash", "financial", "other"],
  trust: INHERITANCE_CATEGORIES,
  retirement: ["cash", "financial"],
};

/** 사용자 안내 문구 */
export const DEEMED_FILTER_NOTE: Record<Exclude<DeemedCategoryKey, "none">, string> = {
  insurance: "§8 보험금은 본질적으로 금전 수령권 — 현금·예금·기타만 추가 가능합니다.",
  trust: "§9 신탁재산은 금전·부동산·증권 모두 가능 — 신탁 유형은 자산 추가 후 선택합니다.",
  retirement: "§10 퇴직금·연금 등은 금전 수령권 — 현금·예금만 추가 가능합니다.",
};

/**
 * deemedCategory가 지정된 자산이 newCategory로 카테고리 변경 시 호환되는지 판정.
 *
 * @param deemed 현재 자산의 deemedCategory (undefined 시 호환 검증 무관 — true)
 * @param newCategory 변경 후 카테고리
 * @returns 호환 여부 (true = deemedCategory 보존 가능, false = 자동 undefined 처리)
 */
export function isDeemedCategoryCompatible(
  deemed: DeemedCategoryKey | undefined,
  newCategory: AssetCategory,
): boolean {
  if (deemed === undefined || deemed === "none") return true;
  const allowed = DEEMED_ALLOWED_CATEGORIES[deemed];
  // stock(listed/unlisted)은 SupportedCategory에 없으므로 자동 false
  return (allowed as AssetCategory[]).includes(newCategory);
}
