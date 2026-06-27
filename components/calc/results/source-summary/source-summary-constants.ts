/**
 * 상속개시자료 요약 4표 — 카테고리·라벨 매핑 상수.
 *
 * 계획: docs/00-pm/inheritance-source-data-summary-tables.plan.md
 * 디자인: docs/02-design/features/inheritance-source-data-summary.ui.design.md §2
 */

import type {
  AssetCategory,
  DebtCategory,
  ValuationMethod,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PresumedCategory } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// Table A — 자산 카테고리 → 4그룹 매핑
// ============================================================

export type EstateGroupKey = "financial" | "real_estate" | "stock" | "other";

export const ESTATE_GROUP_ORDER: EstateGroupKey[] = [
  "financial",
  "real_estate",
  "stock",
  "other",
];

export const ESTATE_GROUP_LABEL: Record<EstateGroupKey, string> = {
  financial: "예금",
  real_estate: "부동산",
  stock: "주식",
  other: "기타자산",
};

export function resolveEstateGroup(category: AssetCategory): EstateGroupKey {
  if (category === "cash" || category === "financial" || category === "deposit") {
    return "financial";
  }
  if (category.startsWith("real_estate")) return "real_estate";
  if (category === "listed_stock" || category === "unlisted_stock") return "stock";
  return "other";
}

export function isRealEstateCategory(category: AssetCategory): boolean {
  return category.startsWith("real_estate");
}

// ============================================================
// Table A — valuationMethod → 비고 열 라벨
// ============================================================

export const VALUATION_METHOD_LABEL: Record<ValuationMethod, string> = {
  market_value: "시가",
  similar_sales: "매매사례가액",
  standard_price: "기준시가",
  appraisal: "감정가액",
  acquisition_cost: "취득가액",
  book_value: "장부가액",
  deposit_statutory: "예금·적금 법정평가",
  crypto_statutory: "가상자산 법정평가",
};

// ============================================================
// Table B — 추정상속 카테고리 라벨
// ============================================================

export const PRESUMED_CATEGORY_LABEL: Record<PresumedCategory, string> = {
  real_estate: "부동산 및 부동산 권리",
  deposit: "예금",
  other_asset: "기타재산",
  financial_debt: "금융기관 채무",
};

// ============================================================
// Table C — 채무 카테고리 4분류 라벨
// ============================================================

export const DEBT_CATEGORY_LABEL: Record<DebtCategory, string> = {
  financial: "금융채무",
  tax: "공과금",
  personal: "사적채무",
  funeral: "장례비",
};

export const DEBT_CATEGORY_ORDER: DebtCategory[] = [
  "financial",
  "tax",
  "personal",
  "funeral",
];

// ============================================================
// Table D — beneficiaryType → 관계 라벨
// ============================================================

export function resolveBeneficiaryLabel(
  beneficiaryType?: "heir" | "legatee" | "corporate",
  doneeRelationLabel?: string,
): string {
  if (beneficiaryType === "corporate") return "영리법인";
  if (doneeRelationLabel) return doneeRelationLabel;
  if (beneficiaryType === "legatee") return "수유자";
  return "상속인";
}
