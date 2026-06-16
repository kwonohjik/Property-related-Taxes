/**
 * 토지(종합합산·별도합산) calc 연도화 anchor — A-3 P3
 *
 * calculateComprehensiveAggregateTax가 rateSet 주입을 받되, 미전달 시 현행값 불변(회귀 0).
 * 별도합산(calculateSeparateAggregateTax)·분리는 입력 구조 복잡/후속 → 전체 vitest 회귀로 보장.
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveAggregateTax } from "../../../lib/tax-engine/property-tax-comprehensive-aggregate";
import {
  getCurrentPropertyRateSet,
  type PropertyRateSet,
} from "../../../lib/tax-engine/data/property-rate-history";

describe("P3: 종합합산 연도화 — 기본 현행 불변 + rateSet 주입", () => {
  it("5천만 이하 0.2% — 50,000,000 → 100,000 (회귀)", () => {
    expect(calculateComprehensiveAggregateTax(50_000_000)).toBe(100_000);
  });

  it("1억 이하 0.3% − D2(50,000) — 100,000,000 → 250,000 (회귀)", () => {
    // 100,000,000 × 0.003 = 300,000 − 50,000 = 250,000
    expect(calculateComprehensiveAggregateTax(100_000_000)).toBe(250_000);
  });

  it("1억 초과 0.5% − D3(250,000) — 200,000,000 → 750,000 (회귀)", () => {
    // 200,000,000 × 0.005 = 1,000,000 − 250,000 = 750,000
    expect(calculateComprehensiveAggregateTax(200_000_000)).toBe(750_000);
  });

  it("rateSet 주입 — 커스텀 rate1 0.001 → 50,000,000 × 0.001 = 50,000", () => {
    const cur = getCurrentPropertyRateSet();
    const custom: PropertyRateSet = {
      ...cur,
      landComprehensive: { ...cur.landComprehensive, rate1: 0.001 },
    };
    expect(calculateComprehensiveAggregateTax(50_000_000, custom)).toBe(50_000);
  });

  it("rateSet 미전달 = getCurrentPropertyRateSet() 명시 전달과 동일", () => {
    expect(calculateComprehensiveAggregateTax(200_000_000)).toBe(
      calculateComprehensiveAggregateTax(200_000_000, getCurrentPropertyRateSet()),
    );
  });
});
