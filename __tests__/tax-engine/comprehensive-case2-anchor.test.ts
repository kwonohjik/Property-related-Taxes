/**
 * 사례2 — 재산세 감면율(조례 감면) anchor 테스트.
 *
 * 교재 제3편 종합부동산세 사례2 "일반 1주택자로 재산세 감면된 경우".
 *
 * 전제조건 (교재 p.xxx):
 *   - 과세연도: 2022년 귀속
 *   - 공시가격: 10억 (1주택, 일반 1주택자 — 1세대1주택자 아님)
 *   - 재산세 감면율: 25% (지자체 조례 감면, reductionRate: 0.25)
 *   - 직전연도(2021) 공시가격: 9억 (자동계산 모드, 감면 전)
 *   - 직전연도 감면율: 당해연도 동일 25% 적용 (법령 원칙3)
 *   - 1주택 공제 없음 (isOneHouseOwner: false)
 *
 * anchor 목표값 (계획서 §1.5 Pre-Do 환류):
 *   - A 지점: effectiveIncludedAssessedValue = floor(10억 × 0.75) = 750,000,000
 *   - 과세표준: (7.5억 − 9억(기공제)) < 0 → (7.5억 − 6억(2022 기공제)) × 60% = 만원절사
 *     = floor((750,000,000 - 600,000,000) × 0.60) = floor(90,000,000) → 90,000,000
 *     ★ 2022년 기공제: 일반 6억 (getComprehensiveParams(2022).basicDeductionGeneral)
 *   - calculatedTax: 90,000,000 × 0.6% = 540,000
 *
 * 재산세 비율 안분 (②ⓓ):
 *   - 재산세 과세표준 (분모): floor(7.5억 × 60%) = 450,000,000 → calcHousingTax(450,000,000) = 1,170,000
 *   - 종부세 과세표준 (분자): 90,000,000
 *   - B 지점: totalPropertyTaxAmount = floor(calcHousingTax(450,000,000) × 0.75) = floor(1,560,000 × 0.75) = 1,170,000
 *     ★ 재산세 원공시 기준 표준세율 = calcHousingTax(과세표준=6억×60%=6억) → 먼저 산출 후 ×0.75
 *     단, 분모는 감면후 공시(7.5억) 기준 재산세
 *   - comprehensiveTaxBase (②ⓑ 분자): floor(90,000,000 × 60%) / 100 ... 이미 = 90,000,000(과표)
 *     ★ ②ⓑ = 종부세 과표 × 재산세FMR = 90,000,000 × 60% / 100 × 4 / 1000 = 216,000
 *     ★ ②ⓒ = 분모 재산세: 1,170,000
 *   - creditAmount: floor(1,170,000 × 216,000 / 1,170,000) = 216,000
 *     → 단, 종부세 상한(calculatedTax=540,000)이 적용되므로: min(216,000, 540,000) = 216,000
 *   - taxBeforeCap (③): 540,000 − 216,000 = 324,000
 *
 * 세부담상한 (④나):
 *   - 직전연도 재산세상당액(①):
 *     원공시 9억 표준세율 재산세 = calcHousingTax(540,000,000) = 1,530,000
 *     ×(1−0.25) = 1,147,500  ← C 지점
 *   - 직전연도 종부세상당액(②):
 *     effectiveAssessedValue(D) = floor(9억×0.75) = 675,000,000
 *     종부세 과표 = floor((675,000,000 - 600,000,000) × 0.95) = floor(71,250,000) → 71,250,000 → trunc10k → 71,250,000
 *     ★ 2021년 FMR = 95% (getComprehensiveParams(2021).fairMarketRatioHousing)
 *     종부세 계산: 71,250,000 × 0.5% = 356,250
 *     분자(②ⓑ): floor(71,250,000 × 60% × 4 / 1000) = floor(171,000) = 171,000
 *     분모(②ⓒ D지점): floor(675,000,000 × 60%) = 405,000,000 → calcHousingTax(405,000,000) = 990,000
 *     creditAmount = floor(1,147,500 × 171,000 / 990,000) = floor(198,340.9) = 198,340
 *     comprehensiveTaxEquiv = 356,250 − 198,340 = 157,910
 *   - 총 직전연도 상당액: 1,147,500 + 157,910 = 1,305,410
 *   - 세부담상한 = 1,305,410 × 150% = 1,958,115
 *   - 당해연도 총세액(주택분) = 재산세(1,170,000) + 종부세결정전(324,000) = 1,494,000
 *   - 1,494,000 < 1,958,115 → 세부담상한 미적용 (taxCap.isApplied: false)
 *   - determinedHousingTax = 324,000
 *
 * ★ 위 산식은 구현 후 실측값과 대조하여 최종 확정 — 중간 수치는 엔진 dump로 검증
 *
 * Plan: docs/01-plan/features/comprehensive-tax-property-tax-reduction.plan.md
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import type {
  ComprehensiveTaxInput,
  PreviousYearAutoInput,
} from "../../lib/tax-engine/types/comprehensive.types";

// ──────────────────────────────────────────────────────────────
// 회귀 케이스 (감면율 0, 기존 동작 보존)
// ──────────────────────────────────────────────────────────────

function case2NoReduction(): ComprehensiveTaxInput {
  const previousYearAuto: PreviousYearAutoInput = {
    assessedValue: 900_000_000, // 21년 공시 9억
    isOneHouseOwner: false,
    // reductionRate 없음 — 기존 동작 그대로
  };
  return {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none" }],
    previousYearAuto,
  };
}

// ──────────────────────────────────────────────────────────────
// 사례2-A — 감면율 0.25 적용 anchor 케이스
// ──────────────────────────────────────────────────────────────

function case2WithReduction(): ComprehensiveTaxInput {
  const previousYearAuto: PreviousYearAutoInput = {
    assessedValue: 900_000_000, // 21년 공시 9억 (감면 전 원공시)
    isOneHouseOwner: false,
    reductionRate: 0.25, // 법령 원칙3: 해당연도 감면율을 직전연도 자동계산에도 적용
  };
  return {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      {
        propertyId: "p1",
        assessedValue: 1_000_000_000, // 당해연도 공시 10억 (감면 전 원공시)
        exclusionType: "none",
        reductionRate: 0.25, // 25% 조례 감면
      },
    ],
    previousYearAuto,
  };
}

// ──────────────────────────────────────────────────────────────
// 회귀: 감면율 없는 기존 동작 보존
// ──────────────────────────────────────────────────────────────

describe("사례2 회귀 — 감면율 0 (기존 동작 보존)", () => {
  it("REG-01: effectiveIncludedAssessedValue = includedAssessedValue (감면 없음)", () => {
    const r = calculateComprehensiveTax(case2NoReduction());
    expect(r.effectiveIncludedAssessedValue).toBe(r.includedAssessedValue);
  });

  it("REG-02: 감면율 0 → effectiveIncludedAssessedValue = 10억", () => {
    const r = calculateComprehensiveTax(case2NoReduction());
    expect(r.effectiveIncludedAssessedValue).toBe(1_000_000_000);
  });

  it("REG-03: 감면율 0 → 2022년 과세표준 = floor((10억−6억)×60%) = 240,000,000", () => {
    const r = calculateComprehensiveTax(case2NoReduction());
    // 2022년 기공제 6억 (일반), FMR 60%
    // (1,000,000,000 - 600,000,000) × 0.60 = 240,000,000 (만원 단위 정확)
    expect(r.taxBase).toBe(240_000_000);
  });
});

// ──────────────────────────────────────────────────────────────
// 사례2-A: 감면율 0.25 anchor
// ──────────────────────────────────────────────────────────────

describe("사례2-A — 감면율 0.25 적용 anchor", () => {
  it("CASE2-A1: A 지점 — effectiveIncludedAssessedValue = floor(10억 × 0.75) = 750,000,000", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // A 지점: 감면후 유효 공시가격 합산
    expect(r.effectiveIncludedAssessedValue).toBe(750_000_000);
  });

  it("CASE2-A2: 과세표준 = floor((7.5억−6억) × 60%) = 90,000,000", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 2022년 기공제 6억 (일반), FMR 60%
    // (750,000,000 - 600,000,000) × 0.60 = 90,000,000
    expect(r.taxBase).toBe(90_000_000);
  });

  it("CASE2-A3: ① 재산세공제전 종부세액 = 90,000,000 × 0.6% = 540,000 (교재 ①)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 2022 일반(2주택 이하) 종부세율 과표 3억 이하 = 0.6% (교재 명시).
    // 90,000,000 × 0.6% = 540,000.
    expect(r.calculatedTax).toBe(540_000);
  });

  it("CASE2-A4: B 지점 — totalPropertyTax는 감면 적용된 재산세 합계", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 원공시 10억 기준 calcHousingTax() = 1,770,000 (실측)
    // B 지점: floor(1,770,000 × 0.75) = 1,327,500
    // ★ anchor 수정: 원공시 기준 재산세에 후 곱 방식 적용 (아래 재산세 세율 구조 기준)
    //   10억 공시기준 주택 재산세 = 원공시 기준 표준세율 계산 후 × (1−rate)
    expect(r.propertyTaxCredit.totalPropertyTax).toBe(1_327_500);
  });

  it("CASE2-A4b: propertyTaxBase (②ⓒ 분모) = 감면후 공시 기준 표준세율 재산세 = 1,170,000", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // ②ⓒ 분모: 감면후 공시(7.5억) 기준 표준세율 전체 재산세
    // 7.5억 × 재산세 FMR → calcHousingTax(과세표준) = 1,170,000 (실측)
    expect(r.propertyTaxCredit.propertyTaxBase).toBe(1_170_000);
  });

  it("CASE2-A5: taxCap.isApplied = false (세부담상한 미적용)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    expect(r.taxCap?.isApplied).toBe(false);
  });

  it("CASE2-A6: previousYearEquivalent.propertyTaxEquiv = floor(1,530,000 × 0.75) = 1,147,500", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // C 지점: 원공시 9억 표준세율 재산세 × (1−0.25)
    // 원공시 9억 재산세 과표 = 9억×60% = 540,000,000
    // calcHousingTax(540,000,000) = 1,530,000 → ×0.75 = 1,147,500
    expect(r.previousYearEquivalent?.propertyTaxEquiv).toBe(1_147_500);
  });

  it("CASE2-A7: ②ⓑ 표준세율재산세액(종부세 과표분) = 90,000,000 × 60% × 0.4% = 216,000 (교재 ②ⓑ)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    expect(r.propertyTaxCredit.comprehensiveTaxBase).toBe(216_000);
  });

  it("CASE2-A8: ②ⓓ 공제할 재산세액 = round(1,327,500 × 216,000/1,170,000) = 245,077 (교재 정합)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 정확값 245,076.92 → round-half-up 245,077 = 교재. §4의3 시행령 절사 미규정 → 교재·실무 반올림(safeMulDivRound).
    expect(r.propertyTaxCredit.creditAmount).toBe(245_077);
  });

  it("CASE2-A9: ④나② 직전연도 종부세상당액 = 229,295 (교재 정합)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 직전연도 안분공제 round → 198,205(= 교재). 427,500 − 198,205 = 229,295.
    expect(r.previousYearEquivalent?.comprehensiveTaxEquiv).toBe(229_295);
  });

  it("CASE2-A10: ③/⑤ 납부할세액 = ① − ②ⓓ = 540,000 − 245,077 = 294,923 (교재 정합)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 세부담상한 미적용(④=0)이므로 taxBeforeCap = determinedHousingTax. 안분 round로 교재 ⑤ 294,923 정확 일치.
    expect(r.taxBeforeCap).toBe(294_923);
    expect(r.determinedHousingTax).toBe(294_923);
  });

  it("CASE2-A11: 재산세 참고·종합합계 감면후 반영 (버그 회귀 — 최상위 totalPropertyTax/grandTotal)", () => {
    const r = calculateComprehensiveTax(case2WithReduction());
    // 최상위 totalPropertyTax("재산세 참고") = 감면후 실부과 = floor(1,770,000 × 0.75) = 1,327,500
    expect(r.totalPropertyTax).toBe(1_327_500);
    // 종합 납부 합계 = 종부세결정 294,923 + 주택분 농특세 58,984 + 재산세(감면후) 1,327,500
    expect(r.grandTotal).toBe(1_681_407);
  });
});

// ──────────────────────────────────────────────────────────────
// 경계값 테스트
// ──────────────────────────────────────────────────────────────

describe("사례2 경계값 — 감면율 edge case", () => {
  it("EDGE-01: reductionRate = 0 → effectiveIncludedAssessedValue = assessedValue", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none", reductionRate: 0 }],
    };
    const r = calculateComprehensiveTax(input);
    expect(r.effectiveIncludedAssessedValue).toBe(1_000_000_000);
  });

  it("EDGE-02: reductionRate = 1.0 (100% 감면) → effectiveIncludedAssessedValue = 0", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none", reductionRate: 1.0 }],
    };
    const r = calculateComprehensiveTax(input);
    // floor(10억 × (1−1.0)) = 0
    expect(r.effectiveIncludedAssessedValue).toBe(0);
    // 과세표준 0 → calculatedTax 0
    expect(r.determinedHousingTax).toBe(0);
  });

  it("EDGE-03: reductionRate 미입력 → effectiveIncludedAssessedValue = includedAssessedValue", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [{ propertyId: "p1", assessedValue: 1_000_000_000, exclusionType: "none" }],
    };
    const r = calculateComprehensiveTax(input);
    expect(r.effectiveIncludedAssessedValue).toBe(r.includedAssessedValue);
    expect(r.effectiveIncludedAssessedValue).toBe(1_000_000_000);
  });

  it("EDGE-04: 다주택 감면율 적용 — 각 주택 독립 floor", () => {
    const input: ComprehensiveTaxInput = {
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "p1", assessedValue: 500_000_000, exclusionType: "none", reductionRate: 0.25 },
        { propertyId: "p2", assessedValue: 500_000_000, exclusionType: "none", reductionRate: 0.25 },
      ],
    };
    const r = calculateComprehensiveTax(input);
    // floor(5억×0.75) + floor(5억×0.75) = 375,000,000 + 375,000,000 = 750,000,000
    expect(r.effectiveIncludedAssessedValue).toBe(750_000_000);
  });
});
