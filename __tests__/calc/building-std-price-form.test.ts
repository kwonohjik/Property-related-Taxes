/**
 * 건물 기준시가 폼 변환·검증 (④ toEngineInput · ⑧ validate)
 *
 * 폼 상태 → 엔진 입력 → calcBuildingStandardPrice 결과가 엔진 anchor(BSP-01·06)와 일치하는지 검증.
 * 용도는 번호(usageNo) 기반. 독립 도구(API route 미사용).
 */
import { describe, it, expect } from "vitest";
import {
  initialBuildingStdPriceForm,
  toEngineInput,
  validateBuildingStdPriceForm,
  availableYears,
  type BuildingStdPriceFormState,
} from "../../lib/calc/building-std-price-form";
import { calcBuildingStandardPrice } from "../../lib/tax-engine/building-standard-price";

const form = (o: Partial<BuildingStdPriceFormState>): BuildingStdPriceFormState => ({
  ...initialBuildingStdPriceForm,
  ...o,
});

describe("building-std-price 폼 변환 (④) — 엔진 anchor 연동", () => {
  it("BSP-01 상증 폼 → 224,600,000 (엔진 anchor 일치)", () => {
    const f = form({
      taxType: "inheritance_gift",
      floorArea: "200",
      builtYear: "2020",
      valuationYear: "2025",
      valStructureKey: "rc",
      valUsageNo: "1",
      valLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.valuation?.pricePerM2).toBe(1_123_000);
    expect(r.valuation?.standardPrice).toBe(224_600_000);
  });

  it("BSP-06 양도 2시점 폼 → 취득 81,300,000 / 양도 90,000,000", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2010",
      acquisitionYear: "2015",
      transferYear: "2025",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "5,000,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "7,500,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.acquisition?.standardPrice).toBe(81_300_000);
    expect(r.transfer?.standardPrice).toBe(90_000_000);
  });

  it("기계식주차 폼 → 255,000,000", () => {
    const f = form({
      taxType: "inheritance_gift",
      isMechanicalParking: true,
      parkingLotCount: "50",
      builtYear: "2020",
      valuationYear: "2025",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.valuation?.standardPrice).toBe(255_000_000);
  });

  it("동일연도 §164⑧ 제1산식 폼 → 양도 63,250,000", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2005",
      acquisitionYear: "2010",
      transferYear: "2010",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "4,500,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "4,500,000",
      holdingMonths: "6",
      adjustMonths: "12",
      sameYearFormula: "prev",
      prevLandPrice: "4,000,000",
    });
    expect(validateBuildingStdPriceForm(f)).toBeNull();
    const r = calcBuildingStandardPrice(toEngineInput(f));
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(63_250_000);
  });
});

describe("building-std-price 검증 (⑧) — 미입력 차단", () => {
  it("연면적 미입력(일반) 차단", () => {
    const f = form({ taxType: "inheritance_gift", builtYear: "2020", valuationYear: "2025" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/연면적/);
  });
  it("기계식 주차대수 미입력 차단", () => {
    const f = form({ isMechanicalParking: true, builtYear: "2020", valuationYear: "2025", taxType: "inheritance_gift" });
    expect(validateBuildingStdPriceForm(f)).toMatch(/주차대수/);
  });
  it("공시지가 미입력 차단(상증)", () => {
    const f = form({
      taxType: "inheritance_gift",
      floorArea: "200",
      builtYear: "2020",
      valuationYear: "2025",
      valStructureKey: "rc",
      valUsageNo: "1",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/공시지가/);
  });
  it("동일연도 보유월수 미입력 차단", () => {
    const f = form({
      taxType: "transfer",
      floorArea: "100",
      builtYear: "2005",
      acquisitionYear: "2010",
      transferYear: "2010",
      acqStructureKey: "rc",
      acqUsageNo: "1",
      acqLandPrice: "4,500,000",
      transStructureKey: "rc",
      transUsageNo: "1",
      transLandPrice: "4,500,000",
      prevLandPrice: "4,000,000",
    });
    expect(validateBuildingStdPriceForm(f)).toMatch(/보유월수/);
  });
});

describe("building-std-price 연도 옵션 — 데이터 보유 교집합", () => {
  it("일반 모드: 위치지수 2026 부재 → 2026 제외(2025~2001)", () => {
    const ys = availableYears(false);
    expect(ys).toContain(2025);
    expect(ys).not.toContain(2026);
    expect(ys[ys.length - 1]).toBe(2001);
  });
  it("기계식 모드: 2026 포함(위치지수 불요)", () => {
    expect(availableYears(true)).toContain(2026);
  });
});
