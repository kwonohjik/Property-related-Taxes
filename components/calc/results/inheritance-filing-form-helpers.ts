/**
 * inheritance-filing-form-helpers — 별지 제9호서식 부표 1 라벨·코드 매핑 헬퍼.
 *
 * PR 3 (2026-05-22): KoreanLaw MCP 검증된 부표 1 양식 정합화.
 *
 * 책임:
 *   - getPropertyCategoryLabel: PriorGift → 재산종류코드 + 라벨 ("02 토지I" 등)
 *   - inferPropertyKindCode: PriorGift → 재산구분코드 (A21/A22/A23/A24 등)
 */

import type {
  PriorGift,
  GiftPriorPropertyCategory,
  EstatePropertyKindCode,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 재산종류코드 라벨 매핑 (부표 1 양식)
// ============================================================

const STATIC_CATEGORY_LABELS: Record<GiftPriorPropertyCategory, string> = {
  cash: "01 현금",
  real_estate_land: "02/03 토지 (부수토지 여부 미지정)", // 토글 미설정 시 fallback
  real_estate_individual_house: "04 개별주택 (부수토지 포함)",
  real_estate_apartment: "05 공동주택 (부수토지 포함)",
  real_estate_officetel: "06 오피스텔·상업용건물 (부수토지 포함)",
  real_estate_building: "07 일반건물 (부수토지 제외)",
  real_estate_acquisition_right: "08 부동산을 취득할 수 있는 권리",
  listed_stock: "09 유가증권 (상장)",
  unlisted_stock: "10 유가증권 (비상장)",
  financial: "11 금융재산 (현금, 유가증권 제외)",
  deposit: "11 금융재산 (예금)",
  other: "12 기타재산",
};

/**
 * PriorGift → 부표 1 재산종류코드 라벨.
 *
 * propertyCategory === "real_estate_land" 일 때 isAttachedLandToBuilding 토글로
 * 02 토지I (순수토지) / 03 토지II (일반건물 부수토지) 분기.
 */
export function getPropertyCategoryLabel(gift: PriorGift): string {
  if (gift.propertyCategory === "real_estate_land") {
    if (gift.isAttachedLandToBuilding === true) return "03 토지II (일반건물 부수토지)";
    if (gift.isAttachedLandToBuilding === false) return "02 토지I (순수토지)";
    return "02/03 토지 (부수토지 여부 미지정)";
  }
  return STATIC_CATEGORY_LABELS[gift.propertyCategory ?? "other"];
}

// ============================================================
// PR 3 (2026-05-22) — GiftPriorPropertyCategory → 부표 1 재산종류 코드 (01~12)
// ============================================================

const CATEGORY_TO_CODE: Record<GiftPriorPropertyCategory, string> = {
  cash: "01",
  real_estate_land: "02", // isAttachedLandToBuilding 토글로 02/03 동적 매핑은 toPriorGiftPropertyTypeCode
  real_estate_individual_house: "04",
  real_estate_apartment: "05",
  real_estate_officetel: "06",
  real_estate_building: "07",
  real_estate_acquisition_right: "08",
  listed_stock: "09",
  unlisted_stock: "10",
  financial: "11",
  deposit: "11",
  other: "12",
};

/**
 * PriorGift → 부표 1 재산종류 코드 (01~12).
 * 토지는 isAttachedLandToBuilding 토글로 02/03 분기.
 */
export function toPriorGiftPropertyTypeCode(gift: PriorGift): string {
  if (gift.propertyCategory === "real_estate_land") {
    if (gift.isAttachedLandToBuilding === true) return "03";
    return "02"; // false 또는 undefined → 02 fallback
  }
  return CATEGORY_TO_CODE[gift.propertyCategory ?? "other"] ?? "12";
}

// ============================================================
// 재산구분코드 자동 추론 (부표 1·2 양식)
// ============================================================

/**
 * 조특법 과세특례 — A23 / A24 분기용.
 * @param specialTreatment - "startup" (§30의5) / "family_business" (§30의6) / undefined
 */
export function inferPropertyKindCode(
  gift: PriorGift,
  specialTreatment?: "startup" | "family_business",
): EstatePropertyKindCode {
  // 조특법 §30의5 창업자금
  if (specialTreatment === "startup") return "A23";
  // 조특법 §30의6 가업승계
  if (specialTreatment === "family_business") return "A24";
  // 영리법인 — 상속인 외 (A22)
  if (gift.beneficiaryType === "corporate") return "A22";
  // 자연인: 상속인 (A21) / 상속인 외 (A22)
  return gift.isHeir ? "A21" : "A22";
}
