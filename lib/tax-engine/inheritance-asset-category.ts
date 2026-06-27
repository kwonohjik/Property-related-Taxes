/**
 * 상속세 종합사례 PDF 표8 — 자산 4분류 매핑 헬퍼 (Phase B1)
 *
 * Plan: docs/01-plan/heir-allocation-summary-table.plan.md §0.3
 * Design: docs/02-design/features/heir-allocation-summary-table.engine.design.md
 *
 * PDF 표8 상단 4행(금융·부동산·주식·기타)은 EstateItem.category 그대로가 아니라
 * deemedCategory 보정(퇴직금·보험금·신탁 → "기타")을 거친 그룹핑.
 */

import type { AssetCategory, EstateItem } from "./types/inheritance-gift.types";

export type SummaryTableCategory = "financial" | "realEstate" | "stock" | "other";

const CATEGORY_TO_SUMMARY: Record<AssetCategory, SummaryTableCategory> = {
  cash: "financial",
  financial: "financial",
  deposit: "financial",
  real_estate_land: "realEstate",
  real_estate_building: "realEstate",
  real_estate_apartment: "realEstate",
  listed_stock: "stock",
  unlisted_stock: "stock",
  superficies: "realEstate", // 지상권 — 토지 위 권리, 부동산 그룹
  receivable: "financial", // 채권(대여금·외상매출금 등) — 금전채권, 금융 그룹
  convertible_bond: "financial", // 전환사채등 — 유가증권/금전채권, 금융 그룹
  crypto_asset: "other", // 가상화폐(가상자산) — §22 금융재산공제 대상 아님, 기타 그룹
  other: "other",
};

/**
 * deemedCategory 보정 우선 → AssetCategory 매핑.
 *
 * 퇴직금(retirement)·보험금(insurance)·신탁(trust)은 EstateItem.category가
 * "financial" 등이어도 PDF 표8에서는 "기타" 행으로 통합 표시.
 */
export function buildSummaryCategory(
  item: Pick<
    EstateItem,
    | "id"
    | "category"
    | "deemedCategory"
    | "listedStockCode"
    | "listedStockShares"
    | "listedStockAvgPrice"
    | "unlistedStockData"
    | "unlistedStockValuationV2"
  >,
): SummaryTableCategory {
  if (
    item.deemedCategory === "retirement" ||
    item.deemedCategory === "insurance" ||
    item.deemedCategory === "trust"
  ) {
    return "other";
  }
  // 평가 모드 자동 추론 — fixture/현실에서 listed/unlisted 평가 데이터를 가진 자산을
  // category="other"로 마킹한 케이스도 stock으로 분류
  if (
    item.listedStockCode != null ||
    (item.listedStockShares != null && item.listedStockShares > 0) ||
    (item.listedStockAvgPrice != null && item.listedStockAvgPrice > 0) ||
    item.unlistedStockData != null ||
    item.unlistedStockValuationV2 != null
  ) {
    return "stock";
  }
  // id prefix 보조 추론 — `estate_listed_*` · `estate_unlisted_*` (PDF 사례 fixture 호환)
  if (
    item.id?.startsWith("estate_listed_") ||
    item.id?.startsWith("estate_unlisted_")
  ) {
    return "stock";
  }
  return CATEGORY_TO_SUMMARY[item.category];
}

export type CategoryBreakdown = Record<SummaryTableCategory, number>;

export function emptyCategoryBreakdown(): CategoryBreakdown {
  return { financial: 0, realEstate: 0, stock: 0, other: 0 };
}
