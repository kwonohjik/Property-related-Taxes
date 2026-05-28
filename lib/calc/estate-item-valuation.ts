/**
 * estate-item-valuation — EstateItem 평가액 도출 헬퍼
 *
 * Plan estate-card-followup §FU-1 사전 분리.
 * PropertyValuationForm·chip-config 등 다수 모듈이 공유.
 * 순환 의존 회피 + [[single-source-engine-helper]] 정책.
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > 보증금(deposit).
 * TotalEstimatedValue·HeirAllocationToggleSection·chip-config 공통 사용.
 */
export function computeEffectiveValuation(item: EstateItem): number {
  if (item.category === "deposit") {
    return item.leaseDeposit ?? 0;
  }
  return (
    item.marketValue ??
    item.appraisedValue ??
    item.standardPrice ??
    0
  );
}
