/**
 * 비상장주식 간편/정식 평가 모드 strip 헬퍼 (PR-3, single-source)
 *
 * 이 모듈이 모드 판정의 유일한 source.
 * 다른 곳에서 `unlistedStockValuationV2 ?` derive 재작성 금지.
 *
 * 적용 지점:
 *   (a) lib/calc/inheritance-api.ts — buildInput 의 estateItems 병합 map
 *   (b) lib/stores/inheritance-summary.ts — 합산 직전 map
 *
 * 계획서 §4 "핵심 충돌과 해소 — strip 단일 헬퍼" 참조.
 *
 * 동작:
 *   - category !== "unlisted_stock" → item 그대로 반환 (동일 참조)
 *   - mode "simple" (또는 fallback "simple") → unlistedStockValuationV2 키를 제거한 새 객체 반환
 *     (폼 state는 건드리지 않음 — 엔진 전달용 정제만)
 *   - mode "formal" (또는 fallback "formal") → item 그대로 반환 (동일 참조)
 *
 * 레거시 fallback (C-8/C-9):
 *   unlistedValuationMode === undefined 일 때
 *   → unlistedStockValuationV2 존재 시 "formal", 없으면 "simple"
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 비상장주식 EstateItem에서 비활성 모드의 데이터를 제거해 엔진에 전달할 정제된 객체를 반환.
 *
 * 폼 state는 변경하지 않음. 반환값은 엔진/사이드바 전달용.
 */
export function resolveActiveUnlistedValuation(item: EstateItem): EstateItem {
  if (item.category !== "unlisted_stock") return item;

  // 모드 판정 (레거시 fallback 포함)
  const mode: "simple" | "formal" =
    item.unlistedValuationMode ??
    (item.unlistedStockValuationV2 ? "formal" : "simple");

  if (mode === "simple") {
    // V2 strip — 새 객체 반환 (폼 state 원본은 변경하지 않음)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { unlistedStockValuationV2: _omit, ...rest } = item;
    return rest as EstateItem;
  }

  // formal: 그대로 반환 (동일 참조)
  return item;
}
