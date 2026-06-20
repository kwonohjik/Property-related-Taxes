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
  /**
   * §23의2 동거주택 체크박스 활성 조건 — 동거(isCohabitant) 표시된 자녀 상속인 존재 여부.
   * 부모(ItemEditor)에서 heirs로부터 도출해 전달(EstateItem엔 heirs 없음).
   */
  hasCohabitantChild?: boolean;
  /**
   * 같은 마법사 내 다른 자산 중 burdenedGiftTransferTax가 이미 ON인 자산이 있는지.
   * 부모(PropertyValuationForm)에서 items 배열 전수를 참고해 계산 후 전달.
   * gift 모드 + 부동산 카테고리에서 BurdenedGiftTransferSection에 전달됨.
   */
  hasOtherBurdenedGiftTransfer?: boolean;
}
