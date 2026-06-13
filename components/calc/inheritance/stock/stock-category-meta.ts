/**
 * stock-category-meta — 주식 카테고리 라벨·아이콘 + id 발급 (단일 출처)
 *
 * StockItemTableView·StockItemEditor·EstateCommonAttributesSection·StockValuationForm 공유.
 * 테이블 전환 전에는 EstateCommonAttributesSection 내부 module-level(📈/📊)·
 * StockValuationForm.generateStockId에 흩어져 있었으나, 행(테이블)·모달(에디터)·
 * 칩 헤더 양쪽에서 필요해 단일 출처로 추출.
 *
 * 주식은 SupportedCategory(deemed-category-policy)에서 제외 — estate-category-meta와
 * 별도 유지 (자산 라벨/아이콘 Record에 주식 키 없음).
 */

export type StockCategory = "listed_stock" | "unlisted_stock";

export const STOCK_CATEGORY_LABELS: Record<StockCategory, string> = {
  listed_stock: "상장주식",
  unlisted_stock: "비상장주식",
};

export const STOCK_CATEGORY_ICONS: Record<StockCategory, string> = {
  listed_stock: "📈",
  unlisted_stock: "📊",
};

// ============================================================
// 주식 항목 id 발급 (StockValuationForm.generateStockId 이동 — 단일 출처)
// ============================================================

let _nextStockId = 1;

export function newStockId(): string {
  return `stock-${Date.now()}-${_nextStockId++}`;
}
