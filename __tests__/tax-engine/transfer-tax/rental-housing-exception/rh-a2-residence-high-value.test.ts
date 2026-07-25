/**
 * RH-A2: 임대주택 보유 + 자가 고가주택 양도 (양도가 15억)
 *
 * 적용 산식: gain95(표2) × (S − 12억) / S
 * 적용 표: §95② 표2
 *
 * 검증값:
 *   gain = 500,000,000
 *   holdYears = 10, liveYears = 10
 *   표2 공제율 = 10×4% + 10×4% = 80%
 *   ltcTable2 = 500M × 0.80 = 400,000,000
 *   gain95Table2 = 100,000,000
 *   r_high = (15억 − 12억) / 15억 = 0.2
 *   taxableGain = 100,000,000 × 0.2 = 20,000,000
 *   exemptGain = 100,000,000 × 12억/15억 = 80,000,000
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

describe("RH-A2 — 거주주택 고가주택 양도 (12억 초과)", () => {
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
        isRegulatedAreaNewAcq: false,
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
    /* gain */ 500_000_000,
    /* S */ 1_500_000_000, // 15억
    /* holdYears */ 10,
    /* liveYears */ 10,
    /* residenceHoldYears */ 10,
    /* residenceLiveYears */ 10,
  );

  it("scenarioId = 'RH-A2'", () => {
    expect(result.scenarioId).toBe("RH-A2");
  });

  it("appliedTable = 'table-2'", () => {
    expect(result.appliedTable).toBe("table-2");
  });

  it("gain95Table2 = 100,000,000 (500M × (1 − 0.80))", () => {
    expect(result.formulaTrace.gain95Table2).toBe(100_000_000);
  });

  it("ratioHighValue = 0.2 ((15억 − 12억) / 15억)", () => {
    expect(result.formulaTrace.ratioHighValue).toBeCloseTo(0.2, 10);
  });

  it("taxableGain = 20,000,000 (100M × 0.2)", () => {
    expect(result.taxableGain).toBe(20_000_000);
  });

  it("exemptGain = 80,000,000 (100M − 20M)", () => {
    expect(result.exemptGain).toBe(80_000_000);
  });

  it("applied = true", () => {
    expect(result.applied).toBe(true);
  });
});
