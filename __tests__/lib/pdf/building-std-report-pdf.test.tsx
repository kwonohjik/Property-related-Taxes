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
import {
  initialBuildingStdPriceForm,
  type BuildingStdPriceFormState,
} from "@/lib/calc/building-std-price-form";

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

/**
 * 시점 전용 스냅샷 — PDF 인스턴스 수가 **화면과 일치**해야 한다 (2026-07-30).
 *
 * PDF 어댑터에 시점 필터가 없던 동안, 단일 시점 모드 도입 이전에 저장된 스냅샷이 화면에서는 1벌인데
 * PDF에서는 취득+양도 2벌로 나왔다. 판정은 `snapshotKeyTimepoint` 단일 소스로 양쪽이 공유한다.
 * 화면 대응 anchor: __tests__/calc/building-std-report-phd-section.test.tsx S9.
 */
describe("건물 기준시가 계산서 PDF — 시점 전용 키 필터", () => {
  /** 단일 시점 모드 이전에 저장된 2시점 양도 스냅샷(singleTimePoint 없음) */
  const legacyTwoPoint = (): BuildingStdPriceFormState => ({
    ...initialBuildingStdPriceForm,
    taxType: "transfer",
    builtYear: "2010",
    floorArea: "200",
    acquisitionYear: "2015",
    acqStructureKey: "rc",
    acqUsageNo: "1",
    acqLandPrice: "5000000",
    transferYear: "2025",
    transStructureKey: "rc",
    transUsageNo: "1",
    transLandPrice: "7500000",
  });

  const marksFor = (key: string) =>
    buildBuildingStdReportsFromInput({
      assets: [{ assetId: "a1" }],
      buildingStdSnapshots: { [key]: legacyTwoPoint() },
    }).flatMap((m) => m.instances.map((i) => i.markCell));

  it("양도 전용 키(split-transfer·gb-transfer) → 양도 1벌", () => {
    expect(marksFor("bsp-a1-split-transfer")).toEqual(["transfer"]);
    expect(marksFor("bsp-a1-gb-transfer")).toEqual(["transfer"]);
  });

  it("취득 전용 키(split-acq·cbinh-acq·gb-acq) → 취득 1벌", () => {
    expect(marksFor("bsp-a1-split-acq")).toEqual(["acq2001"]);
    expect(marksFor("bsp-a1-cbinh-acq")).toEqual(["acq2001"]);
    expect(marksFor("bsp-a1-gb-acq")).toEqual(["acq2001"]);
  });

  // 겸용 상가 통합 모달은 한 폼에서 두 시점을 쓰므로 2벌이 정상
  it("2시점 키(mx-commercial) → 2벌 유지", () => {
    expect(marksFor("bsp-a1-mx-commercial")).toHaveLength(2);
  });

  /**
   * 🔴 배치(2시점 일괄)는 계산서를 **valuation(taxType=inheritance_gift) 스냅샷으로 재구성**한다.
   *    PDF 부제는 `MARK_LABEL[inst.markCell]`을 그대로 찍으므로, 양도 계산인데 **"상속"**으로
   *    나온다(화면도 같은 오표기였다 — 2026-08-11 브라우저 실측). 키의 시점으로 양도 맥락 부여.
   */
  it("🔴 재구성 valuation 스냅샷(-gb-acq·-gb-transfer) → 상속이 아니라 양도 맥락", () => {
    const valuationSnap = (year: string): BuildingStdPriceFormState => ({
      ...initialBuildingStdPriceForm,
      taxType: "inheritance_gift",
      inheritanceGiftKind: "inheritance",
      builtYear: "2010",
      floorArea: "200",
      valuationYear: year,
      valLandPrice: "5000000",
      valStructureKey: "rc",
      valUsageNo: "1",
      adjustmentMode: "manual",
    });
    const marks = buildBuildingStdReportsFromInput({
      assets: [{ assetId: "a1" }],
      buildingStdSnapshots: {
        "bsp-a1-gb-acq": valuationSnap("2015"),
        "bsp-a1-gb-transfer": valuationSnap("2025"),
      },
    }).flatMap((m) => m.instances.map((i) => i.markCell));
    expect([...marks].sort()).toEqual(["acq2001", "transfer"]);
  });

  it("상증 키(bsp-estate-*)는 상속 맥락 유지 — 회귀 방어", () => {
    const marks = buildBuildingStdReportsFromInput({
      estateItems: [{ id: "item-7" }],
      buildingStdSnapshots: {
        "bsp-estate-item-7": {
          ...initialBuildingStdPriceForm,
          taxType: "inheritance_gift",
          inheritanceGiftKind: "inheritance",
          builtYear: "2010",
          floorArea: "200",
          valuationYear: "2024",
          valLandPrice: "5000000",
          valStructureKey: "rc",
          valUsageNo: "1",
          adjustmentMode: "manual",
        },
      },
    }).flatMap((m) => m.instances.map((i) => i.markCell));
    expect(marks).toEqual(["inheritance"]);
  });

  // 단일 시점 모드 스냅샷은 엔진이 애초에 1벌만 낸다(필터 이전 단계에서 이미 해소)
  it("singleTimePoint 스냅샷 → 필터 없이도 1벌", () => {
    const marks = buildBuildingStdReportsFromInput({
      assets: [{ assetId: "a1" }],
      buildingStdSnapshots: {
        "bsp-a1-std": { ...legacyTwoPoint(), singleTimePoint: "transfer" },
      },
    }).flatMap((m) => m.instances.map((i) => i.markCell));
    expect(marks).toEqual(["transfer"]);
  });
});
