/**
 * PriorGiftInput meta — 관계 라벨·재산종류코드·헬퍼.
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 */

import type {
  PriorGift,
  DonorRelation,
  GiftDonorRelation,
  GiftPriorPropertyCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자동 채움 후 사용자가 자동 채움 9필드 중 어느 하나라도 수정했는지 판정.
 * 수정 시 sourceCalculationId 제거 → "📋 이력 기반" 배지 자동 사라짐.
 */
export function hasUserEditedFields(prev: PriorGift, next: PriorGift): boolean {
  const keys: (keyof PriorGift)[] = [
    "giftDate",
    "giftAmount",
    "giftTaxPaid",
    "giftTaxBase",
    "doneeRelation",
    "donor",
    "computedTax",
    "additionalGenerationSkipSurcharge",
    "wasGenerationSkip",
    "propertyCategory",
    "propertyName",
    "propertyLocation",
    "isAttachedLandToBuilding", // PR 3
  ];
  return keys.some((k) => prev[k] !== next[k]);
}

// ============================================================
// 관계 메타
// ============================================================

export const DONOR_RELATION_LABELS: Record<DonorRelation, string> = {
  spouse: "배우자",
  lineal_ascendant_adult: "직계존속 (성인)",
  lineal_ascendant_minor: "직계존속 (미성년자 기준)",
  lineal_descendant: "직계비속",
  other_relative: "기타 친족",
};

export const DONOR_RELATION_LIST: DonorRelation[] = [
  "spouse",
  "lineal_ascendant_adult",
  "lineal_ascendant_minor",
  "lineal_descendant",
  "other_relative",
];

// Phase A: 증여자 관계 8 enum (gift 모드에서 §47 합산 그룹화·§57 적용 판정용)
export const GIFT_DONOR_LABELS: Record<GiftDonorRelation, string> = {
  father: "부",
  mother: "모",
  grandparent: "조부모",
  spouse: "배우자",
  lineal_descendant: "직계비속",
  sibling: "형제자매",
  other_relative: "기타친족",
  other: "기타",
};

export const GIFT_DONOR_LIST: GiftDonorRelation[] = [
  "father",
  "mother",
  "grandparent",
  "spouse",
  "lineal_descendant",
  "sibling",
  "other_relative",
  "other",
];

// 신고서 부표 1 ② 재산종류코드 — UI 라벨 (KoreanLaw MCP 검증, 시행규칙 별지 제10호서식 부표 1 뒷면 §2)
// PR 3 (2026-05-22): 부표 1 양식 순서 정합 — 01·02·04·05·06·07·08·09·10·11·12 (점진 도입: 13·14는 후속)
export const GIFT_PRIOR_CATEGORY_LIST: GiftPriorPropertyCategory[] = [
  "cash",
  "real_estate_land",
  "real_estate_individual_house",
  "real_estate_apartment",
  "real_estate_officetel",
  "real_estate_building",
  "real_estate_acquisition_right",
  "listed_stock",
  "unlisted_stock",
  "financial",
  "deposit",
  "other",
];

// PR 3 (2026-05-22): 부표 1 양식 정합 — 04 개별주택·06 오피스텔·08 부동산 권리 추가
export const GIFT_PRIOR_CATEGORY_LABELS: Record<
  GiftPriorPropertyCategory,
  string
> = {
  cash: "01 현금",
  real_estate_land: "02/03 토지 (부수토지 토글)",
  real_estate_individual_house: "04 개별주택 (부수토지 포함)",
  real_estate_apartment: "05 공동주택 (부수토지 포함)",
  real_estate_officetel: "06 오피스텔·상업용건물 (부수토지 포함)",
  real_estate_building: "07 일반건물 (부수토지 제외)",
  real_estate_acquisition_right: "08 부동산을 취득할 수 있는 권리",
  listed_stock: "09 유가증권 (상장)",
  unlisted_stock: "10 유가증권 (비상장)",
  financial: "11 금융재산 (현금·유가증권 제외)",
  deposit: "11 금융재산 (예금)",
  other: "12 기타재산",
};

// ============================================================
// 헬퍼
// ============================================================

export function hasCorporatePriorGift(gifts: PriorGift[]): boolean {
  return gifts.some((g) => g.beneficiaryType === "corporate");
}

export function makeEmptyGift(): PriorGift {
  return {
    giftDate: "",
    isHeir: true,
    giftAmount: 0,
    giftTaxPaid: 0,
    sourceCalculationId: undefined,
    marriageBirthDeduction: undefined,
  };
}
