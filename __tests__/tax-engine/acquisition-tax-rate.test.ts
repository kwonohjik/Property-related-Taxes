/**
 * 취득세 세율 결정 단위 테스트
 *
 * acquisition-tax-rate.ts — linearInterpolationRate, getBasicRate,
 *                           calcRuralSpecialTax, calcLocalEducationTax
 */

import { describe, it, expect } from "vitest";
import {
  linearInterpolationRate,
  calcLinearInterpolationTax,
  getBasicRate,
  calcRuralSpecialTax,
  calcLocalEducationTax,
} from "../../lib/tax-engine/acquisition-tax-rate";

// ============================================================
// linearInterpolationRate — 주택 선형보간 세율
// ============================================================

describe("linearInterpolationRate — 경계값", () => {
  it("6억 이하: 1%", () => {
    expect(linearInterpolationRate(600_000_000)).toBe(0.01);
    expect(linearInterpolationRate(500_000_000)).toBe(0.01);
    expect(linearInterpolationRate(1)).toBe(0.01);
  });

  it("9억 이상: 3%", () => {
    expect(linearInterpolationRate(900_000_000)).toBe(0.03);
    expect(linearInterpolationRate(1_000_000_000)).toBe(0.03);
  });

  it("7억 5천만 (중간값): 약 2%", () => {
    // (750,000,000 × 2 - 900,000,000) / 30,000,000,000
    // = 600,000,000 / 30,000,000,000 = 0.02
    const rate = linearInterpolationRate(750_000_000);
    expect(rate).toBeCloseTo(0.02, 5);
  });

  it("7억: 약 1.667%", () => {
    // (700,000,000 × 2 - 900,000,000) / 30,000,000,000
    // = 500,000,000 / 30,000,000,000 ≈ 0.016667
    const rate = linearInterpolationRate(700_000_000);
    expect(rate).toBeGreaterThan(0.01);
    expect(rate).toBeLessThan(0.02);
    expect(rate).toBeCloseTo(0.01667, 4);
  });

  it("8억: 약 2.333%", () => {
    // (800,000,000 × 2 - 900,000,000) / 30,000,000,000
    // = 700,000,000 / 30,000,000,000 ≈ 0.023333
    const rate = linearInterpolationRate(800_000_000);
    expect(rate).toBeGreaterThan(0.02);
    expect(rate).toBeLessThan(0.03);
    expect(rate).toBeCloseTo(0.02333, 4);
  });

  it("선형 단조증가: 6억1천만 < 7억 < 7억5천만 < 8억 < 8억9천만", () => {
    const r1 = linearInterpolationRate(610_000_000);
    const r2 = linearInterpolationRate(700_000_000);
    const r3 = linearInterpolationRate(750_000_000);
    const r4 = linearInterpolationRate(800_000_000);
    const r5 = linearInterpolationRate(890_000_000);
    expect(r1).toBeLessThan(r2);
    expect(r2).toBeLessThan(r3);
    expect(r3).toBeLessThan(r4);
    expect(r4).toBeLessThan(r5);
  });
});

describe("calcLinearInterpolationTax", () => {
  it("7억5천만 × 2% = 15,000,000원", () => {
    const tax = calcLinearInterpolationTax(750_000_000);
    expect(tax).toBe(15_000_000);
  });

  it("6억: 1% = 6,000,000원", () => {
    expect(calcLinearInterpolationTax(600_000_000)).toBe(6_000_000);
  });
});

// ============================================================
// 6~9억 선형보간 경계값 정밀 테스트
// ============================================================

describe("선형보간 경계값 — linearInterpolationRate & calcLinearInterpolationTax", () => {
  it("정확히 6억(600,000,000원): 선형보간 시작점, 세율 1%", () => {
    // linearInterpolationRate: <= 6억 → 0.01
    expect(linearInterpolationRate(600_000_000)).toBe(0.01);
    // calcLinearInterpolationTax: <= 6억 → floor(6억 × 0.01) = 6,000,000
    expect(calcLinearInterpolationTax(600_000_000)).toBe(6_000_000);
    // getBasicRate: 6억은 <= LOW이므로 기본세율 1%, 선형보간 아님
    const result = getBasicRate("housing", "purchase", 600_000_000);
    expect(result.rate).toBe(0.01);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("정확히 9억(900,000,000원): 선형보간 종료점, 세율 3%", () => {
    // linearInterpolationRate: >= 9억 → 0.03
    expect(linearInterpolationRate(900_000_000)).toBe(0.03);
    // calcLinearInterpolationTax: >= 9억 → floor(9억 × 0.03) = 27,000,000
    expect(calcLinearInterpolationTax(900_000_000)).toBe(27_000_000);
    // getBasicRate: 9억은 >= HIGH이므로 기본세율 3%, 선형보간 아님
    const result = getBasicRate("housing", "purchase", 900_000_000);
    expect(result.rate).toBe(0.03);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("6억 - 1원(599,999,999원): 선형보간 미적용, 기본세율 1%", () => {
    // linearInterpolationRate: <= 6억 → 0.01
    expect(linearInterpolationRate(599_999_999)).toBe(0.01);
    // calcLinearInterpolationTax: <= 6억 → floor(599,999,999 × 0.01) = 5,999,999
    expect(calcLinearInterpolationTax(599_999_999)).toBe(5_999_999);
    // getBasicRate: 599,999,999 <= LOW이므로 기본세율 1%, 선형보간 아님
    const result = getBasicRate("housing", "purchase", 599_999_999);
    expect(result.rate).toBe(0.01);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("9억 + 1원(900,000,001원): 선형보간 미적용, 3% 고정세율", () => {
    // linearInterpolationRate: >= 9억 → 0.03
    expect(linearInterpolationRate(900_000_001)).toBe(0.03);
    // calcLinearInterpolationTax: >= 9억 → floor(900,000,001 × 0.03) = 27,000,000
    expect(calcLinearInterpolationTax(900_000_001)).toBe(27_000_000);
    // getBasicRate: 900,000,001 >= HIGH이므로 기본세율 3%, 선형보간 아님
    const result = getBasicRate("housing", "purchase", 900_000_001);
    expect(result.rate).toBe(0.03);
    expect(result.isLinearInterpolation).toBe(false);
  });
});

// ============================================================
// getBasicRate — 물건 × 취득원인 세율 조합
// ============================================================

describe("getBasicRate — 상속", () => {
  it("주택 상속: 2.8%", () => {
    const { rate } = getBasicRate("housing", "inheritance", 300_000_000);
    expect(rate).toBe(0.028);
  });

  it("비주택 상속: 4%", () => {
    const { rate } = getBasicRate("land", "inheritance", 300_000_000);
    expect(rate).toBe(0.04);
  });

  it("농지 상속: 2.3%", () => {
    const { rate } = getBasicRate("land_farmland", "inheritance_farmland", 100_000_000);
    expect(rate).toBe(0.023);
  });
});

describe("getBasicRate — 증여·기부", () => {
  it("주택 증여: 3.5%", () => {
    const { rate } = getBasicRate("housing", "gift", 500_000_000);
    expect(rate).toBe(0.035);
  });

  it("토지 기부: 3.5%", () => {
    const { rate } = getBasicRate("land", "donation", 200_000_000);
    expect(rate).toBe(0.035);
  });
});

describe("getBasicRate — 원시취득", () => {
  it("신축: 2.8%", () => {
    const { rate } = getBasicRate("building", "new_construction", 200_000_000);
    expect(rate).toBe(0.028);
  });

  it("증축: 2.8%", () => {
    const { rate } = getBasicRate("housing", "extension", 50_000_000);
    expect(rate).toBe(0.028);
  });
});

describe("getBasicRate — 간주취득", () => {
  it("과점주주 간주취득: 2%", () => {
    const { rate } = getBasicRate("housing", "deemed_major_shareholder", 100_000_000);
    expect(rate).toBe(0.02);
  });

  it("지목변경: 2%", () => {
    const { rate } = getBasicRate("land", "deemed_land_category", 50_000_000);
    expect(rate).toBe(0.02);
  });
});

describe("getBasicRate — 주택 유상취득 선형보간", () => {
  it("6억 주택 매매: 1%, isLinearInterpolation=false", () => {
    const result = getBasicRate("housing", "purchase", 600_000_000);
    expect(result.rate).toBe(0.01);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("7억5천만 주택 매매: 선형보간, isLinearInterpolation=true", () => {
    const result = getBasicRate("housing", "purchase", 750_000_000);
    expect(result.isLinearInterpolation).toBe(true);
    expect(result.rate).toBeCloseTo(0.02, 5);
  });

  it("9억 초과 주택 매매: 3%, isLinearInterpolation=false", () => {
    const result = getBasicRate("housing", "purchase", 1_000_000_000);
    expect(result.rate).toBe(0.03);
    expect(result.isLinearInterpolation).toBe(false);
  });
});

describe("getBasicRate — 기타 물건 유상취득 4%", () => {
  it("토지: 4%", () => {
    expect(getBasicRate("land", "purchase", 200_000_000).rate).toBe(0.04);
  });

  it("농지: 3%", () => {
    expect(getBasicRate("land_farmland", "purchase", 200_000_000).rate).toBe(0.03);
  });

  it("차량: 4%", () => {
    expect(getBasicRate("vehicle", "purchase", 50_000_000).rate).toBe(0.04);
  });

  it("회원권: 4%", () => {
    expect(getBasicRate("membership", "purchase", 100_000_000).rate).toBe(0.04);
  });
});

// ============================================================
// calcRuralSpecialTax — 농어촌특별세
// ============================================================

describe("calcRuralSpecialTax", () => {
  it("주택 85㎡ 이하: 면제 (0원)", () => {
    const result = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.03,
      acquisitionTax: 15_000_000,
      propertyType: "housing",
      areaSqm: 85,
    });
    expect(result).toBe(0);
  });

  it("주택 84㎡: 면제 (0원)", () => {
    const result = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.03,
      acquisitionTax: 15_000_000,
      propertyType: "housing",
      areaSqm: 84,
    });
    expect(result).toBe(0);
  });

  it("주택 86㎡, 세율 3%: (3%-2%) × 5억 × 10% = 500,000원", () => {
    const result = calcRuralSpecialTax({
      taxBase: 500_000_000,
      appliedRate: 0.03,
      acquisitionTax: 15_000_000,
      propertyType: "housing",
      areaSqm: 86,
    });
    expect(result).toBe(500_000);
  });

  it("세율 2% 이하: 0원", () => {
    const result = calcRuralSpecialTax({
      taxBase: 300_000_000,
      appliedRate: 0.02,
      acquisitionTax: 6_000_000,
      propertyType: "housing",
      areaSqm: 100,
    });
    expect(result).toBe(0);
  });

  it("토지(면적 무관), 세율 4%: (4%-2%) × 2억 × 10% = 400,000원", () => {
    const result = calcRuralSpecialTax({
      taxBase: 200_000_000,
      appliedRate: 0.04,
      acquisitionTax: 8_000_000,
      propertyType: "land",
    });
    expect(result).toBe(400_000);
  });

  it("중과세율 12% 적용 시: (12%-2%) × 1억 × 10% = 1,000,000원", () => {
    const result = calcRuralSpecialTax({
      taxBase: 100_000_000,
      appliedRate: 0.12,
      acquisitionTax: 12_000_000,
      propertyType: "housing",
      areaSqm: 120,
    });
    expect(result).toBe(1_000_000);
  });

  it("부동소수점 오차 방지: (0.03-0.02) 계산 — bps 정수 연산으로 정확한 결과", () => {
    // 10억 × (3%-2%) × 10% = 1,000,000
    const result = calcRuralSpecialTax({
      taxBase: 1_000_000_000,
      appliedRate: 0.03,
      acquisitionTax: 30_000_000,
      propertyType: "land",
    });
    expect(result).toBe(1_000_000);
  });
});

// ============================================================
// calcLocalEducationTax — 지방교육세
// ============================================================

describe("calcLocalEducationTax", () => {
  it("과세표준 5억: 5억 × 2% × 20% = 2,000,000원", () => {
    expect(calcLocalEducationTax(500_000_000)).toBe(2_000_000);
  });

  it("과세표준 1억: 1억 × 0.02 × 0.20 = 400,000원", () => {
    expect(calcLocalEducationTax(100_000_000)).toBe(400_000);
  });

  it("과세표준 1,000원 (최소): Math.floor(1000 × 0.02 × 0.20) = 4원", () => {
    expect(calcLocalEducationTax(1_000)).toBe(4);
  });

  it("과세표준 0: 0원", () => {
    expect(calcLocalEducationTax(0)).toBe(0);
  });
});
