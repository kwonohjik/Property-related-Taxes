/**
 * createChipClickHandler — 자산 카드 헤더 칩 클릭 공통 핸들러 anchor
 *
 * Plan estate-card-followup-phase2 §INT-1
 */

import { describe, it, expect, vi } from "vitest";
import { createChipClickHandler } from "@/components/calc/inheritance/estate-card/handleChipClick";
import type {
  ChipKey,
  ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "t-1",
    category: "financial",
    name: "테스트",
    ...overrides,
  };
}

function makeChip(key: ChipKey): ChipState {
  return {
    key,
    label: "",
    tone: "gray",
    isExpandable: false,
    isToggle: false,
  };
}

describe("createChipClickHandler", () => {
  it("estimated-value 클릭 → 무동작", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem(),
      onUpdate,
      setInlineExpandedKey: setExpand,
    });
    handler(makeChip("estimated-value"));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(setExpand).not.toHaveBeenCalled();
  });

  it("section22 클릭 → 3-state 순환 (undef → true)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem(),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("section22"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isFinancialAssetForDeduction: true }),
    );
  });

  it("section22 클릭 → 3-state 순환 (true → false)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ isFinancialAssetForDeduction: true }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("section22"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isFinancialAssetForDeduction: false }),
    );
  });

  it("section22 클릭 → 3-state 순환 (false → undef)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ isFinancialAssetForDeduction: false }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("section22"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isFinancialAssetForDeduction: undefined }),
    );
  });

  it("secured-claim-14 클릭 → §14 OFF + 보조 필드 초기화", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({
        deductSecuredClaimAsDebt: true,
        securedClaimIsFinancialDebt: true,
        securedClaimCreditorName: "○○은행",
      }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("secured-claim-14"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        deductSecuredClaimAsDebt: undefined,
        securedClaimIsFinancialDebt: undefined,
        securedClaimCreditorName: undefined,
      }),
    );
  });

  it("major-shareholder 클릭 (undef → true)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ category: "listed_stock" }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("major-shareholder"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isSection22MajorShareholder: true }),
    );
  });

  it("major-shareholder 클릭 (true → undef)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({
        category: "listed_stock",
        isSection22MajorShareholder: true,
      }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
    });
    handler(makeChip("major-shareholder"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ isSection22MajorShareholder: undefined }),
    );
  });

  it("classification 클릭 → accordion 열기 (null → 'classification')", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem(),
      onUpdate,
      setInlineExpandedKey: setExpand,
    });
    handler(makeChip("classification"));
    expect(setExpand).toHaveBeenCalled();
    // setExpand는 functional updater 패턴: prev → next
    const updater = setExpand.mock.calls[0][0] as (
      p: ChipKey | null,
    ) => ChipKey | null;
    expect(updater(null)).toBe("classification");
    expect(updater("classification")).toBe(null); // 같은 key 다시 클릭 시 닫힘
    expect(updater("farming")).toBe("classification"); // 다른 key였으면 새 key로 전환
  });

  it("heir-allocation·farming·family-business 모두 accordion 패턴", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem(),
      onUpdate,
      setInlineExpandedKey: setExpand,
    });
    for (const key of ["heir-allocation", "farming", "family-business"] as const) {
      handler(makeChip(key));
    }
    expect(setExpand).toHaveBeenCalledTimes(3);
    expect(onUpdate).not.toHaveBeenCalled(); // 모두 accordion만, onUpdate 0
  });
});
