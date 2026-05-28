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
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "t-1",
    category: "financial",
    name: "테스트",
    ...overrides,
  };
}

function makeHeir(overrides: Partial<Heir> = {}): Heir {
  return {
    id: "h1",
    relation: "child",
    name: "자녀",
    ...overrides,
  } as Heir;
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

  it("farming·family-business는 순수 accordion 패턴 (onUpdate 0)", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem(),
      onUpdate,
      setInlineExpandedKey: setExpand,
    });
    for (const key of ["farming", "family-business"] as const) {
      handler(makeChip(key));
    }
    expect(setExpand).toHaveBeenCalledTimes(2);
    expect(onUpdate).not.toHaveBeenCalled(); // accordion만, onUpdate 0
  });
});

// ============================================================
// 항목2 — heir-allocation 칩 클릭 시 협의분할 토글 자동 ON (2026-05-29)
// ============================================================

describe("createChipClickHandler — heir-allocation 자동 ON", () => {
  it("펼치는 방향 + 자연인 상속인 + 평가액>0 → heirAllocations 자동 세팅(firstHeir 전액)", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: 1_100_000_000 }),
      onUpdate,
      setInlineExpandedKey: setExpand,
      heirs: [makeHeir({ id: "h1" })],
      currentExpandedKey: null, // 펼치는 방향
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        heirAllocations: [{ heirId: "h1", amount: 1_100_000_000 }],
      }),
    );
    expect(setExpand).toHaveBeenCalled();
  });

  it("effectiveValuation 명시(주식 평균가×주식수) → 그 값으로 세팅 (computeEffectiveValuation 미사용)", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: 999 }), // computeEffectiveValuation과 다른 값
      onUpdate,
      setInlineExpandedKey: vi.fn(),
      heirs: [makeHeir({ id: "h2" })],
      effectiveValuation: 5_000_000_000,
      currentExpandedKey: null,
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        heirAllocations: [{ heirId: "h2", amount: 5_000_000_000 }],
      }),
    );
  });

  it("[검토-B] 닫는 방향(currentExpandedKey='heir-allocation') → 자동 세팅 안 함, 닫기만", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: 1_100_000_000 }),
      onUpdate,
      setInlineExpandedKey: setExpand,
      heirs: [makeHeir()],
      currentExpandedKey: "heir-allocation", // 이미 열림 → 닫는 방향
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).not.toHaveBeenCalled();
    const updater = setExpand.mock.calls[0][0] as (
      p: "heir-allocation" | null,
    ) => unknown;
    expect(updater("heir-allocation")).toBe(null); // 닫힘
  });

  it("disabled — 자연인 상속인 없음(법인만) → 자동 세팅 안 함, 펼침만", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: 1_100_000_000 }),
      onUpdate,
      setInlineExpandedKey: setExpand,
      heirs: [makeHeir({ id: "c1", relation: "corporate" })],
      currentExpandedKey: null,
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(setExpand).toHaveBeenCalled();
  });

  it("disabled — 평가액 0 → 자동 세팅 안 함, 펼침만", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: undefined }), // computeEffectiveValuation=0
      onUpdate,
      setInlineExpandedKey: vi.fn(),
      heirs: [makeHeir()],
      currentExpandedKey: null,
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("이미 heirAllocations 정의됨 → 재세팅 안 함", () => {
    const onUpdate = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({
        marketValue: 1_100_000_000,
        heirAllocations: [{ heirId: "h1", amount: 500_000_000 }],
      }),
      onUpdate,
      setInlineExpandedKey: vi.fn(),
      heirs: [makeHeir()],
      currentExpandedKey: null,
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it("heirs 미전달 → 자동 세팅 안 함 (PropertyValuationForm fallback 경로)", () => {
    const onUpdate = vi.fn();
    const setExpand = vi.fn();
    const handler = createChipClickHandler({
      item: makeItem({ marketValue: 1_100_000_000 }),
      onUpdate,
      setInlineExpandedKey: setExpand,
      currentExpandedKey: null,
    });
    handler(makeChip("heir-allocation"));
    expect(onUpdate).not.toHaveBeenCalled();
    expect(setExpand).toHaveBeenCalled();
  });
});
