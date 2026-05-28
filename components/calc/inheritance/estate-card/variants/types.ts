/**
 * variants/types.ts — 자산 카드 본체 variant 공통 타입
 *
 * Plan estate-card-followup-phase2 §3.1·Design §4.1 D2-1
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { SupportedCategory } from "@/lib/calc/deemed-category-policy";

export type { SupportedCategory };

export interface VariantBodyProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  valuationDate?: string;
  /** §14 자동공제 토글 노출 조건 — 부모(ItemEditor)에서 mode·카테고리·담보채권액 합산 후 전달 */
  showCollateralDeductToggle: boolean;
  mode: "inheritance" | "gift";
}
