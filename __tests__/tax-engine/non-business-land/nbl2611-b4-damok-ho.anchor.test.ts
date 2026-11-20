/**
 * NBL2611-B4 (R09 · R10) Pre-Do anchor — 다목 호별 정밀화.
 *   V7-E     보전녹지에서 호별 기준면적 배율이 사라진다 → 정본 `getZoneAreaMultiplier`로 일원화
 *   V7-DM02  5호 예비군훈련장 「도시지역 주·상·공 지역 밖」(영 §168의11①5호 나목) 미검사
 *   V9-DM11  13호 무주택 1세대 나지를 건축물 있는 토지에 골라도 660㎡까지 사업용(「나지」 요건 미검사)
 *   V9-DM09  6호 휴양시설 기준면적을 요소별 «상한»의 합으로 계산 → 규칙 §83의4⑫2·3호는 «상한 이내 실제 면적»
 *
 * 판정·비율로 단언한다(모의 세율 금액은 비교 대상이 아니다).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { judgeNonBusinessLand } from "@/lib/tax-engine/non-business-land/engine";
import { judgeOtherLand } from "@/lib/tax-engine/non-business-land/other-land";
import { resolveAreaLimit } from "@/lib/tax-engine/non-business-land/other-land-area-limit";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";
import type { NonBusinessLandInput, ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError } from "@/lib/tax-engine/tax-errors";

const R = DEFAULT_NON_BUSINESS_LAND_RULES;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
type OL = NonNullable<NonBusinessLandInput["otherLand"]>;

function sample(ol: Partial<OL>, over: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "other_land",
    landArea: 1000,
    zoneType: "management",
    acquisitionDate: d("2014-01-01"),
    transferDate: d("2024-01-01"),
    otherLand: {
      propertyTaxType: "comprehensive",
      hasBuilding: false,
      isRelatedToResidenceOrBusiness: false,
      ...ol,
    },
    businessUsePeriods: [],
    gracePeriods: [],
    ...over,
  } as NonBusinessLandInput;
}

describe("V7-E — 보전녹지 호별 기준면적 배율", () => {
  it("E-1: 6호 건축물 부속토지 바닥 100㎡ · 실제 900㎡ — 보전녹지도 녹지와 같은 7배(상한 700㎡)", () => {
    const green = resolveAreaLimit({ propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, relatedBusinessType: "resort", resortBuildingFloorArea: 100, resortBuildingAttachedArea: 900 }, "green");
    const cons = resolveAreaLimit({ propertyTaxType: "comprehensive", hasBuilding: false, isRelatedToResidenceOrBusiness: false, relatedBusinessType: "resort", resortBuildingFloorArea: 100, resortBuildingAttachedArea: 900 }, "conservation_green");
    expect(green).toBe(700);
    expect(cons).toBe(green);
  });

  it("E-2: 체육(별표3) 실내 수영 바닥 100㎡ — 보전녹지 7배 → 700㎡, 판정 비율이 녹지와 같다", () => {
    const ol = { relatedBusinessType: "sports" as const, sportsCategory: "workplace" as const, sportsFacilityType: "swimming" as const, indoorFloorArea: 100 };
    const green = judgeNonBusinessLand(sample(ol, { zoneType: "green", landArea: 1000 }), R);
    const cons = judgeNonBusinessLand(sample(ol, { zoneType: "conservation_green", landArea: 1000 }), R);
    expect(green.areaProportioning?.businessArea).toBe(700); // min(100, 1000) × 7
    expect(cons.areaProportioning?.businessArea).toBe(700);
    expect(cons.surcharge.nonBusinessAreaRatio).toBe(green.surcharge.nonBusinessAreaRatio);
  });
});

describe("V7-DM02 — 5호 예비군훈련장 나목(도시지역 주·상·공 지역 밖)", () => {
  const reserve: Partial<OL> = { relatedBusinessType: "reserve_forces", reserveForcesUnitSize: "le800", reserveForcesFacilities: ["tactical"] }; // 기준 15,000㎡

  it.each(["residential", "exclusive_residential", "general_residential", "semi_residential", "commercial", "industrial"] as ZoneType[])(
    "D2-1: 도시지역 %s 안 → 5호 불인정 — 전량 비사업용",
    (zone) => {
      const j = judgeNonBusinessLand(sample(reserve, { zoneType: zone, landArea: 10000 }), R);
      expect(j.isNonBusinessLand).toBe(true);
      expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
    },
  );

  it.each(["green", "conservation_green", "management", "agriculture_forest", "natural_env", "unplanned", "undesignated"] as ZoneType[])(
    "D2-2: %s(주·상·공 밖) → 5호 인정 — 기준면적 이내 전량 사업용",
    (zone) => {
      const j = judgeNonBusinessLand(sample(reserve, { zoneType: zone, landArea: 10000 }), R);
      expect(j.isNonBusinessLand).toBe(false);
    },
  );

  it("D2-3: 불인정 사유가 단계에 남는다 — 영 §168의11①5호 나목", () => {
    const r = judgeOtherLand(sample(reserve, { zoneType: "commercial", landArea: 10000 }), R);
    const step = r.steps.find((s) => s.id === "other_ho_reserve_zone");
    expect(step?.status).toBe("FAIL");
    expect(step?.detail).toContain("나목");
  });

  it("D2-4: 인정되는 경우 자기 선언 요건(가·다·라목)은 확인 필요로 남긴다", () => {
    const r = judgeOtherLand(sample(reserve, { zoneType: "management", landArea: 10000 }), R);
    expect((r.warnings ?? []).some((w) => w.includes("확인 필요") && w.includes("예비군"))).toBe(true);
  });
});

describe("V9-DM11 — 13호 무주택 1세대 나지는 건축물이 없어야 한다", () => {
  const vacant: Partial<OL> = { relatedBusinessType: "vacant_lot_1household" };

  it("D11-1: 🔴 건축물 있는 토지 600㎡ — 13호 불인정(나지 아님) → 전량 비사업용", () => {
    const j = judgeNonBusinessLand(
      sample({ ...vacant, hasBuilding: true, buildingFloorArea: 50, buildingStandardValue: 100_000_000, landStandardValue: 1_000_000_000 }, { landArea: 600 }),
      R,
    );
    expect(j.isNonBusinessLand).toBe(true);
    expect(j.surcharge.nonBusinessAreaRatio).toBe(1);
  });

  it("D11-2: 건축물 없는 나지 600㎡ — 13호 인정(660㎡ 이내 전량 사업용) + 자기 선언 요건 고지", () => {
    const j = judgeNonBusinessLand(sample(vacant, { landArea: 600 }), R);
    expect(j.isNonBusinessLand).toBe(false);
    const r = judgeOtherLand(sample(vacant, { landArea: 600 }), R);
    expect((r.warnings ?? []).some((w) => w.includes("확인 필요") && w.includes("무주택"))).toBe(true);
  });

  it("D11-3: 건축물 없는 나지 800㎡ — 660㎡까지 사업용(초과 140㎡ 비사업용) 기존 동작 유지", () => {
    const j = judgeNonBusinessLand(sample(vacant, { landArea: 800 }), R);
    expect(j.areaProportioning?.businessArea).toBe(660);
    expect(j.areaProportioning?.nonBusinessArea).toBe(140);
  });

  it("D11-4: 사유가 단계에 남는다", () => {
    const r = judgeOtherLand(
      sample({ ...vacant, hasBuilding: true, buildingStandardValue: 100_000_000, landStandardValue: 1_000_000_000 }, { landArea: 600 }),
      R,
    );
    const step = r.steps.find((s) => s.id === "other_ho_vacant_lot_not_bare");
    expect(step?.status).toBe("FAIL");
  });
});

describe("V9-DM09 — 6호 휴양시설 기준면적 = 상한 이내 «실제» 면적의 합", () => {
  const resortBase: Partial<OL> = { relatedBusinessType: "resort" };

  it("D9-1: 🔴 옥외 5,000 + 주차장 실제 500(상한 2×1,000) + 건축물 부속 실제 300(상한 100×7) → 기준 5,800 (종전 7,700)", () => {
    const ol: Partial<OL> = { ...resortBase, resortOutdoorArea: 5000, resortParkingStdArea: 1000, resortParkingActualArea: 500, resortBuildingFloorArea: 100, resortBuildingAttachedArea: 300 };
    expect(resolveAreaLimit(ol as OL, "green")).toBe(5800);
    const j = judgeNonBusinessLand(sample(ol, { zoneType: "green", landArea: 7000 }), R);
    expect(j.areaProportioning?.businessArea).toBe(5800);
    expect(j.areaProportioning?.nonBusinessArea).toBe(1200);
    expect(j.isNonBusinessLand).toBe(true);
  });

  it("D9-2: 실제 면적이 상한을 넘으면 상한까지만 — 주차장 실제 3,000(상한 2,000) · 건축물 실제 900(상한 700)", () => {
    const ol: Partial<OL> = { ...resortBase, resortParkingStdArea: 1000, resortParkingActualArea: 3000, resortBuildingFloorArea: 100, resortBuildingAttachedArea: 900 };
    expect(resolveAreaLimit(ol as OL, "green")).toBe(2700); // 2,000 + 700
  });

  it("D9-3: 실제 면적이 상한 이내면 실제 값 그대로(주차장 실제 1,500 → 1,500)", () => {
    const ol: Partial<OL> = { ...resortBase, resortParkingStdArea: 1000, resortParkingActualArea: 1500 };
    expect(resolveAreaLimit(ol as OL, "green")).toBe(1500);
  });

  it("D9-4: 건축물 바닥면적 + 용도지역 미매핑(residential) → 부속토지 직접입력(사용자 확정값) 그대로 — 기존 직접입력 경로 유지", () => {
    const ol: Partial<OL> = { ...resortBase, resortBuildingFloorArea: 1000, resortBuildingAttachedArea: 3000 };
    expect(resolveAreaLimit(ol as OL, "residential")).toBe(3000);
  });

  it("D9-5: 3요소 미입력 + 직접입력(standardAreaLimit) 유지", () => {
    expect(resolveAreaLimit({ ...resortBase, standardAreaLimit: 8000 } as OL, "green")).toBe(8000);
  });

  it("D9-6: 엔진 거부 — 주차장 설치기준면적만 있고 실제 면적이 없으면 던진다(자동 fallback 금지)", () => {
    const ol: Partial<OL> = { ...resortBase, resortParkingStdArea: 1000 };
    expect(() => resolveAreaLimit(ol as OL, "green")).toThrow(TaxCalculationError);
  });

  it("D9-7: 엔진 거부 — 바닥면적(배율 매핑 용도지역)만 있고 건축물 부속토지 실제 면적이 없으면 던진다", () => {
    const ol: Partial<OL> = { ...resortBase, resortBuildingFloorArea: 100 };
    expect(() => resolveAreaLimit(ol as OL, "green")).toThrow(TaxCalculationError);
  });

  it("D9-8: 엔진 거부 — 주차장 실제 면적만 있고 설치기준면적(상한 근거)이 없으면 던진다", () => {
    const ol: Partial<OL> = { ...resortBase, resortParkingActualArea: 500 };
    expect(() => resolveAreaLimit(ol as OL, "green")).toThrow(TaxCalculationError);
  });
});

describe("V7-E 재발 방지 — 원시 배율 맵 직접 인덱싱 금지", () => {
  it("S-1: non-business-land/ 소스는 배율표를 `[...]`로 직접 읽지 않는다(정본 `getZoneAreaMultiplier`만)", () => {
    const dir = join(process.cwd(), "lib/tax-engine/non-business-land");
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith(".ts"))
      .filter((f) => /LOCAL_TAX_ZONE_AREA_MULTIPLIER(_CANON)?\[|ZONE_AREA_MULTIPLIER\[/.test(readFileSync(join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
