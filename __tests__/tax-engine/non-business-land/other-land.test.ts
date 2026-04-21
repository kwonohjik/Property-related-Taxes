/**
 * Phase C-6 유닛 테스트 — other-land.ts (PDF p.1706~1707)
 */
import { describe, it, expect } from "vitest";
import {
  judgeOtherLand,
  isBareLand,
} from "@/lib/tax-engine/non-business-land/other-land";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);

function base(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "separate",
      hasBuilding: true,
      buildingFloorArea: 300,
      buildingStandardValue: 200_000_000,
      landStandardValue: 500_000_000,
      isRelatedToResidenceOrBusiness: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("C-6 기타토지 PDF p.1706 흐름도", () => {
  it("재산세 분리과세 + 기간기준 충족 → 사업용", () => {
    const r = judgeOtherLand(base(), DEFAULT_NON_BUSINESS_LAND_RULES);
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("separate");
  });

  it("종합합산 + 거주·사업관련 X → 비사업용", () => {
    const r = judgeOtherLand(
      base({
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 200_000_000,
          landStandardValue: 500_000_000,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
  });

  it("종합합산 + 거주·사업관련 O → 사업용", () => {
    const r = judgeOtherLand(
      base({
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 200_000_000,
          landStandardValue: 500_000_000,
          isRelatedToResidenceOrBusiness: true,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.reason).toContain("거주·사업관련");
  });

  it("나대지 간주 (건물 < 토지 × 2%) → 종합합산 취급", () => {
    expect(
      isBareLand(
        base({
          otherLand: {
            propertyTaxType: "separate",
            hasBuilding: true,
            buildingStandardValue: 9_000_000, // 1.8% ← 2% 미만
            landStandardValue: 500_000_000,
            isRelatedToResidenceOrBusiness: false,
          },
        }),
      ),
    ).toBe(true);
  });

  it("나대지 간주 경계 2% (10_000_000 / 500_000_000) → 비나대지 (>=2%)", () => {
    expect(
      isBareLand(
        base({
          otherLand: {
            propertyTaxType: "separate",
            hasBuilding: true,
            buildingStandardValue: 10_000_000, // 정확히 2%
            landStandardValue: 500_000_000,
            isRelatedToResidenceOrBusiness: false,
          },
        }),
      ),
    ).toBe(false);
  });

  it("나대지 간주 → 분리과세라도 종합합산으로 취급 + 거주사업관련 X → 비사업용", () => {
    const r = judgeOtherLand(
      base({
        otherLand: {
          propertyTaxType: "separate",
          hasBuilding: true,
          buildingStandardValue: 1_000_000,
          landStandardValue: 500_000_000,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.steps.some((s) => s.id === "other_bare_land" && s.status === "FAIL")).toBe(true);
  });
});
