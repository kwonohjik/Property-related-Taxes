/**
 * RH-A1: 임대주택 보유 + 자가 거주주택 양도 (양도가 12억 이하)
 *
 * 결과: taxableGain = 0 (전액 비과세) — 1세대1주택 일반 비과세
 * 적용 표: §95② 표2 (1세대1주택)
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

describe("RH-A1 — 거주주택 양도 (12억 이하)", () => {
  const input: RentalHousingExceptionInput = {
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        businessRegistrationDate: new Date("2018-01-01"),
        rentalRegistrationDate: new Date("2018-01-01"),
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
      },
    ],
  };

  const result = calculateRentalHousingException(
    input,
    /* gain */ 200_000_000,
    /* S */ 1_000_000_000, // 10억 (12억 이하)
    /* holdYears */ 10,
    /* liveYears */ 5,
    /* residenceHoldYears */ 10,
    /* residenceLiveYears */ 5,
  );

  it("scenarioId = 'RH-A1'", () => {
    expect(result.scenarioId).toBe("RH-A1");
  });

  it("taxableGain = 0 (전액 비과세)", () => {
    expect(result.taxableGain).toBe(0);
  });

  it("appliedTable = 'table-2' (1세대1주택)", () => {
    expect(result.appliedTable).toBe("table-2");
  });

  it("applied = true", () => {
    expect(result.applied).toBe(true);
  });

  it("eligibility.passed = true", () => {
    expect(result.eligibility.passed).toBe(true);
  });

  it("§161③ 캡 미발동", () => {
    expect(result.formulaTrace.capApplied).toBe(false);
  });
});
