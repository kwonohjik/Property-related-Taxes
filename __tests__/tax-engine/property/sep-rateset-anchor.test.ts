/**
 * Track A — 분리과세 세율 연도화 anchor
 *
 * classify 3함수(저율·일반·중과)를 역사표 rateSet 참조로 전환.
 * A-1·A-4: 현행 회귀(구현 전후 동일). A-2·A-3: rateSet 주입 검증(구현 전 리터럴 → 실패확보).
 * 설계: property-tax-followup-gaps.engine.design.md Track A §1·§3.
 */

import { describe, it, expect } from "vitest";
import {
  classifySeparateTaxation,
  calculateSeparateTax,
} from "../../../lib/tax-engine/separate-taxation";
import type { SeparateTaxationInput } from "../../../lib/tax-engine/separate-taxation";
import {
  getCurrentPropertyRateSet,
  getPropertyRateSet,
} from "../../../lib/tax-engine/data/property-rate-history";

describe("Track A: 분리과세 세율 연도화", () => {
  it("A-1 저율 현행 회귀 — 시가표준 1억 → 과표 7천만 × 0.0007 = 49,000", () => {
    const r = calculateSeparateTax({ assessedValue: 100_000_000, isFarmland: true } as SeparateTaxationInput);
    expect(r.appliedRate).toBe(0.0007);
    expect(r.calculatedTax).toBe(49_000);
  });

  it("A-2 rateSet 주입 — classify 저율이 주입 세율 사용", () => {
    const fake = { ...getCurrentPropertyRateSet(), landSeparatedLow: 0.001 };
    const r = classifySeparateTaxation(
      { assessedValue: 100_000_000, isFarmland: true } as SeparateTaxationInput,
      fake,
    );
    expect(r.appliedRate).toBe(0.001); // 구현 전: 리터럴 0.0007 → 실패
  });

  it("A-3 rateSet 주입 — classify 중과(회원제 골프장)가 주입 세율 사용", () => {
    const fake = { ...getCurrentPropertyRateSet(), landSeparatedHigh: 0.05 };
    const r = classifySeparateTaxation(
      { assessedValue: 100_000_000, isGolfCourse: true, golfCourseType: "member" } as SeparateTaxationInput,
      fake,
    );
    expect(r.appliedRate).toBe(0.05); // 구현 전: 리터럴 0.04 → 실패
  });

  it("A-4 getPropertyRateSet(2026) 분리 세율 현행 일치", () => {
    const rs = getPropertyRateSet(2026);
    expect(rs.landSeparatedLow).toBe(0.0007);
    expect(rs.landSeparatedGeneral).toBe(0.002);
    expect(rs.landSeparatedHigh).toBe(0.04);
  });
});
