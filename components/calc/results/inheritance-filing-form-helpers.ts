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
  AssetCategory,
  EstateItem,
  PropertyValuationResult,
  Heir,
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
  // 미전달 시 gift.specialTreatmentType에서 직접 읽음 — 호출부 인자 누락 시에도 A23/A24 보장
  specialTreatment: "startup" | "family_business" | undefined = gift.specialTreatmentType,
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

// ============================================================
// 부표 2 — EstateItem 기반 코드 매핑 (부표 1 GiftTaxValuationFormTable에서 공유 추출)
// 단일 출처: 증여 부표1 · 상속 부표2 공유 (dual-truth 차단)
// ============================================================

/**
 * ② 재산종류코드 — AssetCategory 9종 → 부표 1·2 코드.
 * Record<AssetCategory,...> 로 enum 누락을 컴파일러가 catch (enum-verification-before-mapping).
 * KoreanLaw 검증 (시행규칙 별지 제9호서식 부표 2 뒷면 §7) — 14종 중 EstateItem enum에
 * 없는 03/04/06/08/13/14는 미사용(해당 자산 12 기타재산 fallback).
 * 예금(deposit)은 11 금융재산 (12 기타재산 아님).
 */
export const ESTATE_ITEM_TYPE_CODE: Record<AssetCategory, string> = {
  cash: "01",
  real_estate_land: "02",
  real_estate_building: "07",
  real_estate_apartment: "05",
  listed_stock: "09",
  unlisted_stock: "10",
  financial: "11",
  deposit: "11",
  other: "12",
};

export function toEstateItemTypeCode(category: AssetCategory): string {
  return ESTATE_ITEM_TYPE_CODE[category] ?? "12";
}

/**
 * ⑧ 평가기준코드 (01~08) — KoreanLaw 검증 부표 2 코드표.
 * cash는 평가방법과 무관하게 "06"(현금 등 가액) 우선. 그 외 vr.method 매핑.
 * vr 미보유(평가 결과 매칭 실패) 시 "08"(기준시가 등 보충적 평가) fallback.
 */
export function toEstateItemValuationMethodCode(
  item: EstateItem,
  vr: PropertyValuationResult | undefined,
): string {
  if (item.category === "cash") return "06";
  switch (vr?.method) {
    case "market_value":
      return "01";
    case "appraisal":
      return "02";
    case "similar_sales":
      return "05";
    case "standard_price":
    case "book_value":
    case "acquisition_cost":
      return "08";
    default:
      return "08";
  }
}

/**
 * ① 재산구분코드 — 본래 상속재산 (부표 2 나 섹션).
 * 수유자(legatee)·영리법인(corporate) → A12(상속인 외), 그 외 상속인 → A11.
 */
export function inferEstateItemKindCode(heir: Heir): "A11" | "A12" {
  if (heir.relation === "legatee" || heir.relation === "corporate") return "A12";
  return "A11";
}
