/**
 * 계산서 어댑터 — 엔진 result → NtsReportModel 매핑 검증(작성례 1~3).
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";
import type {
  BuildingStandardPriceInput,
  BuildingCompositePart,
} from "../../lib/tax-engine/types/building-standard-price.types";
import { buildNtsReportModel, type NtsReportContext } from "../../lib/calc/nts-report-adapter";

describe("nts-report-adapter — 작성례(3) 상속 복합", () => {
  const parts: BuildingCompositePart[] = [
    { label: "지상1", structureKey: "rc", usageNo: 41, floorArea: 100, adjustmentNos: [9, 20], sharedAdjustmentNos: [9, 24] },
    { label: "지상2", structureKey: "rc", usageNo: 2, floorArea: 100, sharedAdjustmentNos: [24] },
    { label: "지상3", structureKey: "rc", usageNo: 2, floorArea: 100, sharedAdjustmentNos: [24] },
  ];
  const input: BuildingStandardPriceInput = {
    taxType: "inheritance_gift",
    floorArea: 300,
    builtYear: 2000,
    valuationYear: 2023,
    valuation: { structureKey: "rc", usageNo: 2, landPricePerM2: 2_500_000 },
    compositeParts: parts,
    sharedFacilityArea: 90,
  };
  const ctx: NtsReportContext = {
    taxType: "inheritance_gift",
    inheritanceGiftKind: "inheritance",
    address: "종로구 ○○○",
    builtYear: 2000,
    floorsAbove: 3,
    floorsBelow: 1,
    landAreaM2: 130,
    valuation: { dateLabel: "2023.1.1", landPricePerM2: 2_500_000, year: 2023 },
  };

  it("1벌 instance — Ⅲ합·Ⅳ합·⑪·Ⅴ", () => {
    const m = buildNtsReportModel(ctx, calcBuildingStandardPrice(input));
    expect(m.instances).toHaveLength(1);
    const inst = m.instances[0];
    expect(inst.markCell).toBe("inheritance");
    expect(inst.mainTotal).toBe(171_500_000); // Ⅲ합
    expect(inst.ancillaryTotal).toBe(29_040_000); // Ⅳ합
    expect(inst.buildingTotal).toBe(200_540_000); // ⑪
    // Ⅱ: ⑤ = floor(130 × 2,500,000) = 325,000,000, ⑥ 위치지수 116
    expect(inst.landValue).toBe(325_000_000);
    expect(inst.locationIndex).toBe(116);
    expect(inst.residualGroup).toBe("I");
    expect(inst.durableYears).toBe(50);
    // Ⅲ 지상1: ⑧ 601,000, 조정률 번호 9·20
    const g1 = inst.mainRows.find((r) => r.floorLabel === "지상1")!;
    expect(g1.pricePerM2).toBe(601_000);
    expect(g1.adjustmentItems?.map((x) => x.nos[0])).toEqual([9, 20]);
    // Ⅳ 4행(주차×슈퍼는 9·24, 주택분은 24)
    expect(inst.ancillaryRows.length).toBeGreaterThanOrEqual(3);
    // Ⅴ
    expect(m.apportionment?.totalByKind.other).toBe(90);
  });
});

describe("nts-report-adapter — 작성례(1)(2) 양도 복합 세트", () => {
  const parts: BuildingCompositePart[] = [
    { label: "지상1", structureKey: "rc", usageNo: 41, acqUsageNo: 27, floorArea: 100 },
    { label: "지상2", structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 100 },
    { label: "지상3", structureKey: "rc", usageNo: 2, acqUsageNo: 1, floorArea: 100 },
  ];
  const input: BuildingStandardPriceInput = {
    taxType: "transfer",
    floorArea: 300,
    builtYear: 2000,
    transferYear: 2023,
    acquisitionYear: 2000,
    transfer: { structureKey: "", usageNo: 0, landPricePerM2: 2_500_000 },
    acquisition: { structureKey: "", usageNo: 0, landPricePerM2: 2_240_000 },
    compositeParts: parts,
    sharedFacilityArea: 90,
  };
  const ctx: NtsReportContext = {
    taxType: "transfer",
    address: "종로구 ○○○",
    builtYear: 2000,
    landAreaM2: 130,
    transfer: { dateLabel: "2023.1.1", landPricePerM2: 2_500_000, year: 2023 },
    acquisition: { dateLabel: "2000.2.1", landPricePerM2: 2_240_000, year: 2000 },
  };

  it("2벌 instance — 양도당시 217,230,000 / 취득당시 154,960,000 + ※", () => {
    const m = buildNtsReportModel(ctx, calcBuildingStandardPrice(input));
    expect(m.instances).toHaveLength(2);
    const [t, a] = m.instances;
    expect(t.markCell).toBe("transfer");
    expect(t.buildingTotal).toBe(217_230_000);
    expect(t.landValue).toBe(325_000_000); // 130 × 2,500,000
    expect(a.markCell).toBe("acq2000");
    expect(a.buildingTotal).toBe(154_960_000);
    expect(a.acqNoteLabel).toBe("2001.1.1 건물 기준시가");
    // ※ 환산
    expect(a.acqBase?.rate).toBe(1.016);
    expect(a.acqBase?.converted).toBe(157_439_360);
  });
});

describe("nts-report-adapter — 단일 건물(비복합)", () => {
  it("Ⅲ 1행·Ⅳ 없음 (BSP-01 224,600,000)", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 200,
      builtYear: 2020,
      valuationYear: 2025,
      valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
    });
    const m = buildNtsReportModel(
      { taxType: "inheritance_gift", builtYear: 2020, landAreaM2: 100, valuation: { dateLabel: "2025년", landPricePerM2: 7_500_000, year: 2025 } },
      r,
    );
    const inst = m.instances[0];
    expect(inst.mainRows).toHaveLength(1);
    expect(inst.ancillaryRows).toHaveLength(0);
    expect(inst.buildingTotal).toBe(224_600_000);
    expect(inst.dateLabel).toBe("2025년");
  });
});
