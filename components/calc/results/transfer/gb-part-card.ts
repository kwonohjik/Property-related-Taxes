import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseCardId, purchasedPartParentIdOf } from "@/lib/tax-engine/general-building-share-id";

/** 일반건물이 엔진 내부에서 분해하는 카드 id (지분 접미사 제거 후 기준). */
export const GB_CARD_BASE_IDS = new Set(["land", "land_business", "land_nbl", "building", "building1", "building2"]);

/**
 * 이 카드가 일반건물 일괄이 쪼갠 계산 파트인가(토지·건물1·건물2) — 다건 양도의 「자산」과 달리 독립 신고 단위가 아니다.
 * 파트별 산출세액·결정세액(`refCalculatedTax`·`refDeterminedTax`)은 합산 과세의 참고값이라 합이 합계와 맞지 않아 표시하지 않는다.
 * `asset` = 이 카드의 폼 자산. 함께 양도에서는 일반건물이 몇째 자산이든 같다.
 */
export function isGbPartCard(propertyId: string, asset: Pick<AssetForm, "assetKind"> | undefined): boolean {
  return asset?.assetKind === "general_building" && GB_CARD_BASE_IDS.has(baseCardId(purchasedPartParentIdOf(propertyId)));
}
