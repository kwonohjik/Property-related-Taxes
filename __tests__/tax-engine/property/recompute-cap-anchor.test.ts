/**
 * §118 본문 세부담상한 recompute 모드 anchor — A-3 P4
 *
 * 직전연도 과세표준으로 세액상당액을 재산정(직전연도 세율) → 150% 상한.
 * 건축물·선박·종합합산만 recompute. direct(기존)·주택 미적용 회귀.
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("P4: §118 recompute 모드 — 직전 과세표준 재산정", () => {
  it("C-2 건축물 recompute — 직전과표 1억 → 재산정 250,000 × 150% = 375,000 상한", () => {
    const r = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    // 당해: 1B × 0.7 = 700M × 0.0025 = 1,750,000
    expect(r.calculatedTax).toBe(1_750_000);
    // recompute: 100M × 0.0025 = 250,000 → ×150% = 375,000
    expect(r.determinedTax).toBe(375_000);
  });

  it("C-1 건축물 direct 회귀 — previousYearTax 300,000 × 150% = 450,000 상한", () => {
    const r = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      previousYearTax: 300_000,
    } as Input);
    expect(r.determinedTax).toBe(450_000);
  });

  it("C-5 선박 recompute — 직전과표 1억 × 0.3% = 300,000 × 150% = 450,000", () => {
    const r = calculatePropertyTax({
      objectType: "vessel",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    // 당해: 700M × 0.003 = 2,100,000 / recompute: 100M × 0.003 = 300,000 → ×150% = 450,000
    expect(r.determinedTax).toBe(450_000);
  });

  it("C-6 종합합산 recompute — applyBurdenCap 경로 (재산정 250,000 × 150% = 375,000)", () => {
    const r = calculatePropertyTax({
      objectType: "land",
      landTaxType: "comprehensive_aggregate",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    // recompute: 100M × 0.003 − 50,000 = 250,000 → ×150% = 375,000
    expect(r.determinedTax).toBe(375_000);
  });

  it("C-3 주택 recompute — §122 단서 미적용 (determinedTax = 당해)", () => {
    const r = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 1_000_000_000,
      isOneHousehold: false,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    expect(r.determinedTax).toBe(r.calculatedTax);
  });
});
