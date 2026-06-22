/**
 * @vitest-environment jsdom
 *
 * 「건물 기준시가 계산서」 서버 PDF anchor (WS-3 서버 PDF 채널)
 *
 * - 렌더러가 실제 엔진 모델로 throw 없이 react-pdf 트리 구성
 * - 선택 게이트("building-std-report" 미선택 시 null) · 빈 모델 null
 * - 어댑터 빈 입력 graceful
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { buildNtsReportModel, type NtsReportContext } from "@/lib/calc/nts-report-adapter";
import { BuildingStdReportPdfPages } from "@/lib/pdf/BuildingStdReportPdfPages";
import { buildBuildingStdReportsFromInput } from "@/lib/calc/building-std-pdf-data";

// 실제 엔진 결과 → 계산서 모델 (anchor BSP-03 유형: 조정률 다구분 + 면적⑨)
const result = calcBuildingStandardPrice({
  taxType: "inheritance_gift",
  floorArea: 100,
  builtYear: 2020,
  valuationYear: 2025,
  isResidentialUse: false,
  valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
  specialFeatures: { maxFloors: 11, commercialFloor: 20, remodelCount: 26 },
});
const ctx: NtsReportContext = {
  taxType: "inheritance_gift",
  inheritanceGiftKind: "inheritance",
  address: "서울 강남구 …",
  builtYear: 2020,
  floorsAbove: 5,
  floorsBelow: 1,
  landAreaM2: 300,
  valuation: { dateLabel: "2025.1.1", landPricePerM2: 7_500_000, year: 2025 },
};
const model = buildNtsReportModel(ctx, result);

describe("건물 기준시가 계산서 서버 PDF", () => {
  it("모델 instance가 생성되고 floorArea·adjustmentItems echo 포함 (WS-2 연계)", () => {
    expect(model.instances.length).toBeGreaterThan(0);
    const row = model.instances[0].mainRows[0];
    expect(row.floorArea).toBe(100);
    expect(row.adjustmentItems && row.adjustmentItems.length).toBeGreaterThan(0);
  });

  it("렌더러가 실제 모델로 throw 없이 트리 구성", () => {
    expect(() => {
      const tree = BuildingStdReportPdfPages({
        models: [model],
        selectedSectionIds: ["building-std-report"],
      });
      expect(tree).toBeTruthy();
    }).not.toThrow();
  });

  it("미선택 시 null (선택 게이트)", () => {
    expect(
      BuildingStdReportPdfPages({ models: [model], selectedSectionIds: ["tax-summary"] }),
    ).toBeNull();
  });

  it("빈 모델 시 null", () => {
    expect(BuildingStdReportPdfPages({ models: [], selectedSectionIds: undefined })).toBeNull();
  });

  it("어댑터 — 빈/누락 입력 graceful 빈 배열", () => {
    expect(buildBuildingStdReportsFromInput(undefined)).toEqual([]);
    expect(buildBuildingStdReportsFromInput({})).toEqual([]);
    expect(buildBuildingStdReportsFromInput({ buildingStdSnapshots: {} })).toEqual([]);
  });
});
