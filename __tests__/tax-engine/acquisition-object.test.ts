/**
 * 취득세 과세 대상 판정 단위 테스트
 *
 * acquisition-object.ts — isTaxableObject, checkExemption, determineTaxableObject
 */

import { describe, it, expect } from "vitest";
import {
  isTaxableObject,
  checkExemption,
  determineTaxableObject,
  isRealEstate,
  isHousing,
  isFarmland,
  isLuxuryProperty,
} from "../../lib/tax-engine/acquisition-object";
import type { PropertyObjectType } from "../../lib/tax-engine/types/acquisition.types";

// ============================================================
// isTaxableObject — 지방세법 §7 열거주의
// ============================================================

describe("isTaxableObject", () => {
  const taxableTypes: PropertyObjectType[] = [
    "housing", "land", "land_farmland", "building",
    "vehicle", "machinery", "aircraft", "vessel",
    "mining_right", "fishing_right", "membership", "standing_tree",
  ];

  it.each(taxableTypes)("%s: 과세 대상", (type) => {
    expect(isTaxableObject(type)).toBe(true);
  });

  it("알 수 없는 유형: 과세 대상 아님", () => {
    // @ts-expect-error 테스트 목적
    expect(isTaxableObject("unknown_type")).toBe(false);
  });
});

// ============================================================
// checkExemption — 지방세법 §9
// ============================================================

describe("checkExemption", () => {
  it("국가·지방자치단체 취득: 비과세", () => {
    const result = checkExemption({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "government",
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("government_acquisition");
  });

  it("신탁 위탁자 반환: 비과세", () => {
    const result = checkExemption({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      isTrustReturn: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("trust_return");
  });

  it("묘지 취득: 비과세", () => {
    const result = checkExemption({
      propertyType: "land",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      isCemetery: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("cemetery");
  });

  it("비영리법인 종교용도 취득: 비과세", () => {
    const result = checkExemption({
      propertyType: "building",
      acquisitionCause: "purchase",
      acquiredBy: "nonprofit",
      isReligiousNonprofit: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("religious_nonprofit");
  });

  it("임시건축물: 비과세", () => {
    const result = checkExemption({
      propertyType: "building",
      acquisitionCause: "new_construction",
      acquiredBy: "individual",
      isTemporaryBuilding: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("temporary_building");
  });

  it("자경농지: 비과세", () => {
    const result = checkExemption({
      propertyType: "land_farmland",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
      isSelfCultivatedFarmland: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("self_cultivated_farmland");
  });

  it("일반 개인 주택 매매: 과세 대상 (비과세 없음)", () => {
    const result = checkExemption({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
    });
    expect(result.isExempt).toBe(false);
  });

  it("비영리법인이지만 종교용도 아님: 과세 대상", () => {
    const result = checkExemption({
      propertyType: "building",
      acquisitionCause: "purchase",
      acquiredBy: "nonprofit",
      isReligiousNonprofit: false,
    });
    expect(result.isExempt).toBe(false);
  });
});

// ============================================================
// determineTaxableObject — 종합 판정
// ============================================================

describe("determineTaxableObject", () => {
  it("과세 대상 + 비과세 없음: isTaxable=true, isExempt=false", () => {
    const result = determineTaxableObject({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "individual",
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.isExempt).toBe(false);
  });

  it("과세 대상 + 비과세 사유: isTaxable=true, isExempt=true", () => {
    const result = determineTaxableObject({
      propertyType: "housing",
      acquisitionCause: "purchase",
      acquiredBy: "government",
    });
    expect(result.isSubjectToTax).toBe(true);
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("government_acquisition");
  });
});

// ============================================================
// 유틸 함수
// ============================================================

describe("isRealEstate", () => {
  it("주택·토지·농지·건물: true", () => {
    expect(isRealEstate("housing")).toBe(true);
    expect(isRealEstate("land")).toBe(true);
    expect(isRealEstate("land_farmland")).toBe(true);
    expect(isRealEstate("building")).toBe(true);
  });

  it("차량·회원권: false", () => {
    expect(isRealEstate("vehicle")).toBe(false);
    expect(isRealEstate("membership")).toBe(false);
  });
});

describe("isHousing / isFarmland", () => {
  it("isHousing: housing만 true", () => {
    expect(isHousing("housing")).toBe(true);
    expect(isHousing("land")).toBe(false);
  });

  it("isFarmland: land_farmland만 true", () => {
    expect(isFarmland("land_farmland")).toBe(true);
    expect(isFarmland("land")).toBe(false);
  });
});

describe("isLuxuryProperty", () => {
  it("회원권: 항상 사치성 재산", () => {
    expect(isLuxuryProperty("membership", false)).toBe(true);
  });

  it("isLuxuryUse=true: 사치성 재산", () => {
    expect(isLuxuryProperty("housing", true)).toBe(true);
  });

  it("일반 주택, isLuxuryUse=false: 사치성 아님", () => {
    expect(isLuxuryProperty("housing", false)).toBe(false);
  });
});
