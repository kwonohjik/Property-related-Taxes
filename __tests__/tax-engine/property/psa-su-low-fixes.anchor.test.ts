/**
 * PSA-SU 누적 Low 3건 anchor — 엔진 쪽 (세액 불변).
 *   L-1 `propertyLandSplitRequiredFor`의 catch — 필지 판정이 던지면 «요구 없음»이 아니라 두 합산 칸을 모두 요구한다(Step 3 요구가 조용히 사라지지 않는다).
 *   L-2 분리과세 공장용지 `factoryLocation === "urban"` ∧ 허가·사용승인 미이행 — «별도합산으로 바꾸라» 구 안내가 아니라 «종합합산» 안내(§101① 단서가 별도합산도 제외).
 *   L-3 바닥면적 ≤ 0 — Zod `Too small`과 «건물 바닥면적(㎡)을 입력하세요.»가 겹쳐 나오지 않고 ⑧과 같은 한 문구.
 */
import { describe, it, expect } from "vitest";
import { propertyLandSplitRequiredFor } from "../../../lib/tax-engine/property-land-split-tax";
import { isSeparateAggregateLand } from "../../../lib/tax-engine/separate-aggregate-land";
import type { SeparateAggregateLandItem } from "../../../lib/tax-engine/separate-aggregate-land";
import { calculateSeparateTax } from "../../../lib/tax-engine/separate-taxation";
import { PROPERTY_SEPARATE } from "../../../lib/tax-engine/legal-codes";
import { PROPERTY_BUILDING_AREA_ISSUE_MESSAGE } from "../../../lib/tax-engine/property-separate-requirements";
import { propertyTaxInputSchema } from "../../../lib/validators/property-input";

const land = (over: Record<string, unknown>): SeparateAggregateLandItem & { taxBaseDate: string } =>
  ({ id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000, taxBaseDate: "2026-06-01", ...over }) as never;
const required = (item: Record<string, unknown>) =>
  propertyLandSplitRequiredFor({ landTaxType: "separate_aggregate", separateAggregateItem: land(item), targetDate: "2026-06-01" });

describe("L-1 propertyLandSplitRequiredFor — catch가 요구를 조용히 지우지 않는다", () => {
  it("판정이 던지는 입력(허가 «예» + 미등재 용도지역 + 바닥면적) → 두 합산 칸 모두 요구 · 던지는 입력이라는 전제를 먼저 확인", () => {
    const bad = { buildingPermit: "yes", zoningDistrict: "xxx", buildingFloorArea: 100 };
    expect(() => isSeparateAggregateLand(land(bad))).toThrow();
    expect(required(bad)).toEqual({ otherSeparate: true, otherComprehensive: true });
  });

  it("허가 «예» + 용도지역 없음 + 바닥면적(던짐) → 두 칸 요구", () => {
    expect(required({ buildingPermit: "yes", buildingFloorArea: 100 })).toEqual({ otherSeparate: true, otherComprehensive: true });
  });

  it("정상 입력은 그대로 — 상업 300㎡ 안(별도합산만) / 허가 «아니오»(종합합산만)", () => {
    expect(required({ buildingPermit: "yes", zoningDistrict: "commercial", buildingFloorArea: 100 })).toEqual({ otherSeparate: true, otherComprehensive: false });
    expect(required({ buildingPermit: "no" })).toEqual({ otherSeparate: false, otherComprehensive: true });
  });
});

describe("L-2 분리과세 공장용지 — 도시지역 그 밖 ∧ 허가 미이행: 종합합산 안내", () => {
  const urban = (over: Record<string, unknown>) => calculateSeparateTax({ assessedValue: 100_000_000, isFactoryLand: true, factoryLocation: "urban", ...over } as never);

  it("urban + 허가 미이행 → 분리과세 비해당 · 경고는 «종합합산» + §101① 단서 · «별도합산으로 바꾸어» 구 안내 없음", () => {
    const r = urban({ factoryIsUnpermitted: true });
    expect(r.isApplicable).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain("종합합산과세대상으로 판정하세요");
    expect(r.warnings[0]).toContain(PROPERTY_SEPARATE.BUILDING_PERMIT_101);
    expect(r.warnings[0]).not.toContain("별도합산으로 바꾸어");
  });

  it("urban + 허가 이행 → 종전 안내 그대로(별도합산으로 바꾸어 입력) — 허가 미이행 칸을 안 켠 경우 불변", () => {
    for (const over of [{}, { factoryIsUnpermitted: false }]) {
      const r = urban(over);
      expect(r.isApplicable).toBe(false);
      expect(r.warnings[0]).toContain("별도합산으로 바꾸어");
      expect(r.warnings[0]).not.toContain("종합합산과세대상으로 판정하세요");
    }
  });
});

describe("L-3 바닥면적 ≤ 0 — 문구 하나(⑧과 같은 문구)", () => {
  const body = (floor: number, permit = "yes") => ({
    objectType: "land",
    landTaxType: "separate_aggregate",
    publishedPrice: 300_000_000,
    otherSeparateAggregateValue: 0,
    otherComprehensiveValue: 0,
    separateAggregateItem: { id: "p", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000, zoningDistrict: "commercial", buildingFloorArea: floor, buildingPermit: permit },
  });
  const floorMessages = (b: Record<string, unknown>) => {
    const r = propertyTaxInputSchema.safeParse(b);
    return r.success ? [] : r.error.issues.filter((i) => i.path.join(".") === "separateAggregateItem.buildingFloorArea").map((i) => i.message);
  };

  it("음수·0 → «건물 바닥면적(㎡)을 입력하세요.» 한 건뿐 (Too small 겹침 없음)", () => {
    for (const floor of [-5, 0]) {
      expect(floorMessages(body(floor)), `floor=${floor}`).toEqual([PROPERTY_BUILDING_AREA_ISSUE_MESSAGE.buildingFloorArea]);
    }
  });

  it("양수는 통과 · 허가 «아니오»(바닥면적을 읽지 않음)면 값이 있어도 요구하지 않는다", () => {
    expect(floorMessages(body(100))).toEqual([]);
    expect(floorMessages(body(-5, "no"))).toEqual([]);
  });
});
