/**
 * 종합부동산세 직전연도 자동계산 — 다주택 중과세율 + 주택별 합산 anchor
 *
 * 출처: 교재 제3편 종합부동산세 사례4 (일시적 1세대 2주택자 = 1세대1주택, 2022 귀속)
 * 설계: docs/02-design/features/comprehensive-tax-prior-year-multi-house.engine.design.md
 *
 * 핵심: 당해연도는 §8④2호 일시적 2주택 의제(1세대1주택, 11억·일반세율) — 이미 정확(D2-2).
 *       직전연도(2021)는 일시적 2주택 특례 미적용 → 일반 2주택 중과세율 3.6%로 재계산.
 *       두 합산 방식 공존: 재산세상당액=주택별 합산 / 종부세 과표·ⓑ분모=합산 단일.
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

// ============================================================
// PY-M2 (사례4): 직전연도 자동계산 — 조정 2주택 중과 3.6%
// ============================================================

describe("PY-M2 (사례4): 직전연도 자동 다주택 중과 — 나 44,296,223", () => {
  const input: ComprehensiveTaxInput = {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      { propertyId: "p1", assessedValue: 1_300_000_000, exclusionType: "none" },
      {
        propertyId: "p2",
        assessedValue: 1_400_000_000,
        exclusionType: "none",
        section8para4Type: "temporary_two_house",
      },
    ],
    previousYearAuto: {
      assessedValue: 2_500_000_000,
      priorHouseValues: [1_200_000_000, 1_300_000_000], // 직전 공시 12억·13억
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true, // 직전연도 조정 2주택 → 중과
    },
  };

  it("직전 재산세상당액 = 주택별 합산 4,740,000 (12억 2,250,000 + 13억 2,490,000)", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(4_740_000);
  });

  it("직전 종부세 세율 = 중과 3.6% · 재산세공전 종부세 ⓐ = 43,380,000", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.detail.appliedRate).toBe(0.036);
    expect(r.previousYearEquivalent?.detail.calculatedTax).toBe(43_380_000);
  });

  it("직전 종부세상당액 = 39,556,223 · 총상당액(나) = 44,296,223", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(39_556_223);
    expect(r.previousYearEquivalent?.total).toBe(44_296_223);
  });

  it("당해 납부할세액 ⑤ = 6,464,123 (불변) · 세부담상한 미적용", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.determinedHousingTax).toBe(6_464_123);
    expect(r.taxCap?.capAmount).toBe(66_444_334); // 다 = 나 × 150% (floor)
    expect(r.taxCap?.isApplied).toBe(false);
  });

  it("직전 종부세 과표 = 18.05억 (25억 합산 − 6억 공제, 2021 FMR 95%)", () => {
    const r = calculateComprehensiveTax(input);
    expect(r.previousYearEquivalent?.detail.taxBase).toBe(1_805_000_000);
    expect(r.previousYearEquivalent?.detail.basicDeduction).toBe(600_000_000);
    expect(r.previousYearEquivalent?.detail.assessedValue).toBe(2_500_000_000); // priorSum echo
  });
});

// ============================================================
// PY-M1: 단일 물건 자동 — priorHouseValues 미입력 하위호환 (회귀 0)
// ============================================================

describe("PY-M1: 단일 물건 자동 — 하위호환 (priorHouseValues 미입력 = assessedValue 단일)", () => {
  const baseInput = (
    prev: { priorHouseValues?: number[] },
  ): ComprehensiveTaxInput => ({
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none" }],
    previousYearAuto: {
      assessedValue: 900_000_000,
      isOneHouseOwner: false,
      ...prev,
    },
  });

  it("priorHouseValues 미입력 ↔ [assessedValue] 명시 동일 (회귀 보존)", () => {
    const rNone = calculateComprehensiveTax(baseInput({}));
    const rArr = calculateComprehensiveTax(
      baseInput({ priorHouseValues: [900_000_000] }),
    );
    expect(rArr.previousYearEquivalent?.total).toBe(
      rNone.previousYearEquivalent?.total,
    );
    expect(rArr.previousYearEquivalent?.propertyTaxEquiv).toBe(
      rNone.previousYearEquivalent?.propertyTaxEquiv,
    );
    // 단일·비다주택 → 일반세율 유지
    expect(rNone.previousYearEquivalent?.detail.appliedRate).toBeLessThan(0.02);
  });
});
