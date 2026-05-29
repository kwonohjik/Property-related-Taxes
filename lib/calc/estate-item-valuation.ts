/**
 * estate-item-valuation — EstateItem 평가액 도출 헬퍼
 *
 * Plan estate-card-followup §FU-1 사전 분리.
 * PropertyValuationForm·chip-config 등 다수 모듈이 공유.
 * 순환 의존 회피 + [[single-source-engine-helper]] 정책.
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > (주식: §63 보충평가) > 보증금(deposit).
 * TotalEstimatedValue·HeirAllocationToggleSection·chip-config 공통 사용.
 *
 * 주식 분기 (2026-05-29 정정):
 *   상장·비상장주식 카테고리는 명시 시가·감정가·기준시가가 없으면
 *   computeStockValuation(§63①1가 전후 2개월 평균·§63 보충평가)로 fallback.
 *   동일 진실: lib/tax-engine/valuation/resolve-estate-item-value.ts (§60 5단계).
 *   [[project_section22_major_shareholder_toggle]] Phase0 동일 패턴 — chip-config 칩 라벨도
 *   본 헬퍼를 거치므로 주식 평가액이 칩에 반영되도록 단일 진실 통과.
 */
export function computeEffectiveValuation(item: EstateItem): number {
  if (item.category === "deposit") {
    return item.leaseDeposit ?? 0;
  }
  // 명시 평가액(§60 시가 우선) — 시가 → 감정가 → 기준시가 (??chain: 0도 그대로 반환하여 기존 동작 보존)
  const explicit =
    item.marketValue ??
    item.appraisedValue ??
    item.standardPrice;
  if (explicit !== undefined && explicit !== null) {
    return explicit;
  }
  // 주식 보충평가 (§63) — 상장 시세 평균·비상장 V1/V2
  if (item.category === "listed_stock" || item.category === "unlisted_stock") {
    return computeStockValuation(item);
  }
  return 0;
}
