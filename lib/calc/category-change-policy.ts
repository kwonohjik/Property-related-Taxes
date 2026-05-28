/**
 * category-change-policy — 자산 카테고리 변경 시 보존 필드 결정
 *
 * Plan estate-card-followup-phase2 §FU-6 · Design §8 · Visual §4.4
 *
 * 정책:
 *   - id·name·heirAllocations: 항상 보존
 *   - 그룹 내 변경: 전 필드 보존
 *   - 그룹 간 변경: marketValue ↔ leaseDeposit 매핑 + 비호환 필드 자동 손실
 *   - deemedCategory: isDeemedCategoryCompatible 호환 시만 보존
 *
 * 그룹 매트릭스:
 *   - real_estate: real_estate_land·building·apartment
 *   - financial: cash·financial
 *   - deposit: deposit (단독)
 *   - other: other (단독)
 */

import type {
  AssetCategory,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  isDeemedCategoryCompatible,
  type SupportedCategory,
} from "./deemed-category-policy";

export type CategoryGroup = "real_estate" | "financial" | "deposit" | "other";

export function getCategoryGroup(category: AssetCategory): CategoryGroup {
  if (
    category === "real_estate_land" ||
    category === "real_estate_building" ||
    category === "real_estate_apartment"
  ) {
    return "real_estate";
  }
  if (category === "cash" || category === "financial") return "financial";
  if (category === "deposit") return "deposit";
  // listed_stock·unlisted_stock·other 모두 other (PropertyValuationForm은 stock 미처리)
  return "other";
}

export interface PickPreservedFieldsParams {
  item: EstateItem;
  newCategory: SupportedCategory;
}

/**
 * 카테고리 변경 시 보존할 필드 결정.
 *
 * 그룹 내 변경 → 전 필드 보존 + category만 갱신.
 * 그룹 간 변경 → id·name·heirAllocations + 호환 deemedCategory + 금액 매핑만.
 */
export function pickPreservedFields({
  item,
  newCategory,
}: PickPreservedFieldsParams): Partial<EstateItem> {
  const oldGroup = getCategoryGroup(item.category);
  const newGroup = getCategoryGroup(newCategory);

  // 그룹 내 변경 — 전 필드 보존
  if (oldGroup === newGroup) {
    return { ...item, category: newCategory };
  }

  // 그룹 간 변경 — 호환 필드만
  const base: Partial<EstateItem> = {
    id: item.id,
    name: item.name,
    heirAllocations: item.heirAllocations,
    category: newCategory,
  };

  // deemedCategory 호환성 검증 (insurance·trust·retirement)
  if (item.deemedCategory && isDeemedCategoryCompatible(item.deemedCategory, newCategory)) {
    base.deemedCategory = item.deemedCategory;
  }

  // 금액 매핑: deposit ↔ 다른 그룹
  if (item.category === "deposit" && newGroup !== "deposit") {
    // deposit → other group: leaseDeposit → marketValue
    if (item.leaseDeposit !== undefined) {
      base.marketValue = item.leaseDeposit;
    }
  } else if (newGroup === "deposit") {
    // other group → deposit: marketValue → leaseDeposit
    if (item.marketValue !== undefined) {
      base.leaseDeposit = item.marketValue;
    }
  } else {
    // 일반 그룹 간 변경: marketValue 보존
    if (item.marketValue !== undefined) {
      base.marketValue = item.marketValue;
    }
  }

  return base;
}

// ============================================================
// 손실 필드 계산 (CategoryChangeDialog 표시용)
// ============================================================

const LOSS_TRACKED_KEYS = [
  "estateAddress",
  "estateLatLng",
  "estateSigunguCode",
  "standardPrice",
  "appraisedValue",
  "leaseDeposit",
  "mortgageAmount",
  "deductSecuredClaimAsDebt",
  "securedClaimIsFinancialDebt",
  "securedClaimCreditorName",
  "deemedCategory",
  "farmingCategory",
  "familyBusinessCategory",
] as const satisfies ReadonlyArray<keyof EstateItem>;

export type LossFieldKey = (typeof LOSS_TRACKED_KEYS)[number];

/** 한국어 손실 필드 라벨 (Plan §INT-3 · Design D2-O1) */
export const LOSS_FIELD_LABELS: Record<LossFieldKey, string> = {
  estateAddress: "소재지 주소",
  estateLatLng: "소재지 좌표",
  estateSigunguCode: "시·군·구 코드",
  standardPrice: "기준시가/공시지가",
  appraisedValue: "감정평가액",
  leaseDeposit: "임대보증금",
  mortgageAmount: "저당권 채권액",
  deductSecuredClaimAsDebt: "§14 담보채무 자동공제",
  securedClaimIsFinancialDebt: "금융회사 채무 여부",
  securedClaimCreditorName: "채권자명",
  deemedCategory: "간주상속재산 분류",
  farmingCategory: "영농상속 자산 분류",
  familyBusinessCategory: "가업상속 자산 분류",
};

/**
 * 카테고리 변경 시 손실되는 필드 키 목록 (한국어 라벨 표시용).
 *
 * @param item 변경 전 자산
 * @param preserved pickPreservedFields 결과
 * @returns 손실 필드 키 배열 (item에 있고 preserved에 없는 키)
 */
export function computeLossFields(
  item: EstateItem,
  preserved: Partial<EstateItem>,
): LossFieldKey[] {
  return LOSS_TRACKED_KEYS.filter(
    (k) => item[k] !== undefined && preserved[k] === undefined,
  );
}
