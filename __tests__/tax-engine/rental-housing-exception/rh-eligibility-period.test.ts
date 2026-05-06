/**
 * §155⑳ 요건 판정 — 의무임대기간 미충족 차단 테스트
 *
 * 등록신청일별 의무임대기간:
 * - 2020.7.10 이전: 5년 (장기, pre-2018 포함)
 * - 2020.7.11~8.17: 8년
 * - 2020.8.18 이후: 10년
 * - short-6 (2025.6.4 이후): 6년
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import {
  checkEligibility,
  lookupRequiredRentalYears,
  isApartmentRestricted,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";
import type { RentalUnitInput } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/types";

// ============================================================
// 의무임대기간 룩업 단위 테스트
// ============================================================

describe("lookupRequiredRentalYears — 등록신청일별 의무기간", () => {
  const makeUnit = (overrides: Partial<RentalUnitInput>): RentalUnitInput => ({
    registrationDate: new Date("2019-01-01"),
    rentalType: "long-8",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "non-metro",
    standardPriceAtRentalStart: 200_000_000,
    rentalMonths: 60,
    rentalAutoTermination: false,
    requirementsConfirmed: true,
    ...overrides,
  });

  it("2020.7.10 이전 등록 long-8 → 5년", () => {
    const unit = makeUnit({ registrationDate: new Date("2020-07-10") });
    expect(lookupRequiredRentalYears(unit)).toBe(5);
  });

  it("2020.7.11 등록 long-8 → 8년", () => {
    const unit = makeUnit({ registrationDate: new Date("2020-07-11") });
    expect(lookupRequiredRentalYears(unit)).toBe(8);
  });

  it("2020.8.17 등록 long-8 → 8년", () => {
    const unit = makeUnit({ registrationDate: new Date("2020-08-17") });
    expect(lookupRequiredRentalYears(unit)).toBe(8);
  });

  it("2020.8.18 등록 long-10 → 10년", () => {
    const unit = makeUnit({
      registrationDate: new Date("2020-08-18"),
      rentalType: "long-10",
    });
    expect(lookupRequiredRentalYears(unit)).toBe(10);
  });

  it("short-4 → 4년 (등록일 무관)", () => {
    const unit = makeUnit({
      registrationDate: new Date("2019-06-01"),
      rentalType: "short-4",
    });
    expect(lookupRequiredRentalYears(unit)).toBe(4);
  });

  it("short-6 → 6년 (2025.6.4 이후 신설)", () => {
    const unit = makeUnit({
      registrationDate: new Date("2025-07-01"),
      rentalType: "short-6",
    });
    expect(lookupRequiredRentalYears(unit)).toBe(6);
  });

  it("pre-2018 → 5년 (구 임대주택법)", () => {
    const unit = makeUnit({
      registrationDate: new Date("2017-01-01"),
      rentalType: "pre-2018",
    });
    expect(lookupRequiredRentalYears(unit)).toBe(5);
  });
});

// ============================================================
// 아파트 등록 제한 단위 테스트
// ============================================================

describe("isApartmentRestricted — 아파트 등록 제한", () => {
  const makeUnit = (overrides: Partial<RentalUnitInput>): RentalUnitInput => ({
    registrationDate: new Date("2020-07-11"),
    rentalType: "long-8",
    rentalAcquisitionType: "purchase",
    isApartment: true,
    region: "non-metro",
    standardPriceAtRentalStart: 300_000_000,
    rentalMonths: 96,
    rentalAutoTermination: false,
    requirementsConfirmed: true,
    ...overrides,
  });

  it("2020.7.11 이후 아파트 → 제한(true)", () => {
    const unit = makeUnit({ registrationDate: new Date("2020-07-11") });
    expect(isApartmentRestricted(unit)).toBe(true);
  });

  it("2020.7.10 이전 아파트 → 허용(false)", () => {
    const unit = makeUnit({ registrationDate: new Date("2020-07-10") });
    expect(isApartmentRestricted(unit)).toBe(false);
  });

  it("2020.7.11 이후 비아파트 → 허용(false)", () => {
    const unit = makeUnit({ isApartment: false });
    expect(isApartmentRestricted(unit)).toBe(false);
  });
});

// ============================================================
// checkEligibility — 미충족 차단 통합 테스트
// ============================================================

describe("checkEligibility — 의무임대기간 미충족 차단", () => {
  const BASE_UNIT: RentalUnitInput = {
    registrationDate: new Date("2020-07-11"), // 8년 필요
    rentalType: "long-8",
    rentalAcquisitionType: "purchase",
    isApartment: false,
    region: "non-metro",
    standardPriceAtRentalStart: 200_000_000,
    rentalMonths: 83, // 6년 11개월 — 8년 미충족
    rentalAutoTermination: false,
    requirementsConfirmed: true,
  };

  it("83개월(6년11개월) < 8년 → 미충족 차단", () => {
    const result = checkEligibility([BASE_UNIT], 10, 5);
    expect(result.passed).toBe(false);
    const fail = result.failReasons.find(r => r.code === "RENTAL_PERIOD_SHORT");
    expect(fail).toBeDefined();
  });

  it("96개월(8년) = 8년 → 충족 통과", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96 };
    const result = checkEligibility([unit], 10, 5);
    expect(result.passed).toBe(true);
    expect(result.failReasons).toHaveLength(0);
  });

  it("거주주택 보유 2년 미충족 → passed=false", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96 };
    const result = checkEligibility([unit], 1, 5); // 보유 1년
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.length).toBeGreaterThan(0);
  });

  it("거주주택 거주 2년 미충족 → passed=false", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96 };
    const result = checkEligibility([unit], 5, 1); // 거주 1년
    expect(result.passed).toBe(false);
    expect(result.residenceFailReasons.length).toBeGreaterThan(0);
  });

  it("기준시가 초과 → 해당 호 미충족", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96, standardPriceAtRentalStart: 350_000_000 }; // 비수도권 3억 초과
    const result = checkEligibility([unit], 5, 5);
    expect(result.passed).toBe(false);
    const fail = result.failReasons.find(r => r.code === "STANDARD_PRICE_EXCEEDED");
    expect(fail).toBeDefined();
  });

  it("2020.7.11 이후 아파트 → APARTMENT_RESTRICTED", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96, isApartment: true };
    const result = checkEligibility([unit], 5, 5);
    expect(result.passed).toBe(false);
    const fail = result.failReasons.find(r => r.code === "APARTMENT_RESTRICTED");
    expect(fail).toBeDefined();
  });

  it("requirementsConfirmed=false → 미충족", () => {
    const unit = { ...BASE_UNIT, rentalMonths: 96, requirementsConfirmed: false };
    const result = checkEligibility([unit], 5, 5);
    expect(result.passed).toBe(false);
    const fail = result.failReasons.find(r => r.code === "REQUIREMENTS_NOT_CONFIRMED");
    expect(fail).toBeDefined();
  });

  it("2호 중 1호라도 통과하면 passed=true", () => {
    const failUnit: RentalUnitInput = { ...BASE_UNIT, rentalMonths: 60 }; // 5년 미충족
    const passUnit: RentalUnitInput = { ...BASE_UNIT, rentalMonths: 96 }; // 8년 충족
    const result = checkEligibility([failUnit, passUnit], 5, 5);
    expect(result.passed).toBe(true);
  });
});

// ============================================================
// calculateRentalHousingException — 미충족 시 applied=false
// ============================================================

describe("calculateRentalHousingException — 미충족 시 applied=false 반환", () => {
  it("의무임대기간 미충족 → applied=false", () => {
    const input: RentalHousingExceptionInput = {
      applyException: true,
      scenario: "A",
      rentalUnits: [
        {
          registrationDate: new Date("2020-07-11"),
          rentalType: "long-8",
          rentalAcquisitionType: "purchase",
          isApartment: false,
          region: "non-metro",
          standardPriceAtRentalStart: 200_000_000,
          rentalMonths: 60, // 5년 — 8년 미충족
          rentalAutoTermination: false,
          requirementsConfirmed: true,
        },
      ],
    };
    const result = calculateRentalHousingException(
      input,
      100_000_000, 800_000_000, 10, 5, 5, 5,
    );
    expect(result.applied).toBe(false);
    expect(result.eligibility.passed).toBe(false);
  });
});
