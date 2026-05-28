/**
 * EstateBodyHelpers — variant 공통 유틸 (컴포넌트 import 금지 → 순환 회피)
 *
 * Plan estate-card-followup-phase2 §4.3·I-P2-3
 */

import type {
  EstateItem,
  AssetCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";

export type PropertyKind =
  | "land"
  | "building_non_residential"
  | "house_individual"
  | "house_apart";

export function resolvePropertyKind(category: AssetCategory): PropertyKind {
  if (category === "real_estate_apartment") return "house_apart";
  if (category === "real_estate_building") return "building_non_residential";
  // real_estate_land + 그 외 fallback
  return "land";
}

type FishingFarmingCategory = "fishing_vessel" | "fishing_right";

/**
 * 어선·어업권 자산 판정 — 좌표 필드를 fishingAnchorLatLng·fishingAnchorSigunguCode로 저장.
 * type guard (item is EstateItem & { farmingCategory: FishingFarmingCategory })
 */
export function isFishingAsset(
  item: EstateItem,
): item is EstateItem & { farmingCategory: FishingFarmingCategory } {
  return (
    item.farmingCategory === "fishing_vessel" ||
    item.farmingCategory === "fishing_right"
  );
}

/** EstateItem 부분 패치 헬퍼 — onUpdate 호출 wrapper */
export function makePatcher(
  item: EstateItem,
  onUpdate: (updated: EstateItem) => void,
) {
  return (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });
}

/** Exhaustive switch 강제용 — 신규 카테고리 추가 시 컴파일러가 차단 */
export function assertNever(x: never): never {
  throw new Error(`Unhandled category: ${JSON.stringify(x)}`);
}
