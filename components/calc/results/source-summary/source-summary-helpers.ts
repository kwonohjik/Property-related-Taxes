/**
 * 상속개시자료 요약 4표 — 헬퍼 (그룹화·소계·합계·formatter·fallback).
 */

import type {
  EstateItem,
  HeirAllocation,
  AssetCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  resolveEstateGroup,
  isRealEstateCategory,
  VALUATION_METHOD_LABEL,
  type EstateGroupKey,
} from "./source-summary-constants";

// ============================================================
// 평가금액 도출 — Table A 평가금액 열
// ============================================================

export function resolveValuation(item: EstateItem): number {
  return item.marketValue ?? item.appraisedValue ?? item.standardPrice ?? 0;
}

// ============================================================
// 비고 열 라벨 — valuationMethod 명시 우선 + fallback
// ============================================================

export function resolveValuationLabel(item: EstateItem): string {
  if (item.valuationMethod) return VALUATION_METHOD_LABEL[item.valuationMethod];
  if (item.marketValue && item.marketValue > 0) return "시가";
  if (item.appraisedValue && item.appraisedValue > 0) return "감정가액";
  if (item.standardPrice && item.standardPrice > 0) return "기준시가";
  return "-";
}

// ============================================================
// 수량(면적) 포맷터 — 카테고리별 분기
// ============================================================

function sumAreaM2(allocations?: HeirAllocation[]): number {
  if (!allocations || allocations.length === 0) return 0;
  return allocations.reduce((acc, a) => acc + (a.areaM2 ?? 0), 0);
}

export function formatQuantity(item: EstateItem): string {
  const cat = item.category;
  if (cat === "listed_stock" || cat === "unlisted_stock") {
    const shares = item.listedStockShares ?? item.unlistedStockData?.ownedShares;
    return shares && shares > 0 ? `${shares.toLocaleString()}주` : "";
  }
  if (isRealEstateCategory(cat)) {
    // 우선순위: areaSqm 명시 > Σ(heirAllocations.areaM2) fallback (D-15)
    const area = item.areaSqm ?? sumAreaM2(item.heirAllocations);
    return area > 0 ? `${area.toLocaleString()}㎡` : "";
  }
  if (cat === "other") {
    return item.quantityCount && item.quantityCount > 0
      ? `${item.quantityCount.toLocaleString()}점`
      : "";
  }
  // cash · financial · deposit → 빈칸
  return "";
}

// ============================================================
// 상속인별 분배액 — heirId 단일 조회 (없으면 0)
// ============================================================

export function findAllocationAmount(
  allocations: HeirAllocation[] | undefined,
  heirId: string,
): number {
  if (!allocations) return 0;
  return allocations.find((a) => a.heirId === heirId)?.amount ?? 0;
}

// ============================================================
// 카테고리 4그룹화
// ============================================================

export interface GroupedEstateItems {
  group: EstateGroupKey;
  items: EstateItem[];
  groupValuationTotal: number;
}

export function groupEstateItems(items: EstateItem[]): GroupedEstateItems[] {
  const map = new Map<EstateGroupKey, EstateItem[]>();
  for (const item of items) {
    const g = resolveEstateGroup(item.category);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(item);
  }
  const result: GroupedEstateItems[] = [];
  for (const [group, groupItems] of map.entries()) {
    const total = groupItems.reduce((acc, it) => acc + resolveValuation(it), 0);
    result.push({ group, items: groupItems, groupValuationTotal: total });
  }
  return result;
}

// ============================================================
// 상속인별 그룹 소계 (가로 합산)
// ============================================================

export function sumAllocationByHeir<T extends { heirAllocations?: HeirAllocation[] }>(
  items: T[],
  heirId: string,
): number {
  return items.reduce(
    (acc, it) => acc + findAllocationAmount(it.heirAllocations, heirId),
    0,
  );
}

// ============================================================
// Table C — incurredDate 포맷터 "YYYY.M.D. 발생"
// ============================================================

export function formatIncurredDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}. 발생`;
}

// ============================================================
// Table D — 증여일시 포맷터 "YYYY.M.D."
// ============================================================

export function formatGiftDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}.`;
}

// ============================================================
// 셀 fallback — 빈값을 em-dash로
// ============================================================

export function formatCellOrDash(value: number | string | undefined | null): string {
  if (value === undefined || value === null || value === "") return "-";
  if (typeof value === "number") {
    if (value === 0) return "-";
    return value.toLocaleString();
  }
  return value;
}
