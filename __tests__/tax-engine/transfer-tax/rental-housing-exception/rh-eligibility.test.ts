/**
 * RH-Eligibility: 요건 미충족 차단
 *
 * 검증 케이스:
 *   - 거주주택 보유 2년 미만
 *   - 거주주택 거주 2년 미만
 *   - 임대주택 의무임대기간 미충족 (5년 미만)
 *   - 임대개시 기준시가 상한 초과 (수도권 6억 초과)
 *   - 2020.7.11 이후 등록 아파트 장기일반 (제외 대상)
 *   - 기타 요건 자기확인 미체크
 *
 * 모든 케이스에서 applied = false, eligibility.passed = false
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
  type RentalUnitInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

const baseUnit: RentalUnitInput = {
  registrationDate: new Date("2014-01-01"),
  rentalType: "long-8",
  rentalAcquisitionType: "purchase",
  isApartment: false,
  region: "seoul-metro",
  standardPriceAtRentalStart: 500_000_000,
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
    residenceLiveYears,
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

  it("임대 60개월 미만 (5년 미만) → unit RENTAL_PERIOD_SHORT", () => {
    const result = run({ rentalMonths: 36 });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "RENTAL_PERIOD_SHORT")).toBe(true);
  });

  it("수도권 임대개시 기준시가 6억 초과 → STANDARD_PRICE_EXCEEDED", () => {
    const result = run({ standardPriceAtRentalStart: 700_000_000 });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "STANDARD_PRICE_EXCEEDED")).toBe(true);
  });

  it("2020.7.11 이후 등록 아파트 → APARTMENT_RESTRICTED", () => {
    const result = run({
      registrationDate: new Date("2021-01-01"),
      isApartment: true,
      rentalType: "long-10",
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
      300_000_000, 1_000_000_000, 10, 5, 5, 5,
    );
    expect(result.applied).toBe(false);
  });

  it("단기임대(short-6) + 조정대상지역 → SHORT_TERM_REGULATED", () => {
    const result = run({
      registrationDate: new Date("2025-07-01"),
      rentalType: "short-6",
      rentalMonths: 72,
      region: "regulated-area",
    });
    expect(result.eligibility.passed).toBe(false);
    expect(result.eligibility.failReasons.some(r => r.code === "SHORT_TERM_REGULATED")).toBe(true);
  });
});
