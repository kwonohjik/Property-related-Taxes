/**
 * RH-A2: 거주주택 양도 (12억 초과 = 고가주택) — 자체 검증값
 *
 * 입력:
 *   gain = 400,000,000, S = 1,500,000,000
 *   holdYears = 10, liveYears = 5
 *   표2 공제율 = min(10×4% + 5×4%, 80%) = min(0.40+0.20, 0.80) = 0.60 (60%)
 *   ltcT2 = floor(400,000,000 × 0.60) = 240,000,000
 *   gain95T2 = 400,000,000 − 240,000,000 = 160,000,000
 *
 * 산식:
 *   r_high = (1,500,000,000 − 1,200,000,000) / 1,500,000,000
 *          = 300,000,000 / 1,500,000,000 = 0.2
 *   taxableGain = floor(160,000,000 × 300,000,000 / 1,500,000,000) = 32,000,000
 *   exemptGain = 160,000,000 − 32,000,000 = 128,000,000
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

const GAIN = 400_000_000;
const S = 1_500_000_000; // 15억 (12억 초과)
const HOLD_YEARS = 10;
const LIVE_YEARS = 5;

// 자체 검증값
const GAIN95_T2_EXPECTED = 160_000_000;
const TAXABLE_GAIN_EXPECTED = 32_000_000; // floor(160M × 300M / 1500M)
const EXEMPT_GAIN_EXPECTED = 128_000_000;
const R_HIGH_EXPECTED = 300_000_000 / 1_500_000_000; // 0.2

function makeA2Input(): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "A",
    rentalUnits: [
      {
        registrationDate: new Date("2018-06-01"),
        rentalType: "long-8",
        rentalAcquisitionType: "purchase",
        isApartment: false,
        region: "non-metro",
        standardPriceAtRentalStart: 250_000_000,
        rentalMonths: 96, // 8년
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
  };
}

describe("RH-A2: 거주주택 양도 12억 초과 — 고가주택 자체 검증", () => {
  it("scenarioId = 'RH-A2'", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.scenarioId).toBe("RH-A2");
  });

  it("appliedTable = 'table-2' (1세대1주택 특례표)", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.appliedTable).toBe("table-2");
  });

  it("taxableGain = 32,000,000 (gain95T2 × r_high)", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.taxableGain).toBe(TAXABLE_GAIN_EXPECTED);
  });

  it("exemptGain = 128,000,000 (gain95T2 × 12억/S)", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.exemptGain).toBe(EXEMPT_GAIN_EXPECTED);
  });

  it("formulaTrace.gain95Table2 = 160,000,000", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.gain95Table2).toBe(GAIN95_T2_EXPECTED);
  });

  it("formulaTrace.ratioHighValue ≈ 0.2 (300M/1500M)", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.ratioHighValue).toBeCloseTo(R_HIGH_EXPECTED, 10);
  });

  it("applied=true, eligibility.passed=true", () => {
    const result = calculateRentalHousingException(
      makeA2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.applied).toBe(true);
    expect(result.eligibility.passed).toBe(true);
  });
});
