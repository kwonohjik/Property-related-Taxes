/**
 * 종합부동산세 사례7 — 다가구 면적안분 재산세 ⓐ 자동화 (트랙 A · floorUnits)
 *
 * 출처: 국세청 「종합부동산세 세액계산 사례」 제8장 사례7 (2022 귀속)
 * 계획서: docs/01-plan/features/comprehensive-case789-auto-property-tax.plan.md
 * 엔진설계: docs/02-design/features/comprehensive-case789-auto-property-tax.engine.design.md
 *
 * 수동입력(propertyTaxAmount, PR #210) 우회를 floorUnits 자동 산정으로 대체.
 *   통합공시 8억 → 구별 면적안분(120/120/60) → 각 구분 calculatePropertyTax 누진 → 합산 ⓐ=714,000.
 *   ★ 누진세율 분배법칙 불성립: 1동 통째(1,290,000) ≠ 구별 합산(714,000).
 *   우선순위: propertyTaxAmount(직접입력) > floorUnits(다가구) > 단일 assessedValue(기존).
 */

import { describe, it, expect } from "vitest";
import { calculateComprehensiveTax } from "../../lib/tax-engine/comprehensive-tax";
import { calcMultiFamilyHousingTax } from "../../lib/tax-engine/multi-family-housing-tax";
import { calculatePropertyTax } from "../../lib/tax-engine/property-tax";
import { buildHousingPropertyTaxWithCap } from "../../lib/tax-engine/comprehensive-housing-tax-cap";
import type { ComprehensiveTaxInput } from "../../lib/tax-engine/types/comprehensive.types";

const SEOCHO_FLOORS = [
  { label: "1층", area: 120 },
  { label: "2층", area: 120 },
  { label: "지하", area: 60 },
];

describe("사례7 자동 (다가구 floorUnits): 면적안분 누진 합산 → ⓐ 714,000 (AUTO-A1·A2)", () => {
  const input: ComprehensiveTaxInput = {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    properties: [
      {
        propertyId: "house",
        assessedValue: 800_000_000,
        floorUnits: SEOCHO_FLOORS,
      },
    ],
    previousYearTotalTax: 1_020_926,
  };

  it("⑤ 결정세액 560,595 · ① 720,000 · ⓓ 159,405 (수동입력 없이 floorUnits 자동)", () => {
    const result = calculateComprehensiveTax(input);
    expect(result.calculatedTax).toBe(720_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(159_405);
    expect(result.determinedHousingTax).toBe(560_595);
  });

  it("multiFamilyBreakdown echo — 구별 안분 공시·세액 (1층 300,000 · 2층 300,000 · 지하 114,000)", () => {
    const result = calculateComprehensiveTax(input);
    const bd = result.properties[0].multiFamilyBreakdown;
    expect(bd).toBeDefined();
    expect(bd).toHaveLength(3);
    expect(bd!.map((u) => u.apportionedAssessedValue)).toEqual([
      320_000_000, 320_000_000, 160_000_000,
    ]);
    expect(bd!.map((u) => u.tax)).toEqual([300_000, 300_000, 114_000]);
    expect(bd!.reduce((s, u) => s + u.tax, 0)).toBe(714_000);
  });
});

describe("calcMultiFamilyHousingTax 헬퍼: 누진 분배법칙 불성립 + floor 잔액 흡수", () => {
  it("구별 합산(714,000) ≠ 1동 통째(1,290,000) — 분배법칙 불성립", () => {
    const split = calcMultiFamilyHousingTax(
      800_000_000,
      SEOCHO_FLOORS,
      false,
      "2022-06-01",
    );
    expect(split.total).toBe(714_000);

    // 통합 8억 단일 산출(과대) — 구별 안분과 다름을 입증
    const whole = calculatePropertyTax({
      objectType: "housing",
      publishedPrice: 800_000_000,
      isOneHousehold: false,
      targetDate: "2022-06-01",
    }).determinedTax;
    expect(whole).toBe(1_290_000);
    expect(split.total).not.toBe(whole);
  });

  it("floor 잔액 흡수 — 소수 면적도 Σ구별공시 = 통합공시 보존", () => {
    const r = calcMultiFamilyHousingTax(
      700_000_000,
      [
        { label: "a", area: 33.33 },
        { label: "b", area: 33.33 },
        { label: "c", area: 33.34 },
      ],
      false,
      "2022-06-01",
    );
    const sumAssessed = r.perUnit.reduce(
      (s, u) => s + u.apportionedAssessedValue,
      0,
    );
    expect(sumAssessed).toBe(700_000_000);
  });

  it("빈 floorUnits·면적 0 → total 0 (방어 가드)", () => {
    expect(calcMultiFamilyHousingTax(800_000_000, [], false, "2022-06-01").total).toBe(0);
    expect(
      calcMultiFamilyHousingTax(
        800_000_000,
        [{ label: "x", area: 0 }],
        false,
        "2022-06-01",
      ).total,
    ).toBe(0);
  });
});

describe("우선순위 (AUTO-C1): propertyTaxAmount(직접입력) > floorUnits(다가구)", () => {
  it("둘 다 입력 시 propertyTaxAmount override · multiFamilyBreakdown 미생성", () => {
    const result = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        {
          propertyId: "h",
          assessedValue: 800_000_000,
          propertyTaxAmount: 999_999,
          floorUnits: SEOCHO_FLOORS,
        },
      ],
      previousYearTotalTax: 1_020_926,
    });
    expect(result.properties[0].propertyTax).toBe(999_999);
    expect(result.properties[0].multiFamilyBreakdown).toBeUndefined();
  });
});

describe("회귀 (AUTO-R): floorUnits 미입력 시 단일 공시 자동계산 불변", () => {
  it("floorUnits 없으면 기존 calculatePropertyTax 경로 — 공제 781,357 불변 (사례5)", () => {
    const result = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: true,
      properties: [
        { propertyId: "p1", assessedValue: 1_500_000_000, exclusionType: "none" },
        { propertyId: "p2", assessedValue: 200_000_000, exclusionType: "none" },
      ],
    });
    expect(result.calculatedTax).toBe(2_280_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(781_357);
    expect(result.properties[0].multiFamilyBreakdown).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// 트랙 B — 주택 세부담상한 (priorAssessedValue) — 사례8·9
// ════════════════════════════════════════════════════════════

describe("사례8 자동 (priorAssessedValue): 주택 세부담상한 → ⓐ 4,379,700 (AUTO-B1·B2)", () => {
  const input: ComprehensiveTaxInput = {
    assessmentYear: 2022,
    isOneHouseOwner: false,
    isMultiHouseInAdjustedArea: true,
    properties: [
      { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, priorAssessedValue: 1_500_000_000 },
      { propertyId: "gangnam", assessedValue: 1_000_000_000, priorAssessedValue: 800_000_000 },
    ],
    previousYearTotalTax: 22_173_882,
  };

  it("⑤ 16,747,099 · ① 18,960,000 · ⓓ 2,212,901 (수동입력 없이 priorAssessedValue 자동)", () => {
    const result = calculateComprehensiveTax(input);
    expect(result.calculatedTax).toBe(18_960_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(2_212_901);
    expect(result.determinedHousingTax).toBe(16_747_099);
  });

  it("housingTaxCapDetail echo — 서초 130% cap 발동 (4,170,000 → 3,861,000 → ×0.7 = 2,702,700)", () => {
    const result = calculateComprehensiveTax(input);
    const seocho = result.properties.find((p) => p.propertyId === "seocho")!;
    expect(seocho.housingTaxCapDetail).toBeDefined();
    expect(seocho.housingTaxCapDetail!.standardTax).toBe(4_170_000);
    expect(seocho.housingTaxCapDetail!.priorStandardTax).toBe(2_970_000);
    expect(seocho.housingTaxCapDetail!.capPct).toBe(130);
    expect(seocho.housingTaxCapDetail!.capAmount).toBe(3_861_000);
    expect(seocho.housingTaxCapDetail!.cappedTax).toBe(3_861_000);
    expect(seocho.housingTaxCapDetail!.imposedTax).toBe(2_702_700);
    // 강남 cap 발동 (감면 없음): 1,770,000 → min(·, 1,290,000 × 130% = 1,677,000)
    const gangnam = result.properties.find((p) => p.propertyId === "gangnam")!;
    expect(gangnam.housingTaxCapDetail!.imposedTax).toBe(1_677_000);
  });
});

describe("사례9 자동 (priorAssessedValue): 3주택 세부담상한 → ⑤ 25,546,712 (AUTO-B3)", () => {
  it("안양 110% 구간 포함 (직전 420,000 × 110% = 462,000)", () => {
    const result = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      properties: [
        { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, priorAssessedValue: 1_500_000_000 },
        { propertyId: "gangnam", assessedValue: 1_000_000_000, priorAssessedValue: 800_000_000 },
        { propertyId: "anyang", assessedValue: 500_000_000, priorAssessedValue: 400_000_000 },
      ],
      previousYearTotalTax: 35_630_694,
    });
    expect(result.calculatedTax).toBe(28_080_000);
    expect(result.propertyTaxCredit.creditAmount).toBe(2_533_288);
    expect(result.determinedHousingTax).toBe(25_546_712);
    const anyang = result.properties.find((p) => p.propertyId === "anyang")!;
    expect(anyang.housingTaxCapDetail!.capPct).toBe(110);
    expect(anyang.housingTaxCapDetail!.imposedTax).toBe(462_000);
  });
});

describe("buildHousingPropertyTaxWithCap 헬퍼: §122 단서 · 시행령 §118", () => {
  it("서초 2022: 당해 4,170,000 / 직전표준 2,970,000 × 130% = 3,861,000 → cap 발동", () => {
    const cap = buildHousingPropertyTaxWithCap(
      4_170_000, 1_500_000_000, 2022, 2_000_000_000, false, "2021-06-01",
    );
    expect(cap.priorStandardTax).toBe(2_970_000);
    expect(cap.capPct).toBe(130);
    expect(cap.capAmount).toBe(3_861_000);
    expect(cap.cappedTax).toBe(3_861_000);
  });

  it("AUTO-C2: 2024+ 세부담상한 폐지 → capPct null · 상한 미적용(당해 표준세율 그대로)", () => {
    const cap = buildHousingPropertyTaxWithCap(
      5_000_000, 400_000_000, 2024, 500_000_000, false, "2023-06-01",
    );
    expect(cap.capPct).toBeNull();
    expect(cap.capAmount).toBeNull();
    expect(cap.cappedTax).toBe(5_000_000);
  });
});

describe("우선순위 (AUTO-C1 확장): priorAssessedValue도 propertyTaxAmount에 양보", () => {
  it("propertyTaxAmount + priorAssessedValue 동시 → 직접입력 우선 · housingTaxCapDetail 미생성", () => {
    const result = calculateComprehensiveTax({
      assessmentYear: 2022,
      isOneHouseOwner: false,
      isMultiHouseInAdjustedArea: true,
      properties: [
        { propertyId: "seocho", assessedValue: 2_000_000_000, reductionRate: 0.3, propertyTaxAmount: 2_702_700, priorAssessedValue: 1_500_000_000 },
        { propertyId: "gangnam", assessedValue: 1_000_000_000, propertyTaxAmount: 1_677_000, priorAssessedValue: 800_000_000 },
      ],
      previousYearTotalTax: 22_173_882,
    });
    expect(result.determinedHousingTax).toBe(16_747_099);
    expect(result.properties[0].housingTaxCapDetail).toBeUndefined();
  });
});
