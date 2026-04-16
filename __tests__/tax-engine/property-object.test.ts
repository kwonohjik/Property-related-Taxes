/**
 * 재산세 과세대상 통합 판정 테스트 (P2-21~23)
 *
 * T01: isPropertyTaxObject — 5종 과세 / 비과세 물건
 * T02: classifyBuilding — 4종 분류
 * T03: 국가 소유 토지 → 비과세
 * T04: 자경농지 → 분리과세 반환
 * T05: 주택 (순수) → house, adjustedPublicPrice = publicPrice
 * T06: 겸용주택 (주거<비주거) → housePortion 반영, adjustedPublicPrice 조정
 * T07: 업무용 오피스텔 → building으로 재분류
 */

import { describe, it, expect } from "vitest";
import {
  isPropertyTaxObject,
  classifyBuilding,
  determinePropertyTaxObject,
} from "../../lib/tax-engine/property-object";
import type { PropertyObjectInput } from "../../lib/tax-engine/types/property-object.types";

const BASE_INPUT: PropertyObjectInput = {
  objectType: "house",
  registeredOwner: "홍길동",
  ownerType: "individual",
  publicPrice: 500_000_000,
  houseInfo: {
    buildingFloorArea: 100,
    attachedLandArea: 300,
    isUrbanArea: true,
    structureType: "apartment",
  },
};

// ============================================================
// isPropertyTaxObject
// ============================================================

describe("isPropertyTaxObject — 과세대상 열거주의", () => {
  it("T01: land/building/house/vessel/aircraft → true", () => {
    expect(isPropertyTaxObject("land")).toBe(true);
    expect(isPropertyTaxObject("building")).toBe(true);
    expect(isPropertyTaxObject("house")).toBe(true);
    expect(isPropertyTaxObject("vessel")).toBe(true);
    expect(isPropertyTaxObject("aircraft")).toBe(true);
  });
});

// ============================================================
// classifyBuilding
// ============================================================

describe("classifyBuilding — 건축물 4종", () => {
  it("T02: golf_course·luxury·factory·general 반환", () => {
    expect(classifyBuilding("golf_course")).toBe("golf_course");
    expect(classifyBuilding("luxury")).toBe("luxury");
    expect(classifyBuilding("factory")).toBe("factory");
    expect(classifyBuilding("general")).toBe("general");
    expect(classifyBuilding(undefined)).toBe("general");
  });
});

// ============================================================
// determinePropertyTaxObject
// ============================================================

describe("determinePropertyTaxObject — 통합 판정", () => {
  it("T03: 국가 소유 토지 → 비과세 (isSubjectToTax=false)", () => {
    const result = determinePropertyTaxObject({
      ...BASE_INPUT,
      objectType: "land",
      ownerType: "government",
      houseInfo: undefined,
      landInfo: {
        landArea: 500,
        landUse: "대",
        zoningDistrict: "commercial",
        isFarmland: false,
      },
      publicPrice: 200_000_000,
    });
    expect(result.isSubjectToTax).toBe(false);
    expect(result.exemption?.isExempt).toBe(true);
    expect(result.exemption?.exemptionType).toBe("government_owned");
  });

  it("T04: 자경농지 → isSubjectToTax=true, 분리과세 반환", () => {
    const result = determinePropertyTaxObject({
      ...BASE_INPUT,
      objectType: "land",
      houseInfo: undefined,
      landInfo: {
        landArea: 1000,
        landUse: "전",
        zoningDistrict: "agricultural",
        isFarmland: true,
        isSelfCultivated: true,
        isFarmer: true,
      },
      publicPrice: 100_000_000,
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.landClassification?.primary).toBe("separate_taxation");
    expect(result.landClassification?.separateTaxationType).toBe("farmland_self_cultivated");
    expect(result.landClassification?.separateTaxationRate).toBe(0.0007);
  });

  it("T05: 일반 주택 → house, adjustedPublicPrice = publicPrice", () => {
    const result = determinePropertyTaxObject(BASE_INPUT);
    expect(result.isSubjectToTax).toBe(true);
    expect(result.objectType).toBe("house");
    expect(result.adjustedPublicPrice).toBe(500_000_000);
    expect(result.houseScope?.mixedUseClassification).toBe("full_house");
  });

  it("T06: 겸용주택 주거(30) < 비주거(70) → housePortion≈0.3, adjustedPublicPrice 조정", () => {
    const result = determinePropertyTaxObject({
      ...BASE_INPUT,
      publicPrice: 1_000_000_000,
      houseInfo: {
        buildingFloorArea: 100,
        attachedLandArea: 200,
        isUrbanArea: true,
        structureType: "single_detached",
        residentialArea: 30,
        nonResidentialArea: 70,
      },
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.objectType).toBe("house");
    // housePortion = 30/100 = 0.3 → 1B × 0.3 = 300M
    expect(result.adjustedPublicPrice).toBe(300_000_000);
    expect(result.houseScope?.mixedUseClassification).toBe("partial_house");
  });

  it("T07: 업무용 오피스텔 → building으로 재분류", () => {
    const result = determinePropertyTaxObject({
      ...BASE_INPUT,
      houseInfo: {
        buildingFloorArea: 80,
        attachedLandArea: 150,
        isUrbanArea: true,
        structureType: "officetel_residential",
        isOfficetelResidential: false,
      },
    });
    expect(result.objectType).toBe("building");
    expect(result.buildingClassification).toBe("general");
  });
});
