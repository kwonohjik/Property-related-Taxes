/**
 * Phase C-4 유닛 테스트 — housing-land.ts (PDF p.1704, §168-12)
 */
import { describe, it, expect } from "vitest";
import { judgeHousingLand } from "@/lib/tax-engine/non-business-land/housing-land";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "housing_site",
    landArea: 300,
    zoneType: "general_residential",
    acquisitionDate: d("2015-01-01"),
    transferDate: d("2024-01-01"),
    housingFootprint: 100,
    isMetropolitanArea: true,
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-4 주택부수토지 §168-12 배율", () => {
  it("수도권 일반주거 3배 이내 (100㎡×3=300) → 전체 사업용", () => {
    const r = judgeHousingLand(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.buildingMultiplier).toBe(3);
  });

  it("수도권 일반주거 3배 초과 → 초과분 비사업용", () => {
    const r = judgeHousingLand(base({ landArea: 400 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessArea).toBe(100);
  });

  it("수도권 녹지 5배 (100㎡×5=500)", () => {
    const r = judgeHousingLand(
      base({ zoneType: "green", landArea: 500 }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.buildingMultiplier).toBe(5);
  });

  it("수도권 밖 도시지역 5배", () => {
    const r = judgeHousingLand(
      base({ isMetropolitanArea: false, landArea: 500 }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.buildingMultiplier).toBe(5);
  });

  it("도시지역 外 10배 (100㎡×10=1000)", () => {
    const r = judgeHousingLand(
      base({
        zoneType: "management",
        isMetropolitanArea: false,
        landArea: 1000,
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning?.buildingMultiplier).toBe(10);
  });

  it("정착면적 0 → 실패", () => {
    const r = judgeHousingLand(base({ housingFootprint: 0 }), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(false);
    expect(r.reason).toContain("정착면적");
  });
});
