/**
 * 주식 자산 평가액 도출 — 단일 진실 함수 (Phase 0 lib 이동)
 *
 * 계획서: docs/00-pm/inheritance-stock-section22-toggle-consolidation.plan.md §0 D-0
 * 정책: single-source-engine-helper · mirror-pattern (useEffect → store 미러링 금지)
 *
 * J-1 이동: computeStockValuation·resolveUnlistedDisplayMode 본문이
 *   lib/tax-engine/valuation/resolve-estate-item-value.ts(엔진)로 이동됨.
 *   순수 엔진 deductions(family-business)가 lib/calc import 역전 없이 재사용하기 위함.
 *   여기서는 re-export로 기존 import 사이트(StockValuationForm·EstateCommonAttributesSection·
 *   inheritance-deduction-suggest) 무변경 보존 (feedback_800line_split_export_preservation).
 *
 * NOTE: marketValue(시가 직접 입력)가 있으면 해당 값이 우선 (AN-2 보존).
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  resolveUnlistedDisplayMode,
  computeStockValuation,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";

// re-export 보존 (기존 import 사이트 호환)
export { resolveUnlistedDisplayMode, computeStockValuation };

/**
 * §22② 최대주주 칩·토글 노출 여부 — 단일 진실 술어 (stock-item-table-view).
 *
 *   - 상장주식: 항상 노출
 *   - 비상장 simple(V1): 노출
 *   - 비상장 formal(V2): 미노출 — UnlistedStockV2Card 내부 토글이 담당 (S-4 중복 방지)
 *
 * EstateCommonAttributesSection(§22 토글·major-shareholder 칩) + StockItemTableView(행 배지)
 * 양쪽이 import — dual-truth 회피 ([[single-source-engine-helper]]).
 */
export function shouldShowMajorShareholderChip(item: EstateItem): boolean {
  return (
    item.category === "listed_stock" ||
    (item.category === "unlisted_stock" && resolveUnlistedDisplayMode(item) === "simple")
  );
}
