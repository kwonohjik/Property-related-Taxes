/**
 * 건축물·선박 calc 연도화 anchor — A-3 P2
 *
 * calcBuildingTax/선박 본세가 rateSet 주입을 받되, 미전달 시 현행값 불변(회귀 0).
 */

import { describe, it, expect } from "vitest";
import { calcBuildingTax, calculatePropertyTax } from "../../../lib/tax-engine/property-tax";
import {
  getCurrentPropertyRateSet,
  type PropertyRateSet,
} from "../../../lib/tax-engine/data/property-rate-history";

describe("P2: calcBuildingTax 연도화 — 기본 현행 불변 + rateSet 주입", () => {
  it("기본(현행) general 0.25% — 100,000,000 → 250,000 (회귀)", () => {
    expect(calcBuildingTax(100_000_000, "general").tax).toBe(250_000);
  });

  it("기본 luxury 4% — 100,000,000 → 4,000,000", () => {
    expect(calcBuildingTax(100_000_000, "luxury").tax).toBe(4_000_000);
  });

  it("기본 factory 0.5% — 100,000,000 → 500,000", () => {
    expect(calcBuildingTax(100_000_000, "factory").tax).toBe(500_000);
  });

  it("rateSet 주입 — 커스텀 general 0.1% → 100,000", () => {
    const custom: PropertyRateSet = { ...getCurrentPropertyRateSet(), buildingGeneral: 0.001 };
    expect(calcBuildingTax(100_000_000, "general", custom).tax).toBe(100_000);
  });

  it("rateSet 미전달 = getCurrentPropertyRateSet() 명시 전달과 동일", () => {
    expect(calcBuildingTax(100_000_000, "general").tax).toBe(
      calcBuildingTax(100_000_000, "general", getCurrentPropertyRateSet()).tax,
    );
  });
});

describe("P2: 선박 본세 연도화 — 현행 0.3% 불변 (회귀)", () => {
  it("vessel 세율 = rateSet.vesselAircraft 0.003", () => {
    const r = calculatePropertyTax({
      objectType: "vessel",
      publishedPrice: 100_000_000,
    } as Parameters<typeof calculatePropertyTax>[0]);
    expect(r.appliedRate).toBe(0.003);
  });
});
