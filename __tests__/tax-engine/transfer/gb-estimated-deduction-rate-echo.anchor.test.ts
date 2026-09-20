/**
 * 일반건물 개산공제율 echo — 표시 산식이 표시된 값을 만들어내야 한다.
 * 계획서: docs/00-pm/transfer-review-4-defects.plan.md §10 F-18 · §28.
 *
 * §163⑥1호는 개산공제를 「취득당시 기준시가의 3/100」으로 하되, 단서로 **미등기양도자산은
 * 3/1000**으로 한다. 엔진은 `estimatedDeductionRate()` 단일 판정점을 경유해 이를 지킨다
 * (`general-building-valuation.ts` · `general-building-extension.ts` · 부담부증여 경로).
 *
 * 그런데 **표시 층 6곳이 율을 「3%」로 박아** 있었다. 미등기 자산에서는 적힌 산식이 적힌 값을
 * 만들어내지 못했다 — 세액은 맞고 검산만 10배 어긋난 것이다. 실측:
 *
 * | 입력 | base | 개산공제 | 종전 화면 산식 |
 * |---|---|---|---|
 * | 등기 | 238,000,000 | 7,140,000 | 238,000,000 × 3% ✅ |
 * | 토지 미등기 | 238,000,000 | **714,000** | 「238,000,000 × 3%」 → 7,140,000 ❌ |
 *
 * `GeneralBuildingEstimatedDeduction`에는 base echo(`landBase`·`buildingBase`)가 있었는데
 * **율 echo만 없었다** — 그 타입 주석이 `feedback_engine_result_display_drift`를 인용하면서도
 * 지분 축만 막고 율 축을 빠뜨린 것이다. 이 anchor가 율 echo를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { ESTIMATED_DEDUCTION_RATE } from "@/lib/tax-engine/legal-codes";

const BASE = {
  totalTransferPrice: 2_000_000_000,
  transferDate: new Date("2026-02-16"),
  acquisitionDate: new Date("1999-05-24"),
  landArea: 85,
  buildingArea: 180.96,
  buildingFootprintArea: 180.96,
  transferLandPricePerSqm: 10_830_000,
  transferBuildingStdPrice: 20_629_440,
  acquisitionLandPricePerSqm: 2_800_000,
  acquisitionBuildingStdPrice: 2_814_470,
  buildingAcquisitionCause: "purchase" as const,
  zoneType: "commercial",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (over: Record<string, unknown> = {}) => buildGeneralBuildingAssetCards({ ...BASE, ...over } as any);
const ded = (over: Record<string, unknown> = {}) => run(over).estimatedDeduction;

/** 「표시 산식이 표시된 값을 만든다」 — floor(base × rate) === 개산공제. */
const reproduces = (base: number | undefined, rate: number | undefined, value: number) =>
  Math.floor((base ?? 0) * (rate ?? 0)) === value;

describe("GB 개산공제율 echo — §163⑥1호 단서", () => {
  it("R-1 등기 자산은 3% — base × rate가 개산공제를 재현한다", () => {
    const d = ded();
    expect(d.landRate).toBe(ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);
    expect(d.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);
    expect(reproduces(d.landBase, d.landRate, d.land)).toBe(true);
    expect(reproduces(d.buildingBase, d.buildingRate, d.building)).toBe(true);
  });

  it("R-2 토지 미등기 — 토지만 0.3%, 건물은 3% 그대로", () => {
    const d = ded({ unregisteredLand: true });
    expect(d.landRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
    expect(d.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);
    // 종전에는 화면이 이 값을 「238,000,000 × 3%」라고 적었다(= 7,140,000, 10배).
    expect(d.land).toBe(714_000);
    expect(reproduces(d.landBase, d.landRate, d.land)).toBe(true);
  });

  it("R-3 건물 미등기 — 건물만 0.3%", () => {
    const d = ded({ unregisteredBuilding: true });
    expect(d.landRate).toBe(ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);
    expect(d.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
    expect(d.building).toBe(8_443);
    expect(reproduces(d.buildingBase, d.buildingRate, d.building)).toBe(true);
  });

  it("R-4 둘 다 미등기 — 두 축 모두 0.3%이고 산식이 값을 재현한다", () => {
    const d = ded({ unregisteredLand: true, unregisteredBuilding: true });
    expect(d.landRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
    expect(d.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
    expect(reproduces(d.landBase, d.landRate, d.land)).toBe(true);
    expect(reproduces(d.buildingBase, d.buildingRate, d.building)).toBe(true);
  });

  it("R-5 세액은 바뀌지 않는다 — 율 echo는 표시 축이다", () => {
    // 등기·미등기 각각의 개산공제 값 자체는 이 변경 전후로 같아야 한다(엔진은 원래 맞았다).
    expect(ded().land).toBe(7_140_000);
    expect(ded({ unregisteredLand: true }).land).toBe(714_000);
  });
});

describe("GB 증축 3-way 경로도 율을 echo한다", () => {
  const EXT = {
    extensionInfo: {
      extensionDate: new Date("2010-05-01"),
      extensionBuildingArea: 50,
      transferExtensionBuildingStdPrice: 5_000_000,
      acquisitionExtensionBuildingStdPrice: 1_000_000,
    },
  };

  it("R-6 증축분은 건물1과 같은 축이다 — 건물 미등기면 증축도 0.3%", () => {
    // 민법 §256 부합 · 표시변경등기 ⇒ 「그 자산 취득에 관한 등기」는 건물 1동 단위로 본다.
    const d = ded({ ...EXT, unregisteredBuilding: true });
    expect(d.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.UNREGISTERED);
    const reg = ded({ ...EXT });
    expect(reg.buildingRate).toBe(ESTIMATED_DEDUCTION_RATE.LAND_BUILDING);
  });
});
