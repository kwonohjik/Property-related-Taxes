/**
 * RH-A1: 임대주택 N채 + 거주주택 → 거주주택 양도 (12억 이하) — 전액 비과세
 *
 * 시나리오: 임대주택 1채 보유 + 자가 거주주택 양도, 양도가 8억
 * 결과: taxableGain = 0 (전액 비과세)
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

function makeA1Input(): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        businessRegistrationDate: new Date("2018-01-01"),
        rentalRegistrationDate: new Date("2018-01-01"),
        rentalCategory: "long_general",
        rentalAcquisitionType: "purchase",
        isApartment: false,
        region: "non-metro",
        isRegulatedAreaNewAcq: false,
        standardPriceAtRentalStart: 200_000_000,
        hasMinimum2Units: false, // 2억 (비수도권 3억 이하)
        rentalMonths: 96, // 8년
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    // A 시나리오: B 전용 필드 불필요
  };
}

describe("RH-A1: 거주주택 양도 12억 이하 — 전액 비과세", () => {
  const GAIN = 200_000_000;
  const S = 800_000_000; // 8억 (12억 이하)
  const HOLD_YEARS = 10;
  const LIVE_YEARS = 5;
  const RES_HOLD_YEARS = 10;
  const RES_LIVE_YEARS = 5;

  it("applied=true, taxableGain=0 (전액 비과세)", () => {
    const result = calculateRentalHousingException(
      makeA1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RES_HOLD_YEARS, RES_LIVE_YEARS,
    );
    expect(result.applied).toBe(true);
    expect(result.taxableGain).toBe(0);
    expect(result.scenarioId).toBe("RH-A1");
  });

  it("appliedTable = 'table-2' (1세대1주택 특례표)", () => {
    const result = calculateRentalHousingException(
      makeA1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RES_HOLD_YEARS, RES_LIVE_YEARS,
    );
    expect(result.appliedTable).toBe("table-2");
  });

  it("exemptGain > 0 (비과세 = gain95T2 전액)", () => {
    const result = calculateRentalHousingException(
      makeA1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RES_HOLD_YEARS, RES_LIVE_YEARS,
    );
    expect(result.exemptGain).toBeGreaterThan(0);
  });

  it("eligibility.passed=true (임대주택 요건 충족)", () => {
    const result = calculateRentalHousingException(
      makeA1Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RES_HOLD_YEARS, RES_LIVE_YEARS,
    );
    expect(result.eligibility.passed).toBe(true);
    expect(result.eligibility.failReasons).toHaveLength(0);
  });

  it("토글 OFF 시 applied=false", () => {
    const input = { ...makeA1Input(), applyException: false };
    const result = calculateRentalHousingException(
      input,
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      RES_HOLD_YEARS, RES_LIVE_YEARS,
    );
    expect(result.applied).toBe(false);
  });
});
