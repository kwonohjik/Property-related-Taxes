/**
 * 취득세 시가표준액 산정 단위 테스트
 *
 * acquisition-standard-price.ts — calcStandardPrice, shouldUseStandardPrice
 */

import { describe, it, expect } from "vitest";
import {
  calcStandardPrice,
  shouldUseStandardPrice,
} from "../../lib/tax-engine/acquisition-standard-price";

// ============================================================
// calcStandardPrice — 물건 유형별 산정
// ============================================================

describe("calcStandardPrice — 직접 입력값 우선", () => {
  it("standardValue 직접 입력: 그대로 반환", () => {
    const result = calcStandardPrice("housing", 500_000_000, undefined);
    expect(result.standardValue).toBe(500_000_000);
    expect(result.warnings).toHaveLength(0);
  });

  it("standardValue=0: 직접 입력 무시, standardPriceInput으로 계산 시도", () => {
    const result = calcStandardPrice("housing", 0, {
      propertyType: "housing",
      housingPublicPrice: 400_000_000,
    });
    // 0은 직접 입력 무시, housingPublicPrice 사용
    expect(result.standardValue).toBe(400_000_000);
  });
});

describe("calcStandardPrice — 주택 (주택공시가격)", () => {
  it("housingPublicPrice 입력: 그 값 반환", () => {
    const result = calcStandardPrice("housing", undefined, {
      propertyType: "housing",
      housingPublicPrice: 600_000_000,
    });
    expect(result.standardValue).toBe(600_000_000);
    expect(result.calculationBasis).toContain("주택공시가격");
  });

  it("housingPublicPrice 미입력: 0 반환 + 경고", () => {
    const result = calcStandardPrice("housing", undefined, {
      propertyType: "housing",
    });
    expect(result.standardValue).toBe(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

describe("calcStandardPrice — 토지 (개별공시지가 × 면적)", () => {
  it("개별공시지가 100,000원/㎡ × 200㎡ = 20,000,000원", () => {
    const result = calcStandardPrice("land", undefined, {
      propertyType: "land",
      individualLandPrice: 100_000,
      landArea: 200,
    });
    expect(result.standardValue).toBe(20_000_000);
    expect(result.calculationBasis).toContain("개별공시지가");
  });

  it("농지 동일 계산", () => {
    const result = calcStandardPrice("land_farmland", undefined, {
      propertyType: "land_farmland",
      individualLandPrice: 50_000,
      landArea: 500,
    });
    expect(result.standardValue).toBe(25_000_000);
  });

  it("면적 미입력: 0 + 경고", () => {
    const result = calcStandardPrice("land", undefined, {
      propertyType: "land",
      individualLandPrice: 100_000,
    });
    expect(result.standardValue).toBe(0);
    expect(result.warnings.some(w => w.includes("면적"))).toBe(true);
  });
});

describe("calcStandardPrice — 건물 비주거 (신축가격기준액 × 지수 × 잔가율 × 연면적)", () => {
  it("신축가격기준액 1,000,000원/㎡, RC구조(1.0), 경과연수 0, 연면적 500㎡ → 500,000,000", () => {
    const result = calcStandardPrice("building", undefined, {
      propertyType: "building",
      newBuildingBasePrice: 1_000_000,
      structureIndex: 1.0,
      usageIndex: 1.0,
      locationIndex: 1.0,
      elapsedYears: 0,
      floorArea: 500,
    });
    // 잔가율 = 1.000 (경과연수 0~1년, 지방세법 시행령 §4조의2)
    expect(result.standardValue).toBe(500_000_000);
  });

  it("경과연수 50년: 잔가율 35% (최저)", () => {
    const result = calcStandardPrice("building", undefined, {
      propertyType: "building",
      newBuildingBasePrice: 1_000_000,
      structureIndex: 1.0,
      usageIndex: 1.0,
      locationIndex: 1.0,
      elapsedYears: 50,
      floorArea: 100,
    });
    // 잔가율 = 0.350 (30년 이상 최저값, 지방세법 시행령 §4조의2)
    expect(result.standardValue).toBe(35_000_000);
  });

  it("경과연수 25년: 잔가율 44%", () => {
    const result = calcStandardPrice("building", undefined, {
      propertyType: "building",
      newBuildingBasePrice: 1_000_000,
      structureIndex: 1.0,
      usageIndex: 1.0,
      locationIndex: 1.0,
      elapsedYears: 25,
      floorArea: 100,
    });
    // 잔가율 = 0.540 - (25-20) × 0.020 = 0.540 - 0.100 = 0.440
    expect(result.standardValue).toBe(44_000_000);
  });
});

describe("calcStandardPrice — 기타 물건 (지자체 고시)", () => {
  it("차량: standardValue 직접 입력 없으면 경고", () => {
    const result = calcStandardPrice("vehicle", undefined, {
      propertyType: "vehicle",
    });
    expect(result.standardValue).toBe(0);
    expect(result.warnings.some(w => w.includes("직접 입력"))).toBe(true);
  });

  it("차량 + standardValue 입력: 그 값 반환", () => {
    const result = calcStandardPrice("vehicle", 30_000_000, undefined);
    expect(result.standardValue).toBe(30_000_000);
  });
});

// ============================================================
// shouldUseStandardPrice — 과세표준 결정 방식 판단
// ============================================================

describe("shouldUseStandardPrice", () => {
  it("유상취득 + 신고가 있음: 실거래가 사용", () => {
    const result = shouldUseStandardPrice("purchase", 500_000_000, undefined, 450_000_000);
    expect(result.useStandardPrice).toBe(false);
  });

  it("유상취득 + 신고가 없음: 시가표준액 사용", () => {
    const result = shouldUseStandardPrice("purchase", 0, undefined, 450_000_000);
    expect(result.useStandardPrice).toBe(true);
  });

  it("무상취득(상속) + 시가인정액 있음: 시가인정액 사용", () => {
    const result = shouldUseStandardPrice("inheritance", 0, 500_000_000, 450_000_000);
    expect(result.useStandardPrice).toBe(false);
  });

  it("무상취득(증여) + 시가인정액 없음: 시가표준액 사용", () => {
    const result = shouldUseStandardPrice("gift", 0, undefined, 450_000_000);
    expect(result.useStandardPrice).toBe(true);
  });

  it("농지 상속: 시가표준액 사용 (시가인정액 없음)", () => {
    const result = shouldUseStandardPrice("inheritance_farmland", 0, undefined, 100_000_000);
    expect(result.useStandardPrice).toBe(true);
  });
});
