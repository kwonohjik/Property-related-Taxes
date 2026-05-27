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

export {
  resolveUnlistedDisplayMode,
  computeStockValuation,
} from "@/lib/tax-engine/valuation/resolve-estate-item-value";
