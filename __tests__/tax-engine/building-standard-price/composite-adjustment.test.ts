/**
 * Pre-Do anchor — 복합구조 조정률 건물특성 자동계산 (상증)
 *
 * 설계: docs/02-design/features/building-std-price-composite-adjustment.engine.design.md §5
 * 목적: Do 진입 전 ① 건물전체(II)+부분(IV) 특성 자동 산정 ② features==manual 등가 ③ 양도 차단 ④ 수동 우선.
 *
 * ⚠️ Pre-Do — 미구현 상태에서 실패 확보 후 구현. "현행 일치 예상" 단정 금지.
 *
 * 케이스(상증 2023, 복합 2부분, 부속 없음 → breakdowns=[main1, main2]):
 *  - 건물전체: maxFloors 12 → II no6(110). 비주거. 연면적 합 1400㎡ → II 연면적 no10(100) → max=110.
 *  - Part1: rc(구조지수100), 700㎡, 부분특성 IV 상가1층 no20(120) → 110×120/100²=1.32, items [6,20].
 *  - Part2: rc, 700㎡, 부분특성 없음 → 110/100=1.10, items [6].
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "../../../lib/tax-engine/building-standard-price";
import type {
  BuildingStandardPriceInput,
  BuildingCompositePart,
} from "../../../lib/tax-engine/types/building-standard-price.types";

const LAND_PRICE = 2_500_000;

/** features 모드 — 건물전체 specialFeatures(maxFloors) + 부분 specialFeatures(commercialFloor) */
const featuresInput = (): BuildingStandardPriceInput => ({
  taxType: "inheritance_gift",
  floorArea: 0, // 복합은 부분 면적 합으로 II 연면적 자동(엔진 buildingTotalArea) — building-level floorArea 비의존 검증
  builtYear: 2000,
  valuationYear: 2023,
  valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: LAND_PRICE },
  isResidentialUse: false,
  specialFeatures: { maxFloors: 12 }, // 건물 전체 (II)
  compositeParts: [
    { label: "지상1", structureKey: "rc", usageNo: 41, floorArea: 700, specialFeatures: { commercialFloor: 20 } },
    { label: "지상2", structureKey: "rc", usageNo: 2, floorArea: 700 },
  ] as BuildingCompositePart[],
});

/** manual 모드 — 등가 환산(part1 1.32 / part2 1.10) */
const manualInput = (): BuildingStandardPriceInput => ({
  taxType: "inheritance_gift",
  floorArea: 0,
  builtYear: 2000,
  valuationYear: 2023,
  valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: LAND_PRICE },
  compositeParts: [
    { label: "지상1", structureKey: "rc", usageNo: 41, floorArea: 700, adjustmentRate: 132 },
    { label: "지상2", structureKey: "rc", usageNo: 2, floorArea: 700, adjustmentRate: 110 },
  ] as BuildingCompositePart[],
});

describe("복합구조 조정률 건물특성 자동계산 — Pre-Do anchor", () => {
  it("A-1: 부분별 조정률 = 1.32 / 1.10, items [6,20] / [6]", () => {
    const r = calcBuildingStandardPrice(featuresInput());
    const bds = r.compositeBreakdowns!;
    expect(bds).toHaveLength(2);

    expect(bds[0].adjustmentRate).toBeCloseTo(1.32, 6);
    expect(bds[0].adjustmentItems).toEqual([
      { nos: [6], rate: 110 },
      { nos: [20], rate: 120 },
    ]);

    expect(bds[1].adjustmentRate).toBeCloseTo(1.1, 6);
    expect(bds[1].adjustmentItems).toEqual([{ nos: [6], rate: 110 }]);
  });

  it("A-2: features 총액 == 등가 manual(132/110) 총액", () => {
    const f = calcBuildingStandardPrice(featuresInput());
    const m = calcBuildingStandardPrice(manualInput());
    expect(f.compositeTotal).toBe(m.compositeTotal);
    expect(f.compositeBreakdowns![0].standardPrice).toBe(m.compositeBreakdowns![0].standardPrice);
    expect(f.compositeBreakdowns![1].standardPrice).toBe(m.compositeBreakdowns![1].standardPrice);
  });

  it("A-3: 양도 복합 + 건물특성 입력 → 차단(throw)", () => {
    const transferWithBuildingFeatures: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 0,
      builtYear: 2000,
      acquisitionYear: 2010,
      transferYear: 2023,
      acquisition: { structureKey: "", usageNo: 0, landPricePerM2: LAND_PRICE },
      transfer: { structureKey: "", usageNo: 0, landPricePerM2: LAND_PRICE },
      specialFeatures: { maxFloors: 12 },
      compositeParts: [
        { structureKey: "rc", usageNo: 41, acqUsageNo: 27, floorArea: 700 },
        { structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 700 },
      ],
    };
    expect(() => calcBuildingStandardPrice(transferWithBuildingFeatures)).toThrow();

    const transferPartFeatures: BuildingStandardPriceInput = {
      ...transferWithBuildingFeatures,
      specialFeatures: undefined,
      compositeParts: [
        { structureKey: "rc", usageNo: 41, acqUsageNo: 27, floorArea: 700, specialFeatures: { commercialFloor: 20 } },
        { structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 700 },
      ] as BuildingCompositePart[],
    };
    expect(() => calcBuildingStandardPrice(transferPartFeatures)).toThrow();
  });

  it("A-4: 부분 수동(adjustmentRate) + specialFeatures 동시 → 수동 우선", () => {
    const input = featuresInput();
    // part1에 수동 200% 추가 → 특성(1.32) 무시하고 2.0 적용
    input.compositeParts![0] = {
      ...input.compositeParts![0],
      adjustmentRate: 200,
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.compositeBreakdowns![0].adjustmentRate).toBeCloseTo(2.0, 6);
    // items는 수동 % 경로 → undefined(번호 echo 없음)
    expect(r.compositeBreakdowns![0].adjustmentItems).toBeUndefined();
  });
});
