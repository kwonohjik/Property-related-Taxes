/**
 * handleChipClick — 자산 카드 헤더 칩 클릭 공통 핸들러 factory
 *
 * Plan estate-card-followup-phase2 §INT-1 · Design §10.5 D-X1
 *
 * 호출자:
 *   - PropertyValuationForm.ItemEditor (real_estate·cash·financial·deposit·other)
 *   - EstateCommonAttributesSection (listed_stock·unlisted_stock V1/V2) — PR-E 머지 후
 *
 * 분기:
 *   - estimated-value: 무동작 (정보 칩)
 *   - section22: 3-state 순환 (undef → true → false → undef)
 *   - secured-claim-14: ON 상태에서만 노출 → 클릭=OFF
 *   - major-shareholder: 즉시 토글 (isSection22MajorShareholder)
 *   - 그 외 (classification·heir-allocation·farming·family-business): accordion 펼침
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { cycleSection22, type ChipKey, type ChipState } from "./chip-config";

export interface CreateChipClickHandlerParams {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  setInlineExpandedKey: (
    next: ChipKey | null | ((prev: ChipKey | null) => ChipKey | null),
  ) => void;
}

export function createChipClickHandler({
  item,
  onUpdate,
  setInlineExpandedKey,
}: CreateChipClickHandlerParams): (chip: ChipState) => void {
  return function handleChipClick(chip: ChipState) {
    if (chip.key === "estimated-value") return;

    if (chip.key === "section22") {
      onUpdate({
        ...item,
        isFinancialAssetForDeduction: cycleSection22(item.isFinancialAssetForDeduction),
      });
      return;
    }

    if (chip.key === "secured-claim-14") {
      // ON 상태에서만 칩 노출 → 클릭=OFF + 보조 필드 초기화
      onUpdate({
        ...item,
        deductSecuredClaimAsDebt: undefined,
        securedClaimIsFinancialDebt: undefined,
        securedClaimCreditorName: undefined,
      });
      return;
    }

    if (chip.key === "major-shareholder") {
      // 즉시 토글 (true ↔ undefined) — 주식 자산 §22② 배제
      onUpdate({
        ...item,
        isSection22MajorShareholder: item.isSection22MajorShareholder
          ? undefined
          : true,
      });
      return;
    }

    // Expandable: accordion (같은 key 다시 클릭 시 닫힘)
    setInlineExpandedKey((prev) => (prev === chip.key ? null : chip.key));
  };
}
