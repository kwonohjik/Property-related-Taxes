/**
 * 건물 기준시가 — 국세청 공식 「2026년 건물 기준시가 계산방법 해설 — 계산사례」 anchor
 *
 * 출처: 국세청 계산사례 PDF(2026년 시행). 적용지수·㎡당가액·기준시가가 원 단위로 명시 → 강력한 anchor.
 * 엔진 calcBuildingStandardPrice가 공식 사례를 원 단위까지 재현하는지 검증.
 *
 * ★ PDF 오타 정정(검증으로 확인):
 *   - 직업훈련소 적용요령 신축가격기준액 "850,000"은 오타 — ㎡당 350,000은 860,000 기준(850,000이면 346,000).
 *   - 위치지수표 #18(160~200만) 이미지 "118"은 오타 — 단조증가 위반·사례 3건 모두 108.
 *   - 리모델링 본문 잔가율 "0.5428"은 오타 — 각주·결과(767,000)는 0.5248(신축 0.46 + 대수선할증 0.0648).
 */
import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
  type SpecialAdjustmentFeatures,
} from "../../../lib/tax-engine/building-standard-price";

interface NtsCase {
  name: string;
  structureKey: string;
  usageNo: number;
  builtYear: number;
  landPrice: number;
  floorArea: number;
  features?: SpecialAdjustmentFeatures;
  isResidential?: boolean;
  manualAdj?: number; // 양도 사례(조정률 미적용)는 생략, 조정률 직접 검증은 features
  pricePerM2: number;
  standardPrice: number;
}

// 단일 시점 일반 건물 13개 사례 (2026, 상증 모드. 양도 사례도 조정률 미적용 = 동일 산식)
const CASES: NtsCase[] = [
  { name: "목구조(근생)", structureKey: "wood_frame", usageNo: 41, builtYear: 2009, landPrice: 964_000, floorArea: 95, features: { maxFloors: 1 }, pricePerM2: 598_000, standardPrice: 56_810_000 },
  { name: "직업훈련소", structureKey: "cement_brick", usageNo: 33, builtYear: 1998, landPrice: 3_500_000, floorArea: 518.82, pricePerM2: 350_000, standardPrice: 181_587_000 },
  { name: "노인주거복지", structureKey: "rc", usageNo: 35, builtYear: 2004, landPrice: 1_115_000, floorArea: 850.72, pricePerM2: 459_000, standardPrice: 390_480_480 },
  { name: "경로당", structureKey: "rc", usageNo: 35, builtYear: 2004, landPrice: 1_450_000, floorArea: 75.3, features: { maxFloors: 1 }, pricePerM2: 421_000, standardPrice: 31_701_300 },
  { name: "유흥주점", structureKey: "light_steel_frame", usageNo: 15, builtYear: 2001, landPrice: 1_730_000, floorArea: 1200.34, pricePerM2: 238_000, standardPrice: 285_680_920 },
  { name: "자원순환", structureKey: "steel_frame", usageNo: 54, builtYear: 2009, landPrice: 47_300, floorArea: 660, pricePerM2: 343_000, standardPrice: 226_380_000 },
  { name: "창고", structureKey: "steel_frame", usageNo: 52, builtYear: 2005, landPrice: 859_000, floorArea: 432, features: { maxFloors: 1 }, pricePerM2: 296_000, standardPrice: 127_872_000 },
  { name: "단독주택(경량철골)", structureKey: "light_steel_frame", usageNo: 2, builtYear: 2003, landPrice: 960_700, floorArea: 265, features: { roofMaterial: 1, houseTypeTier: 16 }, isResidential: true, pricePerM2: 257_000, standardPrice: 68_105_000 },
  { name: "근생(라멘)", structureKey: "ramen", usageNo: 41, builtYear: 1996, landPrice: 2_177_000, floorArea: 65.42, features: {}, pricePerM2: 385_000, standardPrice: 25_186_700 },
  { name: "운동시설", structureKey: "rc", usageNo: 24, builtYear: 2015, landPrice: 1_123_000, floorArea: 1289.83, features: {}, pricePerM2: 896_000, standardPrice: 1_155_687_680 },
  { name: "동식물(철파이프)", structureKey: "steel_pipe", usageNo: 59, builtYear: 1995, landPrice: 165_000, floorArea: 137.15, features: { roofMaterial: 2, maxFloors: 1 }, pricePerM2: 18_000, standardPrice: 2_468_700 },
  { name: "판매시설", structureKey: "cement_brick", usageNo: 11, builtYear: 1962, landPrice: 1_922_000, floorArea: 138.15, pricePerM2: 79_000, standardPrice: 10_913_850 },
  { name: "공장(시멘트블록)", structureKey: "cement_block", usageNo: 48, builtYear: 1987, landPrice: 1_810_900, floorArea: 250, features: { roofMaterial: 2, maxFloors: 1 }, pricePerM2: 46_000, standardPrice: 11_500_000 },
];

describe("NTS 공식 계산사례 — 단일 시점 일반 건물 13건 (2026)", () => {
  for (const c of CASES) {
    it(`${c.name}: ㎡당 ${c.pricePerM2.toLocaleString()} / 기준시가 ${c.standardPrice.toLocaleString()}`, () => {
      const input: BuildingStandardPriceInput = {
        taxType: "inheritance_gift",
        floorArea: c.floorArea,
        builtYear: c.builtYear,
        valuationYear: 2026,
        valuation: { structureKey: c.structureKey, usageNo: c.usageNo, landPricePerM2: c.landPrice },
        isResidentialUse: c.isResidential,
        specialFeatures: c.features,
        manualAdjustmentRate: c.manualAdj,
      };
      const r = calcBuildingStandardPrice(input);
      expect(r.valuation?.pricePerM2).toBe(c.pricePerM2);
      expect(r.valuation?.standardPrice).toBe(c.standardPrice);
    });
  }
});

describe("NTS 공식 계산사례 — 리모델링(대수선) 잔가율 할증 (기타사례 가)", () => {
  // 통나무조 단독주택, 신축1996, 리모델링2008, 상속2026, 위치 0.90(15~18만), 면적342, 조정 1.40(단독331↑)
  // 리모델링 잔가율 = 신축 0.46 + 대수선할증 0.0648(=0.018×12×0.3) = 0.5248
  // ㎡당 767,000 / 기준시가 262,314,000 (PDF 본문 0.5428은 오타, 각주·결과는 0.5248)
  it("리모델링 잔가율 할증: 잔가율 0.5248 / ㎡당 767,000 / 기준시가 262,314,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 342,
      builtYear: 1996,
      remodelYear: 2008,
      valuationYear: 2026,
      valuation: { structureKey: "solid_wood", usageNo: 2, landPricePerM2: 152_000 },
      specialFeatures: { houseTypeTier: 17 }, // 단독주택 331㎡이상 → 140
      isResidentialUse: true,
    });
    expect(r.valuation?.residualRate).toBe(0.5248);
    expect(r.valuation?.adjustmentRate).toBeCloseTo(1.4, 10);
    expect(r.valuation?.pricePerM2).toBe(767_000);
    expect(r.valuation?.standardPrice).toBe(262_314_000);
  });

  // 리모델링 미적용(일반): 신축 잔가율 0.46 → ㎡당 672,000 / 229,824,000
  it("리모델링 없음(일반): ㎡당 672,000 / 기준시가 229,824,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 342,
      builtYear: 1996,
      valuationYear: 2026,
      valuation: { structureKey: "solid_wood", usageNo: 2, landPricePerM2: 152_000 },
      specialFeatures: { houseTypeTier: 17 },
      isResidentialUse: true,
    });
    expect(r.valuation?.residualRate).toBe(0.46);
    expect(r.valuation?.pricePerM2).toBe(672_000);
    expect(r.valuation?.standardPrice).toBe(229_824_000);
  });
});

describe("NTS 공식 계산사례 — 복합구조(층·구역별 구조 상이) (기타사례 나)", () => {
  // 1층 철근콘크리트조 공장 2,100㎡ + 2층 경량철골조 창고 1,300㎡, 위치 560,000(0.97), 신축 1998, 상속 2026
  // 1층: ㎡당 322,000 / 676,200,000 (잔가 0.496·조정 1.00) / 2층: 65,000 / 84,500,000 (잔가 0.16·조정 0.80)
  it("층별 다른 구조: 1층 676,200,000 + 2층 84,500,000 = 합계 760,700,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 1998,
      valuationYear: 2026,
      valuation: { structureKey: "rc", usageNo: 48, landPricePerM2: 560_000 },
      compositeParts: [
        { label: "1층 공장", structureKey: "rc", usageNo: 48, floorArea: 2100, adjustmentRate: 100 },
        { label: "2층 창고", structureKey: "light_steel_frame", usageNo: 48, floorArea: 1300, adjustmentRate: 80 },
      ],
    });
    expect(r.compositeBreakdowns?.[0].standardPrice).toBe(676_200_000);
    expect(r.compositeBreakdowns?.[0].pricePerM2).toBe(322_000);
    expect(r.compositeBreakdowns?.[1].standardPrice).toBe(84_500_000);
    expect(r.compositeBreakdowns?.[1].pricePerM2).toBe(65_000);
    expect(r.compositeTotal).toBe(760_700_000);
  });
});

describe("NTS 공식 계산사례 — 다필지 부속토지 위치지수 가중평균 (기타사례 다)", () => {
  // A 1,000㎡@2,500,000 + B 2,000㎡@3,000,000 + C 3,000㎡@1,500,000 → 가중평균 2,166,666 → 위치 #19=114
  // 1~5층 사무소 6,000㎡(조정 1.10) + 지하1층 주차장 2,000㎡(조정 0.60), rc, 신축 1997, 상속 2026
  // 사무소 592,000/3,552,000,000 + 주차장 323,000/646,000,000 = 4,198,000,000
  it("다필지 가중평균 + 복합용도: 위치지수 114 / 합계 4,198,000,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 1997,
      valuationYear: 2026,
      valuation: { structureKey: "rc", usageNo: 29, landPricePerM2: 0 },
      landParcels: [
        { areaM2: 1000, pricePerM2: 2_500_000 },
        { areaM2: 2000, pricePerM2: 3_000_000 },
        { areaM2: 3000, pricePerM2: 1_500_000 },
      ],
      compositeParts: [
        { label: "1~5층 사무소", structureKey: "rc", usageNo: 29, floorArea: 6000, adjustmentRate: 110 },
        { label: "지하1층 주차장", structureKey: "rc", usageNo: 29, floorArea: 2000, adjustmentRate: 60 },
      ],
    });
    expect(r.weightedLandPricePerM2).toBeCloseTo(2_166_666.67, 1);
    expect(r.compositeBreakdowns?.[0].locationIndex).toBe(114);
    expect(r.compositeBreakdowns?.[0].standardPrice).toBe(3_552_000_000);
    expect(r.compositeBreakdowns?.[1].standardPrice).toBe(646_000_000);
    expect(r.compositeTotal).toBe(4_198_000_000);
  });
});

describe("NTS 공식 계산사례 — 공용 부속시설 면적비율 안분 (안분계산 마)", () => {
  // rc, 1층 슈퍼 100㎡(근생#41·조정1.08·공용0.54) + 2~3층 주택 200㎡(단독#2·조정1.00·공용0.60)
  // 공용 90㎡(주차60+보일러30) → 면적비율 안분(슈퍼 30㎡·주택 60㎡). 위치 250만(#20=116)·신축2000·상속2026
  // 슈퍼 주용도 544,000/54,400,000 + 공용 272,000/8,160,000(30㎡) = 62,560,000
  // 주택 주용도 530,000/106,000,000 + 공용 318,000/19,080,000(60㎡) = 125,080,000 → 합계 187,640,000
  it("공용시설 면적비율 안분: 슈퍼 62,560,000 + 주택 125,080,000 = 187,640,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 2000,
      valuationYear: 2026,
      valuation: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
      sharedFacilityArea: 90,
      compositeParts: [
        { label: "1층 슈퍼", structureKey: "rc", usageNo: 41, floorArea: 100, adjustmentRate: 108, sharedAdjustmentRate: 54 },
        { label: "2~3층 주택", structureKey: "rc", usageNo: 2, floorArea: 200, adjustmentRate: 100, sharedAdjustmentRate: 60 },
      ],
    });
    const bd = r.compositeBreakdowns ?? [];
    expect(bd[0].standardPrice).toBe(54_400_000); // 슈퍼 주용도
    expect(bd[1].standardPrice).toBe(8_160_000); // 슈퍼 공용(30㎡)
    expect(bd[1].floorArea).toBe(30);
    expect(bd[2].standardPrice).toBe(106_000_000); // 주택 주용도
    expect(bd[3].standardPrice).toBe(19_080_000); // 주택 공용(60㎡)
    expect(bd[3].floorArea).toBe(60);
    expect(r.compositeTotal).toBe(187_640_000);
  });
});
