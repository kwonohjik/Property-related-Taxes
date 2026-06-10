/**
 * 건물 기준시가 계산기 — Pre-Do anchor
 *
 * 설계: docs/02-design/features/building-standard-price.engine.design.md
 * 목적: Do 진입 전 핵심 anchor를 손계산(PDF 2025 실측값)으로 확정 → 산식·1,000원 절사·잔가율·특수산식 검증.
 *
 * ⚠️ Phase A(데이터) 완료. 엔진(calcBuildingStandardPrice)은 **Phase B 미구현**(stub throw) →
 *   describe.skip으로 보류. **Phase B 엔진 구현 시 .skip 제거**하여 GREEN 전환 검증.
 *   (데이터 레이어 검증은 data.test.ts에서 통과 — 48 anchor.)
 * structureKey/usageKey 문자열은 Phase A 데이터 전사에서 확정된 키 사용.
 */

import { describe, it, expect } from "vitest";
import {
  calcBuildingStandardPrice,
  type BuildingStandardPriceInput,
} from "../../../lib/tax-engine/building-standard-price";

// Phase B 엔진 구현 시 describe.skip → describe 로 변경
describe.skip("BSP Pre-Do anchor (PDF 2025 손계산) — Phase B 엔진 대기", () => {
  // BSP-01: 상속·증여 일반(조정율 미적용)
  // 신축가격기준액 850,000(2025) × 구조 100(철근콘크리트 — 2025 구조지수표 #4행) × 용도 110(아파트 — 2025 용도지수표 #1)
  //   × 위치 132(공시지가 7,500,000원 → 2025 위치지수표 #28 "7,000,000~8,000,000원 미만") × 잔가율 0.910(I그룹·경과5년 — 2025 잔가율표 신축 2020)
  // = 1,234,200 × 0.910 = 1,123,122 → 1,000원 절사 = 1,123,000
  // 건물 기준시가 = 1,123,000 × 200㎡ = 224,600,000
  // ※ 재검토(2026-06-10) PDF 실측으로 4개 지수·잔가율 모두 재확인 완료.
  it("BSP-01 상증 일반: ㎡당 1,123,000 / 기준시가 224,600,000", () => {
    const input: BuildingStandardPriceInput = {
      taxType: "inheritance_gift",
      floorArea: 200,
      builtYear: 2020,
      valuationYear: 2025,
      valuation: {
        structureKey: "reinforced_concrete", // 철근콘크리트조(2025 구조지수 100) — 키는 Phase A 확정
        usageKey: "apartment", // 아파트(2025 용도지수 110)
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
  });
});
