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

import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import {
  hasDistributableHeir,
  buildInitialHeirAllocations,
} from "@/components/calc/inheritance/HeirAllocationInput";
import { cycleSection22, type ChipKey, type ChipState } from "./chip-config";

export interface CreateChipClickHandlerParams {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
  setInlineExpandedKey: (
    next: ChipKey | null | ((prev: ChipKey | null) => ChipKey | null),
  ) => void;
  /** 협의분할 칩 클릭 시 자동 ON 세팅에 사용. 미전달 시 자동 ON 미수행(펼침만). */
  heirs?: Heir[];
  /**
   * 협의분할 자동 ON 세팅 금액. 주식 카드는 평균가×주식수 등 별도 계산값을 전달.
   * 미전달 시 computeEffectiveValuation(item) fallback (부동산·예금 등).
   */
  effectiveValuation?: number;
  /** 현재 펼친 칩 키 — heir-allocation "펼치는 방향" 판정용([검토-B]). */
  currentExpandedKey?: ChipKey | null;
}

export function createChipClickHandler({
  item,
  onUpdate,
  setInlineExpandedKey,
  heirs,
  effectiveValuation,
  currentExpandedKey,
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

    if (chip.key === "heir-allocation") {
      // 펼치는 방향일 때만 자동 ON 세팅 — 닫는 방향에서 OFF 데이터가 ON으로 뒤집히는 모순 방지([검토-B])
      const willOpen = currentExpandedKey !== "heir-allocation";
      if (willOpen && item.heirAllocations === undefined && heirs) {
        const eff = effectiveValuation ?? computeEffectiveValuation(item);
        if (hasDistributableHeir(heirs) && eff > 0) {
          onUpdate({
            ...item,
            heirAllocations: buildInitialHeirAllocations(heirs, eff),
          });
        }
      }
      setInlineExpandedKey((prev) =>
        prev === "heir-allocation" ? null : "heir-allocation",
      );
      return;
    }

    // Expandable: accordion (같은 key 다시 클릭 시 닫힘)
    setInlineExpandedKey((prev) => (prev === chip.key ? null : chip.key));
  };
}
