/**
 * estate-item-card-compaction — Anchor #1/#2/#4
 *
 * Plan: docs/01-plan/estate-item-card-compaction.plan.md (v4)
 * UI Design: docs/02-design/features/estate-item-card-compaction.ui.design.md (v4)
 */

import { describe, it, expect } from "vitest";
import {
  resolveChips,
  countNonDefaultOptions,
  cycleSection22,
} from "@/components/calc/inheritance/estate-card/chip-config";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "test-1",
    category: "financial",
    name: "테스트 예금",
    marketValue: 1_100_000_000,
    ...overrides,
  };
}

// ============================================================
// Anchor #4 — countNonDefaultOptions 매트릭스 (Plan §8 #4)
// ============================================================

describe("Anchor #4 — countNonDefaultOptions", () => {
  it("모든 필드 기본값 → 0", () => {
    const item = makeItem();
    expect(countNonDefaultOptions(item, "inheritance")).toBe(0);
  });

  it("gift 모드 → 항상 0", () => {
    const item = makeItem({
      deemedCategory: "insurance",
      heirAllocations: [{ heirId: "h1", amount: 100 }],
    });
    expect(countNonDefaultOptions(item, "gift")).toBe(0);
  });

  it("deemedCategory=insurance → 1", () => {
    const item = makeItem({ deemedCategory: "insurance" });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(1);
  });

  it("heirAllocations=[] (협의분할 미입력) → 1", () => {
    const item = makeItem({ heirAllocations: [] });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(1);
  });

  it("heirAllocations=[{...}] → 1 (배열 길이 무관)", () => {
    const item = makeItem({ heirAllocations: [{ heirId: "h1", amount: 1_000_000 }] });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(1);
  });

  it("isFinancialAssetForDeduction 사용자 지정 = 기본값 → 0", () => {
    // financial 카테고리 기본=true. 사용자가 true로 지정 = 기본값과 동일
    const item = makeItem({ isFinancialAssetForDeduction: true });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(0);
  });

  it("isFinancialAssetForDeduction 사용자 지정 ≠ 기본값 → 1", () => {
    // financial 카테고리 기본=true. 사용자가 false로 지정 = 기본값과 다름
    const item = makeItem({ isFinancialAssetForDeduction: false });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(1);
  });

  it("deductSecuredClaimAsDebt=true → 1", () => {
    const item = makeItem({
      category: "real_estate_apartment",
      mortgageAmount: 300_000_000,
      deductSecuredClaimAsDebt: true,
    });
    expect(countNonDefaultOptions(item, "inheritance")).toBe(1);
  });

  it("4가지 비기본값 동시 → 4", () => {
    const item = makeItem({
      category: "real_estate_apartment",
      deemedCategory: "trust",
      heirAllocations: [],
      isFinancialAssetForDeduction: false, // apartment 기본 false → 변경 없음으로 카운트 0
      mortgageAmount: 300_000_000,
      deductSecuredClaimAsDebt: true,
    });
    // deemed(1) + heir(1) + secured(1) = 3 (isFinancialAssetForDeduction는 apartment 기본값과 동일이므로 0)
    expect(countNonDefaultOptions(item, "inheritance")).toBe(3);
  });
});

// ============================================================
// Anchor §22 3-state 순환 (Plan §3.5 · D2-C2)
// ============================================================

describe("§22 칩 3-state 순환", () => {
  it("undef → true", () => {
    expect(cycleSection22(undefined)).toBe(true);
  });
  it("true → false", () => {
    expect(cycleSection22(true)).toBe(false);
  });
  it("false → undef", () => {
    expect(cycleSection22(false)).toBe(undefined);
  });
});

// ============================================================
// Anchor #1·#2 — resolveChips 도출 (variant·카테고리별)
// ============================================================

describe("resolveChips — 카테고리별 칩 도출", () => {
  it("gift 모드 → estimated-value 칩만 노출", () => {
    const item = makeItem({ category: "financial" });
    const chips = resolveChips({ item, mode: "gift", heirsCount: 2 });
    expect(chips.map((c) => c.key)).toEqual(["estimated-value"]);
  });

  it("cash 카테고리 → §22 칩 미노출 (visibility=hidden_permanent)", () => {
    const item = makeItem({ category: "cash" });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const keys = chips.map((c) => c.key);
    expect(keys).toContain("estimated-value");
    expect(keys).toContain("classification");
    expect(keys).not.toContain("section22");
  });

  it("financial 카테고리 → §22 칩 노출 (default eligible)", () => {
    const item = makeItem({ category: "financial" });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const section22Chip = chips.find((c) => c.key === "section22");
    expect(section22Chip).toBeDefined();
    expect(section22Chip?.label).toBe("§22 ✓"); // financial 기본=ON
    expect(section22Chip?.tone).toBe("emerald");
  });

  it("isFinancialAssetForDeduction=false (사용자 OFF) → §22 ✗ + isUserOverride", () => {
    const item = makeItem({
      category: "financial",
      isFinancialAssetForDeduction: false,
    });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const section22Chip = chips.find((c) => c.key === "section22");
    expect(section22Chip?.label).toBe("§22 ✗");
    expect(section22Chip?.tone).toBe("gray");
    expect(section22Chip?.isUserOverride).toBe(true);
  });

  it("heirs=0 → heir-allocation 칩 미노출", () => {
    const item = makeItem();
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    expect(chips.map((c) => c.key)).not.toContain("heir-allocation");
  });

  it("heirs>0 + heirAllocations=undefined → 법정분할", () => {
    const item = makeItem();
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 2 });
    const heirChip = chips.find((c) => c.key === "heir-allocation");
    expect(heirChip?.label).toBe("법정분할");
    expect(heirChip?.tone).toBe("gray");
  });

  it("heirAllocations=[] → 협의분할 (미입력) + amber 경고", () => {
    const item = makeItem({ heirAllocations: [] });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 2 });
    const heirChip = chips.find((c) => c.key === "heir-allocation");
    expect(heirChip?.label).toBe("협의분할 (미입력)");
    expect(heirChip?.tone).toBe("amber");
  });

  it("heirAllocations=[{...}] → 협의분할 ✓ sky", () => {
    const item = makeItem({
      heirAllocations: [{ heirId: "h1", amount: 1_100_000_000 }],
    });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 2 });
    const heirChip = chips.find((c) => c.key === "heir-allocation");
    expect(heirChip?.label).toBe("협의분할 ✓");
    expect(heirChip?.tone).toBe("sky");
  });

  it("deemedCategory=insurance → 라벨 [보험금 §8] amber", () => {
    const item = makeItem({ deemedCategory: "insurance" });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const classChip = chips.find((c) => c.key === "classification");
    expect(classChip?.label).toBe("보험금 §8");
    expect(classChip?.tone).toBe("amber");
  });

  it("deemedCategory=undefined → 라벨 [일반] violet", () => {
    const item = makeItem();
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const classChip = chips.find((c) => c.key === "classification");
    expect(classChip?.label).toBe("일반");
    expect(classChip?.tone).toBe("violet");
  });

  it("deductSecuredClaimAsDebt=true → §14 칩 노출", () => {
    const item = makeItem({
      category: "real_estate_apartment",
      mortgageAmount: 300_000_000,
      deductSecuredClaimAsDebt: true,
    });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    expect(chips.map((c) => c.key)).toContain("secured-claim-14");
  });

  it("estimated-value 칩 라벨 = 평가액 금액 포맷", () => {
    const item = makeItem({ marketValue: 1_100_000_000 });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const valueChip = chips.find((c) => c.key === "estimated-value");
    expect(valueChip?.label).toBe("평가액 1,100,000,000");
  });

  it("평가액 0원 → 미입력 라벨", () => {
    const item = makeItem({ marketValue: undefined });
    const chips = resolveChips({ item, mode: "inheritance", heirsCount: 0 });
    const valueChip = chips.find((c) => c.key === "estimated-value");
    expect(valueChip?.label).toBe("평가액 미입력");
  });
});
