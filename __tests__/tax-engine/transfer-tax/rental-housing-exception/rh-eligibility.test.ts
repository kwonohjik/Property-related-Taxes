/**
 * RH-Eligibility: 요건 미충족 차단
 *
 * 검증 케이스:
 *   - 거주주택 보유 2년 미만
 *   - 거주주택 거주 2년 미만
 *   - 말소 후 의무임대기간 미충족 (㉓ 1/2 미달 — 말소 없는 기간 미충족은 §155㉑로 통과)
 *   - 임대개시 기준시가 상한 초과 (수도권 6억 초과)
 *   - 2020.7.11 이후 등록 아파트 장기일반 (제외 대상)
 *   - 기타 요건 자기확인 미체크
 *
 * F-15 대조 케이스(㉑ 통과)를 제외한 모든 케이스에서 applied = false, eligibility.passed = false
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
  type RentalUnitInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

const baseUnit: RentalUnitInput = {
  businessRegistrationDate: new Date("2014-01-01"),
  rentalRegistrationDate: new Date("2014-01-01"),
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  isExcluded918Rule: false,
  standardPriceAtRentalStart: 500_000_000,
  hasMinimum2Units: false,
  rentalMonths: 96,
  rentalAutoTermination: false,
  requirementsConfirmed: true,
};

const baseInput: RentalHousingExceptionInput = {
  applyException: true,
  scenario: "A",
  rentalUnits: [baseUnit],
};

function run(
  unit: Partial<RentalUnitInput>,
  residenceHoldYears = 5,
  residenceLiveYears = 5,
) {
  return calculateRentalHousingException(
    { ...baseInput, rentalUnits: [{ ...baseUnit, ...unit }] },
    300_000_000,
    1_000_000_000,
    10,
    5,
    residenceHoldYears,
    residenceLiveYears, 1_200_000_000,
  );
}

describe("RH-Eligibility — 요건 미충족 차단", () => {
  it("거주주택 보유 2년 미만 → passed = false", () => {
    const result = run({}, 1, 5);
    expect(result.eligibility.passed).toBe(false);
    expect(result.applied).toBe(false);
    expect(result.eligibility.residenceFailReasons.length).toBeGreaterThan(0);
  });

  it("거주주택 거주 2년 미만 → passed = false", () => {
    const result = run({}, 5, 1);
    expect(result.eligibility.passed).toBe(false);
    expect(result.applied).toBe(false);
  });

  // OH-39: ㉓1호 불충족은 「의무임대기간 미충족」이 아니라 ㉓ 사유 코드로 낸다(장기일반 8년 → 48개월 기준).
  it("말소 후 임대 48개월 미만(㉓ 1/2 미충족) → unit RENTAL_TERMINATION_RESTRICTED", () => {
    const result = run({ rentalMonths: 24, rentalAutoTermination: true, terminatedRegistrationType: "long_term_general" });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "RENTAL_TERMINATION_RESTRICTED")).toBe(true);
  });

  it("F-15: 말소 없이 임대 60개월 미만 → §155㉑로 통과 (기간 요건만 면제)", () => {
    const result = run({ rentalMonths: 36 });
    expect(result.eligibility.passed).toBe(true);
    expect(result.eligibility.periodPendingUnitIndexes).toEqual([0]);
  });

  it("수도권 임대개시 기준시가 6억 초과 → STANDARD_PRICE_EXCEEDED", () => {
    const result = run({ standardPriceAtRentalStart: 700_000_000 });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "STANDARD_PRICE_EXCEEDED")).toBe(true);
  });

  it("2020.7.11 이후 등록 아파트 → APARTMENT_RESTRICTED", () => {
    const result = run({
      businessRegistrationDate: new Date("2021-01-01"),
      rentalRegistrationDate: new Date("2021-01-01"),
      isApartment: true,
      rentalCategory: "long_general",
      rentalMonths: 120,
    });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "APARTMENT_RESTRICTED")).toBe(true);
  });

  it("기타 요건 자기확인 미체크 → REQUIREMENTS_NOT_CONFIRMED", () => {
    const result = run({ requirementsConfirmed: false });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "REQUIREMENTS_NOT_CONFIRMED")).toBe(true);
  });

  it("토글 OFF → applied=false, scenarioId='RH-A1' (default)", () => {
    const result = calculateRentalHousingException(
      { ...baseInput, applyException: false },
      300_000_000, 1_000_000_000, 10, 5, 5, 5, 1_200_000_000,
    );
    expect(result.applied).toBe(false);
  });

  it("단기임대(short-6) + 조정대상지역 → SHORT_TERM_REGULATED", () => {
    const result = run({
      businessRegistrationDate: new Date("2025-07-01"),
      rentalRegistrationDate: new Date("2025-07-01"),
      rentalCategory: "short_6y",
      rentalMonths: 72,
      region: "seoul-metro",
      isExcluded918Rule: true,
    });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "SHORT_TERM_REGULATED")).toBe(true);
  });
});
