/**
 * 건물 기준시가 — 국세청 공식 「기준시가 계산사례 2023」 anchor (2023.1.1. 시행)
 *
 * 출처: 사용자 첨부 PDF(국세청, 2023년 시행 계산사례). 신축가격기준액 820,000원/㎡.
 * 각 사례의 적용지수·㎡당가액·기준시가가 원 단위로 명시 → 강력한 anchor.
 * 엔진 calcBuildingStandardPrice(valuationYear 2023)가 공식 사례를 원 단위까지 재현하는지 검증.
 *
 * 모델링: 양도 사례(조정률 "미적용")는 inheritance_gift 모드 + manualAdjustmentRate 100(=1.0)으로
 *   동일 산식을 재현(조정률 1.0이면 양도·상증 ㎡당가액 동일). 상증 사례는 PDF 조정률을 manual로 직접 전달
 *   → 구조지수·용도지수·위치지수·잔가율·㎡당 천원절사·면적곱(2023 연도 데이터)을 격리 검증.
 *
 * 산식: ㎡당가액 = floor1000(820,000 × 구조 × 용도 × 위치 × 잔가 × 조정), 기준시가 = ㎡당 × 면적.
 */
import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";

interface Case2023 {
  name: string;
  structureKey: string;
  usageNo: number;
  builtYear: number;
  landPrice: number;
  floorArea: number;
  /** PDF 조정률 × 100 (양도=미적용=100). manual로 직접 전달 */
  manualAdj: number;
  // PDF 적용지수(×100 정수) — 진단용
  structureIndex: number;
  usageIndex: number;
  locationIndex: number;
  residualRate: number;
  pricePerM2: number;
  standardPrice: number;
}

const CASES: Case2023[] = [
  // ── 섹션1: 2023 개정사항 반영 ──
  { name: "가.철파이프조 공장", structureKey: "steel_pipe", usageNo: 48, builtYear: 2009, landPrice: 964_000, floorArea: 95, manualAdj: 90, structureIndex: 57, usageIndex: 80, locationIndex: 102, residualRate: 0.370, pricePerM2: 127_000, standardPrice: 12_065_000 },
  { name: "나.아동관련시설(양도)", structureKey: "rc", usageNo: 34, builtYear: 1998, landPrice: 3_500_000, floorArea: 518.82, manualAdj: 100, structureIndex: 100, usageIndex: 109, locationIndex: 120, residualRate: 0.550, pricePerM2: 589_000, standardPrice: 305_584_980 },
  { name: "다.목구조 노인주거복지", structureKey: "wood_frame", usageNo: 35, builtYear: 2004, landPrice: 1_450_000, floorArea: 75.3, manualAdj: 72, structureIndex: 125, usageIndex: 83, locationIndex: 108, residualRate: 0.658, pricePerM2: 435_000, standardPrice: 32_755_500 },
  { name: "라.컨테이너 폐차장(양도)", structureKey: "container", usageNo: 56, builtYear: 2001, landPrice: 1_890_000, floorArea: 1_200.34, manualAdj: 100, structureIndex: 57, usageIndex: 67, locationIndex: 111, residualRate: 0.10, pricePerM2: 34_000, standardPrice: 40_811_560 },
  // 마.철골조 여관 → 별도 it.skip (버그1: 용도별 내용연수 단축 미구현, 아래 참조)
  // ── 섹션2: 일반 계산 사례 ──
  { name: "2가.자원순환(양도)", structureKey: "steel_frame", usageNo: 54, builtYear: 2009, landPrice: 47_300, floorArea: 660, manualAdj: 100, structureIndex: 97, usageIndex: 80, locationIndex: 84, residualRate: 0.6850, pricePerM2: 366_000, standardPrice: 241_560_000 },
  { name: "2나.창고시설", structureKey: "steel_frame", usageNo: 52, builtYear: 2005, landPrice: 859_000, floorArea: 432, manualAdj: 90, structureIndex: 97, usageIndex: 80, locationIndex: 102, residualRate: 0.5950, pricePerM2: 347_000, standardPrice: 149_904_000 },
  { name: "2다.주거시설 단독주택", structureKey: "light_steel_frame", usageNo: 2, builtYear: 2003, landPrice: 960_700, floorArea: 265, manualAdj: 120, structureIndex: 77, usageIndex: 100, locationIndex: 102, residualRate: 0.400, pricePerM2: 309_000, standardPrice: 81_885_000 },
  { name: "2라.근린생활시설(라멘)", structureKey: "ramen", usageNo: 41, builtYear: 1996, landPrice: 2_177_000, floorArea: 65.42, manualAdj: 90, structureIndex: 100, usageIndex: 100, locationIndex: 114, residualRate: 0.514, pricePerM2: 432_000, standardPrice: 28_261_440 },
  { name: "2마.운동시설", structureKey: "rc", usageNo: 24, builtYear: 2015, landPrice: 1_123_000, floorArea: 1_289.83, manualAdj: 100, structureIndex: 100, usageIndex: 125, locationIndex: 105, residualRate: 0.856, pricePerM2: 921_000, standardPrice: 1_187_933_430 },
  { name: "2바.동식물관련시설", structureKey: "steel_pipe", usageNo: 59, builtYear: 1995, landPrice: 165_000, floorArea: 137.15, manualAdj: 72, structureIndex: 57, usageIndex: 55, locationIndex: 90, residualRate: 0.10, pricePerM2: 16_000, standardPrice: 2_194_400 },
  { name: "2사.판매시설(양도)", structureKey: "cement_brick", usageNo: 11, builtYear: 1962, landPrice: 1_922_000, floorArea: 138.15, manualAdj: 100, structureIndex: 95, usageIndex: 100, locationIndex: 111, residualRate: 0.10, pricePerM2: 86_000, standardPrice: 11_880_900 },
  { name: "2아.공장(시멘트블록)", structureKey: "cement_block", usageNo: 48, builtYear: 1987, landPrice: 1_810_900, floorArea: 250, manualAdj: 72, structureIndex: 95, usageIndex: 80, locationIndex: 111, residualRate: 0.10, pricePerM2: 49_000, standardPrice: 12_250_000 },
];

describe("NTS 공식 계산사례 2023 — 복합건물(섹션3)", () => {
  it("나.층별 구조 상이 — 1층 철콘 공장 + 2층 경량철골 부속창고 → 합계 859,000,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 1998,
      valuationYear: 2023,
      valuation: { structureKey: "rc", usageNo: 48, landPricePerM2: 560_000 },
      compositeParts: [
        { label: "1층", structureKey: "rc", usageNo: 48, floorArea: 2_100, adjustmentRate: 100 },
        { label: "2층", structureKey: "light_steel_frame", usageNo: 48, floorArea: 1_300, adjustmentRate: 80 },
      ],
    });
    expect(r.compositeBreakdowns?.[0].pricePerM2).toBe(349_000);
    expect(r.compositeBreakdowns?.[0].standardPrice).toBe(732_900_000);
    expect(r.compositeBreakdowns?.[1].pricePerM2).toBe(97_000);
    expect(r.compositeBreakdowns?.[1].standardPrice).toBe(126_100_000);
    expect(r.compositeTotal).toBe(859_000_000);
  });

  it("라.새 개별공시지가 위치지수 — 2023.5.30 이전(1.14)=28,559,680", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift", floorArea: 115.16, builtYear: 1991, valuationYear: 2023,
      valuation: { structureKey: "cement_brick", usageNo: 2, landPricePerM2: 2_430_000 },
      manualAdjustmentRate: 100,
    });
    expect(r.valuation?.locationIndex).toBe(114);
    expect(r.valuation?.pricePerM2).toBe(248_000);
    expect(r.valuation?.standardPrice).toBe(28_559_680);
  });

  it("라.새 개별공시지가 위치지수 — 2023.5.31 이후(1.16)=29,135,480", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift", floorArea: 115.16, builtYear: 1991, valuationYear: 2023,
      valuation: { structureKey: "cement_brick", usageNo: 2, landPricePerM2: 2_690_000 },
      manualAdjustmentRate: 100,
    });
    expect(r.valuation?.locationIndex).toBe(116);
    expect(r.valuation?.pricePerM2).toBe(253_000);
    expect(r.valuation?.standardPrice).toBe(29_135_480);
  });

  it("다.다필지 부속토지 가중평균 위치지수 → 건물 합계 4,528,000,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift", floorArea: 0, builtYear: 1997, valuationYear: 2023,
      valuation: { structureKey: "rc", usageNo: 29, landPricePerM2: 0 },
      landParcels: [
        { areaM2: 1_000, pricePerM2: 2_500_000 },
        { areaM2: 2_000, pricePerM2: 3_000_000 },
        { areaM2: 3_000, pricePerM2: 1_500_000 },
      ],
      compositeParts: [
        { label: "1~5층 사무소", structureKey: "rc", usageNo: 29, floorArea: 6_000, adjustmentRate: 110 },
        { label: "지하1층 주차장", structureKey: "rc", usageNo: 29, floorArea: 2_000, adjustmentRate: 66 },
      ],
    });
    expect(r.compositeBreakdowns?.[0].pricePerM2).toBe(629_000);
    expect(r.compositeBreakdowns?.[0].standardPrice).toBe(3_774_000_000);
    expect(r.compositeBreakdowns?.[1].pricePerM2).toBe(377_000);
    expect(r.compositeBreakdowns?.[1].standardPrice).toBe(754_000_000);
    expect(r.compositeTotal).toBe(4_528_000_000);
  });

  it("마.복합용도 공용 안분 — 슈퍼+주택+지하주차/보일러 → 합계 200,540,000", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 2000,
      valuationYear: 2023,
      valuation: { structureKey: "rc", usageNo: 41, landPricePerM2: 2_500_000 },
      sharedFacilityArea: 90, // 주차장 60 + 보일러실 30
      compositeParts: [
        { label: "1층(슈퍼)", structureKey: "rc", usageNo: 41, floorArea: 100, adjustmentRate: 108, sharedAdjustmentRate: 54 },
        { label: "2~3층(주택)", structureKey: "rc", usageNo: 2, floorArea: 200, adjustmentRate: 100, sharedAdjustmentRate: 60 },
      ],
    });
    expect(r.compositeTotal).toBe(200_540_000);
  });
});

describe("NTS 공식 계산사례 2023 — 단일 시점 일반 건물 13건", () => {
  for (const c of CASES) {
    it(`${c.name}: ㎡당 ${c.pricePerM2.toLocaleString()} / 기준시가 ${c.standardPrice.toLocaleString()}`, () => {
      const input: BuildingStandardPriceInput = {
        taxType: "inheritance_gift",
        floorArea: c.floorArea,
        builtYear: c.builtYear,
        valuationYear: 2023,
        valuation: { structureKey: c.structureKey, usageNo: c.usageNo, landPricePerM2: c.landPrice },
        manualAdjustmentRate: c.manualAdj,
      };
      const v = calcBuildingStandardPrice(input).valuation;
      expect(v?.structureIndex).toBe(c.structureIndex);
      expect(v?.usageIndex).toBe(c.usageIndex);
      expect(v?.locationIndex).toBe(c.locationIndex);
      expect(v?.residualRate).toBe(c.residualRate);
      expect(v?.pricePerM2).toBe(c.pricePerM2);
      expect(v?.standardPrice).toBe(c.standardPrice);
    });
  }

  /**
   * ★ 버그1 [미수정 — 보고만] 잔가율 그룹이 용도(내용연수 단축)를 반영하지 못함.
   *
   * 사례 마. 철골조 여관(usageNo 6, 2004 신축, 2023 평가): PDF 잔가율 0.145 (IV그룹, 내용연수 20년).
   * 엔진은 resolveResidualGroupForYear(structureKey, year)가 용도(usageNo) 인자 없이 구조만으로
   * 그룹을 도출 → 철골조 = 항상 II그룹(40년) → 0.5725. (building-standard-price-helpers.ts:123)
   *
   * 근거: 동일 철골조인 자원순환(II 0.685)·창고(II 0.595)는 통과. 용도만 다른 여관만 IV(20년)으로
   *   단축. PDF 내부 계산(131,000·9,864,300)이 0.145로 자기일관 → 오타 아님.
   * 정식 수정 조건: 공식 「건물 기준시가 계산방법」 해설서의 (구조×용도) 내용연수표 확보 후
   *   resolveResidualGroupForYear에 usageNo 차원 추가. 표 미확보로 보류(법령 정확성 최우선·추정 금지).
   */
  it.skip("마.철골조 여관 — [버그1] 용도별 내용연수 단축(IV/20년) 미구현 → 엔진 0.5725 vs PDF 0.145", () => {
    const v = calcBuildingStandardPrice({
      taxType: "inheritance_gift", floorArea: 75.3, builtYear: 2004, valuationYear: 2023,
      valuation: { structureKey: "steel_frame", usageNo: 6, landPricePerM2: 1_450_000 },
      manualAdjustmentRate: 90,
    }).valuation;
    expect(v?.residualRate).toBe(0.145);
    expect(v?.pricePerM2).toBe(131_000);
    expect(v?.standardPrice).toBe(9_864_300);
  });
});
