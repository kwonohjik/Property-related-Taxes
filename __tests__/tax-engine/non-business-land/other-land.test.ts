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

  it("N2: 2% 미달 건물 + 거주사업관련X → 바닥면적분 별도합산 유지·잔여 비사업용 (§101①2호나목)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 5_000_000,
          landStandardValue: 1_000_000_000, // 2% = 20M, 건물 5M < 20M → 2% 미달
          buildingFloorArea: 200,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.8); // (1000-200)/1000
    expect(r.steps.some((s) => s.id === "other_footprint_carveout")).toBe(true);
  });

  it("N3: 2% 미달 + footprint 미입력 → 전량 비사업용 (자동안분 금지)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 5_000_000,
          landStandardValue: 1_000_000_000,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning).toBeUndefined();
    expect(r.steps.some((s) => s.id === "other_footprint_carveout")).toBe(false);
  });

  it("N4: 2% 이상 → 별도합산 사업용 (carve-out 미진입·회귀)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "separate",
          hasBuilding: true,
          buildingStandardValue: 25_000_000, // 2% = 20M, 25M ≥ 20M → 2% 이상
          landStandardValue: 1_000_000_000,
          buildingFloorArea: 200,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.some((s) => s.id === "other_footprint_carveout")).toBe(false);
  });

  it("N5: footprint ≥ landArea → 전량 별도합산 사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 200,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 5_000_000,
          landStandardValue: 500_000_000, // 2% = 10M, 5M < 10M → 2% 미달
          buildingFloorArea: 200,
          isRelatedToResidenceOrBusiness: false,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined();
    expect(r.steps.some((s) => s.id === "other_footprint_carveout")).toBe(true);
  });

  it("N7: 2% 미달 + 수입금액비율 PASS → 전량 사업용 (carve-out 미진입·불리적용 차단)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          buildingStandardValue: 5_000_000,
          landStandardValue: 1_000_000_000,
          buildingFloorArea: 200,
          isRelatedToResidenceOrBusiness: false,
        },
        revenueTest: {
          businessType: "parking_operation",
          currentRevenue: 50_000_000, // 5% ≥ 3% → PASS
          currentLandValue: 1_000_000_000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.some((s) => s.id === "other_footprint_carveout")).toBe(false);
  });

  it("M1: ⑥1호 복합용도(연면적비) → 특정용도분 부속토지만 사업용·잔여 비사업용 (mode 단독 isRelated 의제)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 2000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: false, // mode 단독으로 isRelated 의제 검증
          mixedUseBuildingMode: "single_building",
          specificUseFloorArea: 300,
          totalFloorArea: 1000, // 비율 0.3
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.businessArea).toBe(600); // 2000 × 0.3
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.7); // (2000-600)/2000
    expect(r.areaProportioning?.mixedUseBuildingRatio).toBe(0.3);
    expect(r.steps.some((s) => s.id === "other_mixed_use")).toBe(true);
  });

  it("M2: ⑥2호 다수 건축물(바닥면적비) → 특정용도분 부속토지만 사업용", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: true,
          mixedUseBuildingMode: "multiple_buildings",
          specificUseFootprint: 150,
          totalFootprint: 500, // 비율 0.3
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.7);
    expect(r.areaProportioning?.mixedUseBuildingRatio).toBe(0.3);
    expect(r.steps.some((s) => s.id === "other_mixed_use")).toBe(true);
  });

  it("M3: ⑥ 분자=분모(전부 특정용도) → 전량 사업용 buildPass", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: true,
          mixedUseBuildingMode: "single_building",
          specificUseFloorArea: 1000,
          totalFloorArea: 1000, // 비율 1.0
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.areaProportioning).toBeUndefined(); // 전량 사업용 → 안분 미노출
    expect(r.steps.some((s) => s.id === "other_mixed_use")).toBe(true);
  });

  it("M4: mode 미설정 → ⑥ 미진입(① 호별 경로 회귀)", () => {
    const r = judgeOtherLand(
      base({
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: true,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(true);
    expect(r.steps.some((s) => s.id === "other_mixed_use")).toBe(false);
  });

  // ── §168의11⑤ 연접 다필지 취득시기순 안분 (C+D) ──
  it("D1: ⑤1호 연접 다필지 — 취득시기 늦은 필지(B)에 초과분 귀속", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1200,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 1000, // S=1000
          parcels: [
            { id: "A", landArea: 800, acquisitionDate: d("2010-01-01"), hasBuilding: false },
            { id: "B", landArea: 400, acquisitionDate: d("2018-01-01"), hasBuilding: false },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.isBusiness).toBe(false);
    // T=1200, S=1000, E=200 → 늦은 B에 200 귀속. ratio=200/1200
    expect(r.areaProportioning?.nonBusinessRatio).toBeCloseTo(0.1667, 4);
    const detail = r.areaProportioning?.contiguousNblDetail;
    expect(detail?.find((p) => p.id === "B")?.nonBusinessArea).toBe(200);
    expect(detail?.find((p) => p.id === "A")?.nonBusinessArea).toBe(0);
    expect(r.steps.some((s) => s.id === "other_contiguous_nbl")).toBe(true);
  });

  it("D2: ⑤1호 잔액 흡수 — B 전체 + A 일부", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1200,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 600, // S=600 → E=600
          parcels: [
            { id: "A", landArea: 800, acquisitionDate: d("2010-01-01"), hasBuilding: false },
            { id: "B", landArea: 400, acquisitionDate: d("2018-01-01"), hasBuilding: false },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.5); // 600/1200
    const detail = r.areaProportioning?.contiguousNblDetail;
    expect(detail?.find((p) => p.id === "B")?.nonBusinessArea).toBe(400); // B 전체
    expect(detail?.find((p) => p.id === "A")?.nonBusinessArea).toBe(200); // A 200/800
  });

  it("D3: ⑤2호 — 건축물 바닥면적 제외 후보에 귀속", () => {
    const r = judgeOtherLand(
      base({
        landArea: 900,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 500, // S=500
          parcels: [
            { id: "A", landArea: 600, acquisitionDate: d("2010-01-01"), hasBuilding: true, buildingFootprintArea: 200 },
            { id: "B", landArea: 300, acquisitionDate: d("2018-01-01"), hasBuilding: true, buildingFootprintArea: 100 },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    // T=900, E=400. 후보 A=400·B=200(총600). 늦은 B(200) + A(200) 귀속. ratio=400/900
    expect(r.areaProportioning?.nonBusinessRatio).toBeCloseTo(0.4444, 4);
    const detail = r.areaProportioning?.contiguousNblDetail;
    expect(detail?.find((p) => p.id === "B")?.nonBusinessArea).toBe(200);
    expect(detail?.find((p) => p.id === "A")?.nonBusinessArea).toBe(200);
  });

  it("D4: ⑤2호 경계 클램프 — 초과분 > 후보합계 → 후보합계로 클램프 + 경고", () => {
    const r = judgeOtherLand(
      base({
        landArea: 900,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: true,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 100, // S=100 → E=800 > 후보합계 600
          parcels: [
            { id: "A", landArea: 600, acquisitionDate: d("2010-01-01"), hasBuilding: true, buildingFootprintArea: 200 },
            { id: "B", landArea: 300, acquisitionDate: d("2018-01-01"), hasBuilding: true, buildingFootprintArea: 100 },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.areaProportioning?.nonBusinessRatio).toBeCloseTo(0.6667, 4); // 600/900 (바닥면적 300은 사업용 유지)
    expect(r.warnings?.some((w) => w.includes("§168의11⑤"))).toBe(true);
  });

  it("D5: ⑤ 동일 취득시기 tie-break → 입력순(중립)", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1000,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 600, // S=600 → E=400
          parcels: [
            { id: "A", landArea: 500, acquisitionDate: d("2015-01-01"), hasBuilding: false },
            { id: "B", landArea: 500, acquisitionDate: d("2015-01-01"), hasBuilding: false },
          ],
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.areaProportioning?.nonBusinessRatio).toBe(0.4); // 400/1000
    const detail = r.areaProportioning?.contiguousNblDetail;
    // 동일 취득시기 → 입력순(A 먼저)에 귀속
    expect(detail?.find((p) => p.id === "A")?.nonBusinessArea).toBe(400);
    expect(detail?.find((p) => p.id === "B")?.nonBusinessArea).toBe(0);
  });

  it("D6: 회귀 — parcels 미제공 → 단일 필지 ① 호별 안분 경로", () => {
    const r = judgeOtherLand(
      base({
        landArea: 1500,
        otherLand: {
          propertyTaxType: "comprehensive",
          hasBuilding: false,
          isRelatedToResidenceOrBusiness: true,
          relatedBusinessType: "parking_attached",
          standardAreaLimit: 1000,
        },
      }),
      DEFAULT_NON_BUSINESS_LAND_RULES,
    );
    expect(r.areaProportioning?.nonBusinessRatio).toBeCloseTo(0.3333, 4); // 500/1500
    expect(r.areaProportioning?.contiguousNblDetail).toBeUndefined();
    expect(r.steps.some((s) => s.id === "other_contiguous_nbl")).toBe(false);
    expect(r.steps.some((s) => s.id === "other_area_limit")).toBe(true);
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
