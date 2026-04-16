/**
 * 재산세 주택 범위 판정 테스트 (P2-13~16)
 *
 * T01: 겸용주택 — 주거 > 비주거 → 전체 주택 (full_house)
 * T02: 겸용주택 — 주거 ≤ 비주거 → 주거 부분만 (partial_house)
 * T03: 겸용주택 — 주거 0 → 주택 아님 (not_house)
 * T04: 부속토지 도시지역 한도 (5배) 이내 → 초과 없음
 * T05: 부속토지 도시지역 한도 초과 → 종합합산 전환
 * T06: 부속토지 비도시지역 한도 (10배)
 * T07: 오피스텔 주거용 등록 → house
 * T08: 오피스텔 업무용 → building
 * T09: calculateHouseScope — 겸용+부속토지 통합
 * T10: calculateHouseScope — 오피스텔 업무용 → isHouse=false
 */

import { describe, it, expect } from "vitest";
import {
  classifyMixedUseBuilding,
  handleExcessAttachedLand,
  classifyOfficetel,
  calculateHouseScope,
} from "../../lib/tax-engine/property-house-scope";
import type { HouseInput } from "../../lib/tax-engine/types/property-object.types";

const BASE_HOUSE: HouseInput = {
  buildingFloorArea: 100,
  attachedLandArea: 200,
  isUrbanArea: true,
};

// ============================================================
// classifyMixedUseBuilding
// ============================================================

describe("classifyMixedUseBuilding — 겸용주택 판정", () => {
  it("T01: 주거(80) > 비주거(20) → full_house, housePortion=1", () => {
    const result = classifyMixedUseBuilding({
      residentialArea: 80,
      nonResidentialArea: 20,
    });
    expect(result.classification).toBe("full_house");
    expect(result.housePortion).toBe(1);
  });

  it("T02: 주거(40) ≤ 비주거(60) → partial_house, housePortion=0.4", () => {
    const result = classifyMixedUseBuilding({
      residentialArea: 40,
      nonResidentialArea: 60,
    });
    expect(result.classification).toBe("partial_house");
    expect(result.housePortion).toBeCloseTo(40 / 100);
  });

  it("T02-a: 주거(50) = 비주거(50) → partial_house (≤이므로)", () => {
    const result = classifyMixedUseBuilding({
      residentialArea: 50,
      nonResidentialArea: 50,
    });
    expect(result.classification).toBe("partial_house");
    expect(result.housePortion).toBeCloseTo(0.5);
  });

  it("T03: 주거 0 → not_house, housePortion=0", () => {
    const result = classifyMixedUseBuilding({
      residentialArea: 0,
      nonResidentialArea: 100,
    });
    expect(result.classification).toBe("not_house");
    expect(result.housePortion).toBe(0);
  });
});

// ============================================================
// handleExcessAttachedLand
// ============================================================

describe("handleExcessAttachedLand — 부속토지 한도", () => {
  it("T04: 도시지역 5배 한도 이내 (건물 100m², 토지 500m²) → 초과 없음", () => {
    const result = handleExcessAttachedLand({
      buildingFloorArea: 100,
      attachedLandArea: 500,
      isUrbanArea: true,
    });
    // 도시지역 한도 = 100 × 5 = 500m² (지방세법 시행령 §105①1호)
    expect(result.attachedLandArea).toBe(500);
    expect(result.excessLandArea).toBe(0);
    expect(result.multiplier).toBe(5);
  });

  it("T05: 도시지역 한도 초과 (건물 100m², 토지 1200m²) → 700m² 종합합산 전환", () => {
    const result = handleExcessAttachedLand({
      buildingFloorArea: 100,
      attachedLandArea: 1200,
      isUrbanArea: true,
    });
    // 도시지역 한도 = 100 × 5 = 500m² (지방세법 시행령 §105①1호)
    expect(result.attachedLandArea).toBe(500);
    expect(result.excessLandArea).toBe(700);
    expect(result.multiplier).toBe(5);
  });

  it("T06: 비도시지역 10배 한도 (건물 100m², 토지 800m²) → 초과 없음", () => {
    const result = handleExcessAttachedLand({
      buildingFloorArea: 100,
      attachedLandArea: 800,
      isUrbanArea: false,
    });
    // 비도시지역 한도 = 100 × 10 = 1000m² (지방세법 시행령 §105①2호)
    expect(result.attachedLandArea).toBe(800);
    expect(result.excessLandArea).toBe(0);
    expect(result.multiplier).toBe(10);
  });
});

// ============================================================
// classifyOfficetel
// ============================================================

describe("classifyOfficetel — 오피스텔 분류", () => {
  it("T07: 주거용 신고 → isResidential=true, objectType=house", () => {
    const result = classifyOfficetel({ isOfficetelResidential: true });
    expect(result.isResidential).toBe(true);
    expect(result.objectType).toBe("house");
    expect(result.warnings).toHaveLength(0);
  });

  it("T07-a: 주민등록 전입 → isResidential=true", () => {
    const result = classifyOfficetel({
      isOfficetelResidential: false,
      hasResidenceRegistration: true,
    });
    expect(result.isResidential).toBe(true);
    expect(result.objectType).toBe("house");
  });

  it("T08: 업무용 (둘 다 false) → isResidential=false, objectType=building, warning 1건", () => {
    const result = classifyOfficetel({ isOfficetelResidential: false });
    expect(result.isResidential).toBe(false);
    expect(result.objectType).toBe("building");
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ============================================================
// calculateHouseScope — 통합 집계
// ============================================================

describe("calculateHouseScope — 통합 집계", () => {
  it("T09: 순수 주택(겸용 없음) + 도시지역 한도 이내 → isHouse=true, 초과 없음", () => {
    const result = calculateHouseScope({
      ...BASE_HOUSE,
      buildingFloorArea: 100,
      attachedLandArea: 200,
      isUrbanArea: true,
    });
    expect(result.isHouse).toBe(true);
    expect(result.mixedUseClassification).toBe("full_house");
    expect(result.housePortion).toBe(1);
    expect(result.taxableAttachedLandArea).toBe(200);
    expect(result.excessLandArea).toBe(0);
  });

  it("T09-a: 겸용주택(주거>비주거) + 부속토지 통합", () => {
    const result = calculateHouseScope({
      ...BASE_HOUSE,
      residentialArea: 70,
      nonResidentialArea: 30,
      buildingFloorArea: 100,
      attachedLandArea: 500,
      isUrbanArea: true,
    });
    expect(result.isHouse).toBe(true);
    expect(result.mixedUseClassification).toBe("full_house");
    expect(result.housePortion).toBe(1);
    // 한도 = 100×1×5 = 500 → 초과 없음
    expect(result.taxableAttachedLandArea).toBe(500);
    expect(result.excessLandArea).toBe(0);
  });

  it("T10: 오피스텔 업무용 → isHouse=false", () => {
    const result = calculateHouseScope({
      ...BASE_HOUSE,
      structureType: "officetel_residential",
      isOfficetelResidential: false,
    });
    expect(result.isHouse).toBe(false);
    expect(result.mixedUseClassification).toBe("not_house");
    expect(result.housePortion).toBe(0);
    expect(result.taxableAttachedLandArea).toBe(0);
    expect(result.excessLandArea).toBe(BASE_HOUSE.attachedLandArea);
  });

  it("T10-a: totalHouseValue — 공시가격 입력 시 계산됨", () => {
    const result = calculateHouseScope(
      {
        ...BASE_HOUSE,
        buildingFloorArea: 100,
        attachedLandArea: 200,
        isUrbanArea: true,
      },
      300_000_000, // buildingPublicPrice
      100_000_000, // landPublicPrice
    );
    expect(result.totalHouseValue).toBeDefined();
    // housePortion=1, landRatio=1 → 300M + 100M = 400M
    expect(result.totalHouseValue).toBe(400_000_000);
  });
});
