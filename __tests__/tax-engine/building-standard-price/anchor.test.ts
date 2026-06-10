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

  // BSP-MECH-Y: 기계식 연도 가변 — 2002년 #39 = 5,000,000원·내용연수 20년(IV그룹)
  // 5,000,000 × 잔가율 0.820(IV·경과4년: 1−4×0.045) × 주차대수 10 = 41,000,000
  it("BSP-MECH-Y 기계식 연도가변(2002): 5,000,000 × 0.820 × 10 = 41,000,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 0,
      builtYear: 1998,
      valuationYear: 2002,
      isMechanicalParking: true,
      parkingLotCount: 10,
    };
    const r = calcBuildingStandardPrice(input);
    expect(r.valuation?.standardPrice).toBe(41_000_000);
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
});
