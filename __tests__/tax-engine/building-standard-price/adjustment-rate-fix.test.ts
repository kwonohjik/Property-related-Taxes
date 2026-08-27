/**
 * 개별건물 특성 조정률 보완 — Pre-Do anchor (WS-1·WS-2·WS-5)
 *
 * 계획: docs/00-pm/building-std-price-adjustment-rate-fix.plan.md
 * A1(WS-2) 단일 상증 breakdown의 floorArea·adjustmentItems echo (현재 누락 → 실패 확보).
 * A2(WS-1) 미리보기 115.5% = max 규칙(연면적110×상가105) 산술 정상 (현재 통과 확인).
 * A3(WS-5) 통나무조(solid_wood)는 II 최고층수 적용 제외 (원본 비고) — 현재 미구현(130 적용) → 0.90 기대.
 */

import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "../../../lib/tax-engine/building-standard-price";
import { calcSpecialAdjustmentRate } from "../../../lib/tax-engine/building-standard-price-helpers";

describe("조정률 보완 anchor", () => {
  // A1: WS-2 — 단일(비복합) 상증 breakdown이 면적⑨·조정률(번호) echo를 노출해야 NTS 서식 칸이 채워진다.
  // 입력: rc·면적100·비주거 / II 11층(110·#6) · IV 상가1층(120·#20) · V 개축1회(110·#26).
  //   (연면적 100㎡=#9 90도 II 후보지만 max=110 채택 → 적용번호 6.)
  it("A1 WS-2: 단일 상증 valuation.floorArea·adjustmentItems echo", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 100,
      builtYear: 2020,
      valuationYear: 2025,
      isResidentialUse: false,
      valuation: { structureKey: "rc", usageNo: 1, landPricePerM2: 7_500_000 },
      specialFeatures: { maxFloors: 11, commercialFloor: 20, remodelCount: 26 },
    });
    expect(r.valuation?.floorArea).toBe(100);
    expect(r.valuation?.adjustmentItems?.map((x) => x.nos[0])).toEqual([6, 20, 26]);
    // 산식 회귀 가드(불변)
    expect(r.valuation?.standardPrice).toBe(163_000_000);
  });

  // A2: WS-1 — 115.5%는 II "가장 높은 지수 1개"(연면적 5천~1만㎡=110)가 최고층수4층(90)을 이긴 결과.
  // 비주거·floorArea 6,000㎡ → 연면적#11(110) / IV 상가2층#21(105) → 110×105/100² = 1.155.
  it("A2 WS-1: 연면적110 × 상가105 = 1.155 (max 규칙 정상)", () => {
    const rate = calcSpecialAdjustmentRate(
      { maxFloors: 4, commercialFloor: 21 },
      100, // 구조지수(지붕 무관 — rc 100)
      6_000, // 연면적 → 5천~1만㎡ 구간(110)
      { isResidential: false, isApartment: false },
    );
    expect(rate).toBeCloseTo(1.155, 10);
  });

  // A3: WS-5 — 통나무조(solid_wood)는 최고층수 적용 제외(원본 II 비고).
  // 비주거·면적100(연면적#9 90)·최고층수21(#8 130). 제외 후 II는 연면적90만 → 배율 0.90.
  // (구조지수 solid_wood=135 ≥100 → 지붕 미적용.)
  // ⚠️ 용도번호는 **비주거**여야 한다 — 주거용(#1~2)이면 「주거용건물은 아파트에 한해
  //    최고층수기준만」 단서로 구분 II 가 통째로 빠져 **통나무조 축 자체가 가려진다**(F-09).
  it("A3 WS-5: 통나무조 최고층수 제외 → 연면적90만 적용(0.90)", () => {
    const r = calcBuildingStandardPrice({
      taxType: "inheritance_gift",
      floorArea: 100,
      builtYear: 2020,
      valuationYear: 2025,
      isResidentialUse: false,
      valuation: { structureKey: "solid_wood", usageNo: 41, landPricePerM2: 152_000 },
      specialFeatures: { maxFloors: 21 },
    });
    expect(r.valuation?.adjustmentRate).toBeCloseTo(0.9, 10);
  });
});
