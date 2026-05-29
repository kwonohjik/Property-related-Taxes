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

  // 2026-05-29 — 상장·비상장 주식 보충평가 fallback (chip-config 칩 라벨 "평가액 미입력" 오표시 정정)
  // [[project_section22_major_shareholder_toggle]] Phase0 동일 패턴
  it("상장주식 명시 평가액 없음 → 전후 2개월 평균×주식수 (§63①1가)", () => {
    const item = makeItem({
      category: "listed_stock",
      listedStockAvgPrice: 10_000,
      listedStockShares: 15_000,
    });
    expect(computeEffectiveValuation(item)).toBe(150_000_000);
  });

  it("상장주식이라도 marketValue 명시 시 명시값 우선 (§60 시가 우선)", () => {
    const item = makeItem({
      category: "listed_stock",
      marketValue: 200_000_000,
      listedStockAvgPrice: 10_000,
      listedStockShares: 15_000,
    });
    expect(computeEffectiveValuation(item)).toBe(200_000_000);
  });
});
