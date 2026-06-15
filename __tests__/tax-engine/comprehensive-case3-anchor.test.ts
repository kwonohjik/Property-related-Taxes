/**
 * 사례3 — 공유지분(지분율) anchor 테스트.
 *
 * 교재 제3편 종합부동산세 사례3 "공유지분이 있는 경우(≠1세대1주택자)".
 * 지분율은 감면율과 동일 위치에 곱(effectiveFactor = ownershipRatio × (1−reductionRate)).
 * ★ applyEffectiveFactor는 BigInt 만분율 정수 연산 — float 곱 1원 오차 방지(0.7 = float 부정확).
 * Plan: docs/01-plan/features/comprehensive-tax-ownership-ratio.plan.md
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

// 사례3: 일반 1주택자, 공시 15억/13억, 지분율 70%, 감면 없음
function case3(): ComprehensiveTaxInput {
  return {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none", ownershipRatio: 0.7 },
    ],
    previousYearAuto: {
      assessedValue: 1_300_000_000, // 21년 공시 13억 (원공시)
      isOneHouseOwner: false,
      ownershipRatio: 0.7, // 해당연도 지분율 적용(원칙3)
    },
  };
}

describe("사례3 — 공유지분 70% anchor (교재 전수)", () => {
  it("C3-A1: effectiveIncludedAssessedValue = floor(15억 × 0.7) = 1,050,000,000 (BigInt 정수 — float 1원 오차 없음)", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.effectiveIncludedAssessedValue).toBe(1_050_000_000);
  });

  it("C3-A2: 과세표준 = (10.5억 − 6억) × 60% = 270,000,000", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.taxBase).toBe(270_000_000);
  });

  it("C3-A3: ① 재산세공제전 종부세액 = 270,000,000 × 0.6% = 1,620,000", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.calculatedTax).toBe(1_620_000);
  });

  it("C3-A4: ②ⓐ 재산세(지분후) = 2,970,000 × 0.7 = 2,079,000", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.propertyTaxCredit.totalPropertyTax).toBe(2_079_000);
  });

  it("C3-A5: ②ⓑ 216→648,000 / ②ⓒ 1,890,000 / ②ⓓ 712,800", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(648_000);
    expect(r.propertyTaxCredit.propertyTaxBase).toBe(1_890_000);
    expect(r.propertyTaxCredit.creditAmount).toBe(712_800);
  });

  it("C3-A6: ③/⑤ 납부할세액 = 1,620,000 − 712,800 = 907,200", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.taxBeforeCap).toBe(907_200);
    expect(r.determinedHousingTax).toBe(907_200);
  });

  it("C3-A7: ④ 세부담상한 미적용 (가 2,986,200 ≤ 다 4,075,857)", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.taxCap?.isApplied).toBe(false);
  });

  it("C3-A8: 직전연도 재산세상당 1,743,000 / 종부세상당 974,238", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(1_743_000);
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(974_238);
  });

  it("C3-A9: 재산세 참고(최상위 totalPropertyTax) = 지분후 2,079,000", () => {
    const r = calculateComprehensiveTax(case3());
    expect(r.totalPropertyTax).toBe(2_079_000);
  });
});

describe("사례3 회귀 — 지분율 미입력 = 100% 단독", () => {
  it("C3-REG1: ownershipRatio 미입력 → effectiveIncludedAssessedValue = 원공시 (기존 동작 보존)", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" }],
    };
    const r = calculateComprehensiveTax(input);
    expect(r.effectiveIncludedAssessedValue).toBe(1_500_000_000);
  });

  it("C3-REG2: ownershipRatio = 1.0 명시 → 미입력과 동일", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none", ownershipRatio: 1.0 }],
    };
    const r = calculateComprehensiveTax(input);
    expect(r.effectiveIncludedAssessedValue).toBe(1_500_000_000);
  });
});

describe("사례3 결합/합산배제 — 지분 × 감면, A-2 검증", () => {
  it("C3-COMBO: 지분 70% + 감면 25% 결합 → effectiveIncluded = floor(15억 × 0.7 × 0.75) = 787,500,000", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        {
          propertyId: "p1",
          assessedValue: 1_500_000_000,
          exclusionType: "none",
          ownershipRatio: 0.7,
          reductionRate: 0.25,
        },
      ],
    };
    const r = calculateComprehensiveTax(input);
    // BigInt: 15억 × 7000 × 7500 / 1e8 = 787,500,000 (float이면 1원 오차 가능)
    expect(r.effectiveIncludedAssessedValue).toBe(787_500_000);
  });
});
