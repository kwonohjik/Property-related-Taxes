/**
 * Track B — §122 세부담상한 recompute 결과 echo anchor
 *
 * recompute 모드 result에 taxCapMode·taxCapBasisTax·recomputeDetail echo.
 * recompute 2경로(건축물·선박·항공기 메인 / 종합합산) + direct 2경로(분리·별도).
 * 설계: property-tax-followup-gaps.engine.design.md §5 B-1~B-4.
 */

import { describe, it, expect } from "vitest";
import { calculatePropertyTax } from "../../../lib/tax-engine/property-tax";

type Input = Parameters<typeof calculatePropertyTax>[0];

describe("Track B: 세부담상한 recompute echo", () => {
  it("B-2 건축물 recompute echo — taxCapMode·basisTax·recomputeDetail(단일세율)", () => {
    const r = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    expect(r.taxCapMode).toBe("recompute");
    // 재산정: 100M × 0.0025(건축물 일반) = 250,000 (= taxCapBasisTax)
    expect(r.taxCapBasisTax).toBe(250_000);
    expect(r.recomputeDetail).toEqual({
      priorYear: expect.any(Number),
      priorTaxBase: 100_000_000,
      appliedRate: 0.0025,
      recomputedTax: 250_000,
    });
  });

  it("B-1 종합합산 recompute echo — 누진(appliedRate undefined)", () => {
    const r = calculatePropertyTax({
      objectType: "land",
      landTaxType: "comprehensive_aggregate",
      publishedPrice: 1_000_000_000,
      taxCapMode: "recompute",
      previousYearTaxBase: 100_000_000,
    } as Input);
    expect(r.taxCapMode).toBe("recompute");
    // 재산정: 100M × 0.003 − 50,000 = 250,000
    expect(r.taxCapBasisTax).toBe(250_000);
    expect(r.recomputeDetail?.recomputedTax).toBe(250_000);
    expect(r.recomputeDetail?.priorTaxBase).toBe(100_000_000);
    expect(r.recomputeDetail?.appliedRate).toBeUndefined(); // 누진 단일세율 없음
  });

  it("B-3 direct 모드(건축물) — recomputeDetail undefined", () => {
    const r = calculatePropertyTax({
      objectType: "building",
      publishedPrice: 1_000_000_000,
      previousYearTax: 300_000,
    } as Input);
    expect(r.taxCapMode).toBe("direct");
    expect(r.taxCapBasisTax).toBe(300_000);
    expect(r.recomputeDetail).toBeUndefined();
  });
});
