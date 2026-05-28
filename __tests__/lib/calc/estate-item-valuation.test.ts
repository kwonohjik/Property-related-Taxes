/**
 * estate-item-valuation — 단위 anchor
 *
 * Plan estate-card-followup §FU-1 사전분리
 * Design D-O7 anchor 시나리오 5건
 */

import { describe, it, expect } from "vitest";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeItem(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "t-1",
    category: "financial",
    name: "테스트",
    ...overrides,
  };
}

describe("computeEffectiveValuation — 우선순위 매트릭스", () => {
  it("deposit 카테고리 → leaseDeposit 반환", () => {
    const item = makeItem({ category: "deposit", leaseDeposit: 500_000_000 });
    expect(computeEffectiveValuation(item)).toBe(500_000_000);
  });

  it("시가 우선 — 감정가·기준시가 무시", () => {
    const item = makeItem({
      marketValue: 1_000,
      appraisedValue: 2_000,
      standardPrice: 3_000,
    });
    expect(computeEffectiveValuation(item)).toBe(1_000);
  });

  it("시가 없으면 감정가", () => {
    const item = makeItem({
      appraisedValue: 2_000,
      standardPrice: 3_000,
    });
    expect(computeEffectiveValuation(item)).toBe(2_000);
  });

  it("시가·감정가 없으면 기준시가", () => {
    const item = makeItem({ standardPrice: 3_000 });
    expect(computeEffectiveValuation(item)).toBe(3_000);
  });

  it("모든 평가액 없으면 0", () => {
    const item = makeItem();
    expect(computeEffectiveValuation(item)).toBe(0);
  });

  it("deposit + leaseDeposit 없으면 0 (marketValue 무관)", () => {
    const item = makeItem({
      category: "deposit",
      marketValue: 999_999, // deposit에서는 무시
    });
    expect(computeEffectiveValuation(item)).toBe(0);
  });
});
