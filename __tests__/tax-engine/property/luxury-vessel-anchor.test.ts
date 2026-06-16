/**
 * Track C — 고급선박 5% (§111①4호 가목) anchor
 *
 * 고급선박(§13⑤5호) 과세표준 1천분의 50(5%). 일반선박·항공기 1천분의 3(0.3%) 회귀.
 * 선박 FMR 0.7 (recompute-cap C-5 검증: 1B → 700M).
 * 설계: property-tax-followup-gaps.engine.design.md Track C §1·§5.
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import { getCurrentPropertyRateSet } from "../../../lib/tax-engine/data/property-rate-history";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("Track C: 고급선박 5%", () => {
  it("C-1 고급선박 — 시가표준 10억 → 과표 7억 × 5% = 35,000,000", () => {
    const r = calculatePropertyTax({
      objectType: "vessel",
      vesselType: "luxury",
      publishedPrice: 1_000_000_000,
    } as Input);
    expect(r.appliedRate).toBe(0.05);
    expect(r.calculatedTax).toBe(35_000_000);
  });

  it("C-2 일반선박 회귀 — 과표 7억 × 0.3% = 2,100,000", () => {
    const r = calculatePropertyTax({
      objectType: "vessel",
      publishedPrice: 1_000_000_000,
    } as Input);
    expect(r.appliedRate).toBe(0.003);
    expect(r.calculatedTax).toBe(2_100_000);
  });

  it("C-3 항공기 — 0.3% (고급 구분 없음)", () => {
    const r = calculatePropertyTax({
      objectType: "aircraft",
      publishedPrice: 1_000_000_000,
    } as Input);
    expect(r.appliedRate).toBe(0.003);
    expect(r.calculatedTax).toBe(2_100_000);
  });

  it("C-4 역사표 vesselLuxury 0.05", () => {
    expect(getCurrentPropertyRateSet().vesselLuxury).toBe(0.05);
  });
});
