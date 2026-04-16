/**
 * 종합부동산세 합산배제 판정 테스트 (T-18)
 * 종합부동산세법 §8②, 시행령 §3·§4 기반
 */

import { describe, it, expect } from "vitest";
import {
  validateRentalExclusion,
  validateOtherExclusion,
  applyAggregationExclusion,
} from "../../lib/tax-engine/comprehensive-tax";
import { COMPREHENSIVE_EXCL } from "../../lib/tax-engine/legal-codes";
import type {
  PropertyForExclusion,
  RentalExclusionInput,
  OtherExclusionInput,
} from "../../lib/tax-engine/types/comprehensive.types";

const ASSESSMENT_DATE = new Date("2024-06-01");

// ============================================================
// 임대주택 합산배제 (시행령 §3)
// ============================================================

describe("validateRentalExclusion — 임대주택 합산배제", () => {
  const baseRentalInput: RentalExclusionInput = {
    registrationType: "private_purchase_long",
    rentalRegistrationDate: new Date("2020-01-01"),
    rentalStartDate: new Date("2020-02-01"),
    assessedValue: 500_000_000,  // 5억 (수도권 6억 이하)
    area: 75,                    // 75㎡ (85㎡ 이하)
    location: "metro",
    currentRent: 1_000_000,
    isInitialContract: true,
    assessmentDate: ASSESSMENT_DATE,
  };

  // T01: 수도권 민간매입 장기일반 — 요건 전부 충족 → 합산배제
  it("T01: 요건 전부 충족 → 합산배제 (isExcluded: true)", () => {
    const result = validateRentalExclusion(baseRentalInput);
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG);
  });

  // T02: 공시가격 7억 초과 → 배제 불가
  it("T02: 공시가격 7억 초과(수도권 6억 기준) → 배제 불가", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      assessedValue: 700_000_000,
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
  });

  // T03: 수도권 공공지원민간임대 — 공시가격 8억 → 9억 기준 충족
  it("T03: 공공지원민간임대 수도권 8억 → 9억 기준 충족 → 합산배제", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      registrationType: "public_support",
      assessedValue: 800_000_000,
    });
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_RENTAL);
  });

  // T04: 임대료 증가율 6% → 5% 초과 → 배제 불가
  it("T04: 임대료 증가율 6% 초과 → 배제 불가", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      isInitialContract: false,
      previousRent: 1_000_000,
      currentRent: 1_061_000,  // 6.1% 인상
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
  });

  // T05: 면적 90㎡ → 85㎡ 초과 → 배제 불가
  it("T05: 전용면적 90㎡ 초과 → 배제 불가", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      area: 90,
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  });

  // T06: 임대 미개시 (과세기준일 이후 임대개시)
  it("T06: 임대 미개시 (임대개시일 > 과세기준일) → 배제 불가", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      rentalStartDate: new Date("2024-07-01"),  // 과세기준일 이후
    });
    expect(result.isExcluded).toBe(false);
    expect(result.failReasons).toContain(COMPREHENSIVE_EXCL.RENTAL_NOT_STARTED);
  });

  // 임대료 증가율 딱 5% → 허용
  it("T04-boundary: 임대료 증가율 정확히 5% → 합산배제", () => {
    const result = validateRentalExclusion({
      ...baseRentalInput,
      isInitialContract: false,
      previousRent: 1_000_000,
      currentRent: 1_050_000,  // 5.0% 인상
    });
    expect(result.isExcluded).toBe(true);
  });
});

// ============================================================
// 기타 합산배제 주택 (시행령 §4)
// ============================================================

describe("validateOtherExclusion — 기타 합산배제", () => {
  const baseProp: PropertyForExclusion = {
    propertyId: "p1",
    assessedValue: 400_000_000,
    area: 80,
    location: "metro",
    exclusionType: "unsold_housing",
  };

  // T07: 미분양주택 — 4년 경과 → 5년 미만 → 합산배제
  it("T07: 미분양주택 4년 경과 (5년 미만) → 합산배제", () => {
    const info: OtherExclusionInput = {
      isFirstSale: true,
      recruitmentNoticeDate: "2019-01-01",
      acquisitionDate: "2020-03-01",  // 4년 경과 (2024-06-01 기준)
    };
    const result = validateOtherExclusion(baseProp, "unsold_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.UNSOLD_HOUSING);
  });

  // T08: 미분양주택 — 취득 후 6년 경과 → 5년 만료 → 배제 불가
  it("T08: 미분양주택 취득 6년 경과 → 5년 만료 → 배제 불가", () => {
    const info: OtherExclusionInput = {
      isFirstSale: true,
      recruitmentNoticeDate: "2017-01-01",
      acquisitionDate: "2018-03-01",  // 6년 이상 경과
    };
    const result = validateOtherExclusion(baseProp, "unsold_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(false);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.UNSOLD_PERIOD_EXPIRED);
  });

  // T09: 미분양주택 — 최초 매각 아님 → 배제 불가
  it("T09: 미분양주택 최초 매각 아님 → 배제 불가", () => {
    const info: OtherExclusionInput = { isFirstSale: false };
    const result = validateOtherExclusion(baseProp, "unsold_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(false);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.UNSOLD_NOT_FIRST_SALE);
  });

  // T10: 가정어린이집 — 인가증 보유, 실사용 중 → 합산배제
  it("T10: 가정어린이집 인가증 보유 + 실사용 → 합산배제", () => {
    const info: OtherExclusionInput = {
      hasDaycarePermit: true,
      isActuallyUsedAsDaycare: true,
    };
    const result = validateOtherExclusion(baseProp, "daycare_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.DAYCARE_HOUSING);
  });

  // T11: 사원용 주택 — 시세 40% 제공, 80㎡ → 합산배제
  it("T11: 사원용 주택 시세 40% 제공, 80㎡ → 합산배제", () => {
    const info: OtherExclusionInput = {
      isProvidedToEmployee: true,
      rentalFeeRate: 0.40,
    };
    const result = validateOtherExclusion(baseProp, "employee_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(true);
    expect(result.reason).toBe(COMPREHENSIVE_EXCL.EMPLOYEE_HOUSING);
  });

  // T12: 사원용 주택 — 시세 60% 제공 → 50% 초과 → 배제 불가
  it("T12: 사원용 주택 임대료율 60% (50% 초과) → 배제 불가", () => {
    const info: OtherExclusionInput = {
      isProvidedToEmployee: true,
      rentalFeeRate: 0.60,
    };
    const result = validateOtherExclusion(baseProp, "employee_housing", info, ASSESSMENT_DATE);
    expect(result.isExcluded).toBe(false);
  });
});

// ============================================================
// 합산배제 일괄 판정 + 과세표준 통합
// ============================================================

describe("applyAggregationExclusion — 일괄 판정", () => {
  // T13: 3주택 중 1주택 합산배제 → 과세표준 변동 확인
  it("T13: 3주택 (5억/4억/3억) 중 3억짜리 1주택 합산배제 → 총배제액 3억", () => {
    const properties: PropertyForExclusion[] = [
      {
        propertyId: "p1",
        assessedValue: 500_000_000,
        area: 80,
        location: "metro",
        exclusionType: "none",
      },
      {
        propertyId: "p2",
        assessedValue: 400_000_000,
        area: 80,
        location: "metro",
        exclusionType: "none",
      },
      {
        propertyId: "p3",
        assessedValue: 300_000_000,
        area: 75,
        location: "non_metro",
        exclusionType: "private_purchase_rental_long",
        rentalInfo: {
          registrationType: "private_purchase_long",
          rentalRegistrationDate: new Date("2020-01-01"),
          rentalStartDate: new Date("2020-02-01"),
          assessedValue: 300_000_000,
          area: 75,
          location: "non_metro",
          currentRent: 500_000,
          isInitialContract: true,
          assessmentDate: ASSESSMENT_DATE,
        },
      },
    ];

    const result = applyAggregationExclusion(properties, ASSESSMENT_DATE);
    expect(result.totalExcludedValue).toBe(300_000_000);
    expect(result.excludedCount).toBe(1);
    expect(result.includedCount).toBe(2);
  });

  // T14: 복수 합산배제 — 2주택 배제 → 나머지 1주택만 합산
  it("T14: 2주택 합산배제 → 배제 주택 수 2, 포함 1", () => {
    const properties: PropertyForExclusion[] = [
      {
        propertyId: "p1",
        assessedValue: 500_000_000,
        area: 80,
        location: "metro",
        exclusionType: "none",
      },
      {
        propertyId: "p2",
        assessedValue: 400_000_000,
        area: 75,
        location: "metro",
        exclusionType: "private_purchase_rental_long",
        rentalInfo: {
          registrationType: "private_purchase_long",
          rentalRegistrationDate: new Date("2020-01-01"),
          rentalStartDate: new Date("2020-02-01"),
          assessedValue: 400_000_000,
          area: 75,
          location: "metro",
          currentRent: 1_000_000,
          isInitialContract: true,
          assessmentDate: ASSESSMENT_DATE,
        },
      },
      {
        propertyId: "p3",
        assessedValue: 300_000_000,
        area: 75,
        location: "non_metro",
        exclusionType: "daycare_housing",
        otherInfo: {
          hasDaycarePermit: true,
          isActuallyUsedAsDaycare: true,
        },
      },
    ];

    const result = applyAggregationExclusion(properties, ASSESSMENT_DATE);
    expect(result.excludedCount).toBe(2);
    expect(result.includedCount).toBe(1);
    expect(result.totalExcludedValue).toBe(700_000_000);
  });

  // T15: 전체 합산배제 → 합산 공시가격 0 → 종부세 0원
  it("T15: 전체 합산배제 → totalExcludedValue = 전체 공시가격 합계", () => {
    const properties: PropertyForExclusion[] = [
      {
        propertyId: "p1",
        assessedValue: 500_000_000,  // 5억 (수도권 6억 이하 → 합산배제 충족)
        area: 75,
        location: "metro",           // 수도권 (6억 기준 적용)
        exclusionType: "private_purchase_rental_long",
        rentalInfo: {
          registrationType: "private_purchase_long",
          rentalRegistrationDate: new Date("2020-01-01"),
          rentalStartDate: new Date("2020-02-01"),
          assessedValue: 500_000_000,
          area: 75,
          location: "metro",
          currentRent: 500_000,
          isInitialContract: true,
          assessmentDate: ASSESSMENT_DATE,
        },
      },
      {
        propertyId: "p2",
        assessedValue: 250_000_000,
        area: 75,
        location: "non_metro",
        exclusionType: "private_purchase_rental_long",
        rentalInfo: {
          registrationType: "private_purchase_long",
          rentalRegistrationDate: new Date("2020-01-01"),
          rentalStartDate: new Date("2020-02-01"),
          assessedValue: 250_000_000,
          area: 75,
          location: "non_metro",
          currentRent: 400_000,
          isInitialContract: true,
          assessmentDate: ASSESSMENT_DATE,
        },
      },
    ];

    const result = applyAggregationExclusion(properties, ASSESSMENT_DATE);
    expect(result.totalExcludedValue).toBe(750_000_000);
    expect(result.excludedCount).toBe(2);
    expect(result.includedCount).toBe(0);
  });
});
