/**
 * 건물 기준시가 계산기 — Pre-Do anchor
 *
 * 설계: docs/02-design/features/building-standard-price.engine.design.md
 * 목적: Do 진입 전 핵심 anchor를 손계산(PDF 2025 실측값)으로 확정 → 산식·1,000원 절사·잔가율·특수산식 검증.
 *
 * ✅ Phase A(데이터) + Phase B(엔진) 완료 → describe(.skip 제거)로 GREEN 검증.
 *   (데이터 레이어 검증은 data.test.ts에서 통과 — 88 anchor.)
 * structureKey는 STRUCTURE_META 키("rc" 등), usageNo는 listUsageOptions(year)의 번호(아파트=#1).
 */

import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";

describe("BSP Pre-Do anchor (PDF 2025 손계산) — Phase B 엔진", () => {
  // BSP-01: 상속·증여 일반(조정율 미적용)
  // 신축가격기준액 850,000(2025) × 구조 100(철근콘크리트 rc — 2025 구조지수표) × 용도 110(아파트 #1 — 2025 용도지수표)
  //   × 위치 132(공시지가 7,500,000원 → 2025 위치지수표 "7,000,000~8,000,000원 미만") × 잔가율 0.910(I그룹·경과5년)
  // = 1,234,200 × 0.910 = 1,123,122 → 1,000원 절사 = 1,123,000
  // 건물 기준시가 = 1,123,000 × 200㎡ = 224,600,000
  it("BSP-01 상증 일반: ㎡당 1,123,000 / 기준시가 224,600,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 200,
      builtYear: 2020,
      valuationYear: 2025,
      valuation: {
        structureKey: "rc", // 철근콘크리트조(2025 구조지수 100) — STRUCTURE_META 키
        usageNo: 1, // 아파트(2025 용도지수 110)
        landPricePerM2: 7_500_000, // 2025 위치지수 132
      },
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.pricePerM2).toBe(1_123_000);
    expect(r.valuation?.standardPrice).toBe(224_600_000);
  });

  // BSP-MECH: 기계식주차전용빌딩 특수산식 (2025 용도지수표 #61 — 실측 재확인)
  // 6,000,000 × 잔가율 0.850(내용연수 30년 그룹·경과5년 — 2025 잔가율표 III) × 주차대수 50 = 255,000,000
  // ⚠️ 단가·내용연수는 연도 가변(2001~02 #39 = 5,000,000원·내용연수 20년 — 실측). 과거 연도 케이스는 BSP-MECH-Y로 별도 anchor.
  it("BSP-MECH 기계식주차: 6,000,000 × 0.850 × 50 = 255,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 0, // 미사용
      builtYear: 2020,
      valuationYear: 2025,
      isMechanicalParking: true,
      parkingLotCount: 50,
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.standardPrice).toBe(255_000_000);
    expect(r.valuation?.mechDurableYears).toBe(30);
  });

  // BSP-MECH-Y: 기계식 연도 가변 — 2002년 #39 = 5,000,000원·내용연수 20년
  //   ★2002년 20년버킷 잔존율 0.20(연도별 잔가율표: 20년 2004년부터 0.10)·step0.04·경과4 → 0.840.
  // 5,000,000 × 잔가율 0.840(1−4×0.04) × 주차대수 10 = 42,000,000
  it("BSP-MECH-Y 기계식 연도가변(2002): 5,000,000 × 0.840 × 10 = 42,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 1998,
      valuationYear: 2002,
      isMechanicalParking: true,
      parkingLotCount: 10,
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.residualRate).toBe(0.84); // 2002 20년버킷 잔존율 0.20
    expect(r.valuation?.standardPrice).toBe(42_000_000);
    expect(r.valuation?.mechDurableYears).toBe(20);
  });

  // BSP-02: 상증 + 조정율 단일(II 최고층수 16층 아파트 → 지수 120 = 배율 1.20)
  // ㎡당 raw = 1,234,200 × 0.910 × 1.20 = 1,347,746.4 → 1,000원 절사 = 1,347,000
  // 기준시가 = 1,347,000 × 200㎡ = 269,400,000
  it("BSP-02 상증 조정율 단일(최고층수 16층 아파트 1.20): ㎡당 1,347,000 / 269,400,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 200,
      builtYear: 2020,
      valuationYear: 2025,
      isResidentialUse: true, // 주거용 — 연면적 조정 미적용
      isApartmentUse: true, // 아파트 — 최고층수 적용 대상
      valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
      specialFeatures: { maxFloors: 16 }, // 16층 → 120
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.adjustmentRate).toBeCloseTo(1.2, 10);
    expect(r.valuation?.pricePerM2).toBe(1_347_000);
    expect(r.valuation?.standardPrice).toBe(269_400_000);
  });

  // BSP-03: 상증 + 조정율 다구분 곱(II 최고층수 11층=110 · IV 상가1층=120 · V 1회개축=110 → 1.452)
  // (비주거 → 연면적 90도 II 후보지만 max=110 채택). built 2020 경과5 잔가율 0.910.
  // ㎡당 raw = 1,234,200 × 0.910 × 1.452 = 1,630,773.1 → 1,630,000 × 100㎡ = 163,000,000
  it("BSP-03 상증 조정율 다구분 곱(110×120×110/1e6=1.452): ㎡당 1,630,000 / 163,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 100,
      builtYear: 2020,
      valuationYear: 2025,
      isResidentialUse: false,
      valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
      specialFeatures: { maxFloors: 11, commercialFloor: 20, remodelCount: 26 },
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.adjustmentRate).toBeCloseTo(1.452, 10);
    expect(r.valuation?.pricePerM2).toBe(1_630_000);
    expect(r.valuation?.standardPrice).toBe(163_000_000);
  });

  // BSP-06: 양도 2시점 일반(취득 2015 / 양도 2025, 구조 rc·용도#1·built 2010·면적 100). 조정율 미적용.
  // 취득 2015: 650,000×100×110×125÷1e6=893,750 ×잔가0.900(★2015=era-B rc=Ⅱ(40년)·잔존율0.20·step0.02·경과5)
  //   =804,375→804,000 ×100=80,400,000  (★내용연수 "+10" 경계 2016 — 2015는 아직 era-B 40년버킷)
  // 양도 2025: 1,234,200 ×잔가0.730(2025년 잔존율 0.10·경과15)=900,966→900,000 ×100=90,000,000
  it("BSP-06 양도 2시점: 취득 80,400,000 / 양도 90,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2010,
      acquisitionYear: 2015,
      transferYear: 2025,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 5_000_000 }, // 2015 위치 125
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 }, // 2025 위치 132
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.acquisition?.residualRate).toBe(0.9); // 2015=era-B rc=Ⅱ(40년)·잔존율0.20·경과5
    expect(r.acquisition?.standardPrice).toBe(80_400_000);
    expect(r.transfer?.standardPrice).toBe(90_000_000);
    expect(r.acquisition?.appliedLandPriceYear).toBe(2015);
  });

  // BSP-07: 양도 취득시 2000.12.31 이전 → 산정기준율(소령 §164⑤). 취득 1995·built 1990·rc.
  // 2001지수표 ㎡당=400,000×100×100×105÷1e6=420,000 ×잔가0.78(★2001표 I=40년·step0.02·경과11)=327,600→327,000
  // 산정기준율 0.981(I·built1990·취득1995) → floor(327,000×100×0.981)=32,078,700
  it("BSP-07 산정기준율(취득 2000이전): 취득 32,078,700 · 율 0.981 (2001 잔가율표)", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 1990,
      acquisitionYear: 1995,
      transferYear: 2010,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 }, // 2001 위치 105
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 4_500_000 },
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.acquisition?.residualRate).toBe(0.78); // 2001 잔가율표 I그룹(40년) 경과11
    expect(r.acquisition?.standardPrice).toBe(32_078_700);
    expect(r.acquisition?.acqBaseRate).toBe(0.981);
    expect(r.acquisition?.appliedLandPriceYear).toBe(2001);
  });

  // BSP-08: §164⑧ 동일연도(2010) 제1산식. 전기 2009·built 2005·보유 6월/조정 12월.
  //   ★2010년 = era-B(rc 내용연수 40년·잔존율 0.20·step0.02). 경과 acq5/prev4.
  //   acq(2010)=683,100×0.900(1−5×0.02)=614,790→614,000×100=61,400,000
  //   prev(2009)=645,150×0.920(1−4×0.02)=593,538→593,000×100=59,300,000
  //   양도 = floor(61,400,000 + (61,400,000−59,300,000)×0.5) = 62,450,000
  it("BSP-08 §164⑧ 제1산식(동일연도): 취득 61,400,000 / 양도 62,450,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2005,
      acquisitionYear: 2010,
      transferYear: 2010,
      holdingMonths: 6,
      adjustMonths: 12,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 4_500_000 }, // 2010 위치 115
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 4_500_000 },
      prevLandPricePerM2: 4_000_000, // 2009 위치 115
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.acquisition?.residualRate).toBe(0.9); // 2010 era-B rc 40년·잔존율 0.20·경과5
    expect(r.acquisition?.standardPrice).toBe(61_400_000);
    expect(r.transfer?.standardPrice).toBe(62_450_000);
  });

  // BSP-14: §164⑧ 동일연도 제2산식(새 기준시가 고시 선택). newNotice 700,000원/㎡.
  //   acq(2010)=61,400,000(era-B, BSP-08과 동일). newStd = 700,000×100 = 70,000,000
  //   양도 = floor(61,400,000 + (70,000,000−61,400,000)×0.5) = 65,700,000
  it("BSP-14 §164⑧ 제2산식(동일연도): 양도 65,700,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "transfer",
      floorArea: 100,
      builtYear: 2005,
      acquisitionYear: 2010,
      transferYear: 2010,
      holdingMonths: 6,
      adjustMonths: 12,
      sameYearFormula: "new",
      newNoticePricePerM2: 700_000,
      acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 4_500_000 },
      transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 4_500_000 },
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(65_700_000);
  });
});
