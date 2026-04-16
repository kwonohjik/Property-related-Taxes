/**
 * 재산세 비과세·감면 판정 테스트 (P2-08)
 *
 * T01: 정부 소유 → 비과세
 * T02: 공공용 토지(도로) → 비과세
 * T03: 임시건축물 → 비과세
 * T04: 일반 개인 소유 → 비과세 아님
 * T05: 장기임대주택 → 감면 25%
 * T06: 다자녀 3명 → 감면 50%
 * T07: 복수 감면 → 최대 감면율 선택
 */

import { describe, it, expect } from "vitest";
import {
  checkPropertyTaxExemption,
  checkPropertyTaxReduction,
} from "../../lib/tax-engine/property-exemption";

describe("checkPropertyTaxExemption — §109 비과세", () => {
  it("T01: 국가·지자체 소유 → 비과세", () => {
    const result = checkPropertyTaxExemption({
      ownerType: "government",
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("government_owned");
    expect(result.legalBasis).toContain("§109");
  });

  it("T02: 도로 지목 토지 → 공공용 토지 비과세", () => {
    const result = checkPropertyTaxExemption({
      ownerType: "individual",
      landUse: "도로",
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("public_use_land");
  });

  it("T03: 임시건축물 → 비과세", () => {
    const result = checkPropertyTaxExemption({
      ownerType: "individual",
      isTemporaryBuilding: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("temporary_building");
  });

  it("T04: 일반 개인 소유 주택 → 비과세 아님", () => {
    const result = checkPropertyTaxExemption({
      ownerType: "individual",
    });
    expect(result.isExempt).toBe(false);
  });

  it("T05: 종교 용도 건물 → 비과세", () => {
    const result = checkPropertyTaxExemption({
      ownerType: "nonprofit",
      isReligiousNonprofitUse: true,
    });
    expect(result.isExempt).toBe(true);
    expect(result.exemptionType).toBe("religious_nonprofit_use");
  });
});

describe("checkPropertyTaxReduction — 지특법 감면", () => {
  it("T05: 장기임대주택 → 25% 감면", () => {
    const result = checkPropertyTaxReduction({
      ownerType: "individual",
      objectType: "house",
      isLongTermRentalHousing: true,
    });
    expect(result.hasReduction).toBe(true);
    expect(result.reductionType).toBe("long_term_rental_housing");
    expect(result.reductionRate).toBe(0.25);
  });

  it("T06: 다자녀 3명 → 50% 감면", () => {
    const result = checkPropertyTaxReduction({
      ownerType: "individual",
      objectType: "house",
      isMultiChildFamily: true,
      multiChildCount: 3,
    });
    expect(result.hasReduction).toBe(true);
    expect(result.reductionRate).toBe(0.50);
  });

  it("T07: 공공임대(50%) + 장기임대(25%) 중복 → 50% 선택", () => {
    const result = checkPropertyTaxReduction({
      ownerType: "corporation",
      objectType: "house",
      isPublicRentalHousing: true,
      isLongTermRentalHousing: true,
    });
    expect(result.reductionRate).toBe(0.50);
    expect(result.reductionType).toBe("public_rental_housing");
  });

  it("T08: 감면 없음 → reductionRate 0", () => {
    const result = checkPropertyTaxReduction({
      ownerType: "individual",
      objectType: "house",
    });
    expect(result.hasReduction).toBe(false);
    expect(result.reductionRate).toBe(0);
  });
});
