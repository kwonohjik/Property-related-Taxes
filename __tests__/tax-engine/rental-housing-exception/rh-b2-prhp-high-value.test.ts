/**
 * RH-B2: PHRP 양도 (12억 초과 = 고가주택) — 자체 검증값
 *
 * §161② 1호·2호 합산 + §161④ 표1·표2 분리
 *
 * 입력:
 *   gain = 600,000,000, S = 1,500,000,000 (15억)
 *   holdYears = 12, liveYears = 6
 *   P_acq = 400,000,000, P_prior = 700,000,000, P_transfer = 1,000,000,000
 *
 * 표1 (일반, §161②1호용):
 *   rate = min(12 × 0.02, 0.30) = 0.24
 *   ltcT1 = floor(600M × 0.24) = 144,000,000
 *   gain95T1 = 600M − 144M = 456,000,000
 *
 * 표2 (1세대1주택, §161②2호용):
 *   holdPart = min(12×0.04, 0.40) = 0.40 (40% 캡)
 *   livePart = min(6×0.04, 0.40) = 0.24
 *   rate = min(0.40+0.24, 0.80) = 0.64
 *   ltcT2 = floor(600M × 0.64) = 384,000,000
 *   gain95T2 = 600M − 384M = 216,000,000
 *
 * §161② 1호:
 *   numerator1 = 700M − 400M = 300,000,000
 *   denominator = 1000M − 400M = 600,000,000
 *   r161_1 = 300M / 600M = 0.5
 *   part1 = floor(456M × 300M / 600M) = floor(228,000,000) = 228,000,000
 *
 * §161② 2호:
 *   numerator2 = 1000M − 700M = 300,000,000
 *   r161_2_2 = 300M / 600M = 0.5
 *   part2_before_high = floor(216M × 300M / 600M) = floor(108,000,000) = 108,000,000
 *   highNumerator = 1500M − 1200M = 300,000,000
 *   part2 = floor(108M × 300M / 1500M) = floor(21,600,000) = 21,600,000
 *
 * taxableGain = 228,000,000 + 21,600,000 = 249,600,000
 *
 * §161③ 캡 검증:
 *   part1 (228M) ≤ gain95T1 (456M) → 캡 미발동
 *   part2 (21.6M) ≤ gain95T2 (216M) → 캡 미발동
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

const GAIN = 600_000_000;
const S = 1_500_000_000; // 15억
const HOLD_YEARS = 12;
const LIVE_YEARS = 6;

const P_ACQ = 400_000_000;
const P_PRIOR = 700_000_000;
const P_TRANSFER = 1_000_000_000;

// 자체 검증값
// holdPart = min(12×0.04, 0.40) = 0.40, livePart = min(6×0.04, 0.40) = 0.24 → rate2 = 0.64
const GAIN95_T1_EXPECTED = 456_000_000; // 600M − floor(600M × 0.24)
const GAIN95_T2_EXPECTED = 216_000_000; // 600M − floor(600M × 0.64) = 600M − 384M
const PART1_EXPECTED = 228_000_000;     // floor(456M × 300M / 600M)
const PART2_EXPECTED = 21_600_000;      // floor(floor(216M × 300M / 600M) × 300M / 1500M)
const TAXABLE_GAIN_EXPECTED = 249_600_000; // 228M + 21.6M

function makeB2Input(): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
        businessRegistrationDate: new Date("2017-01-01"),
        rentalRegistrationDate: new Date("2017-01-01"),
        rentalCategory: "long_general",
        rentalAcquisitionType: "purchase",
        isApartment: false,
        region: "non-metro",
        isExcluded918Rule: false,
        standardPriceAtRentalStart: 200_000_000,
        hasMinimum2Units: false,
        rentalMonths: 96, // 8년
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: new Date("2019-06-01"),
    standardPriceAtAcquisition: P_ACQ,
    standardPriceAtPriorTransfer: P_PRIOR,
    standardPriceAtTransfer: P_TRANSFER,
  };
}

describe("RH-B2: PHRP 양도 12억 초과 — §161② 1호+2호 합산 자체 검증", () => {
  it("scenarioId = 'RH-B2'", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.scenarioId).toBe("RH-B2");
  });

  it("appliedTable = 'mixed' (표1+표2 각각 적용)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.appliedTable).toBe("mixed");
  });

  it("gain95Table1 = 456,000,000 (표1 공제율 24%)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.gain95Table1).toBe(GAIN95_T1_EXPECTED);
  });

  it("gain95Table2 = 168,000,000 (표2 공제율 72%)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.gain95Table2).toBe(GAIN95_T2_EXPECTED);
  });

  it("part1 = 228,000,000 (§161②1호 — 표1 × r161_1)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.part1).toBe(PART1_EXPECTED);
  });

  it("part2 = 16,800,000 (§161②2호 — 표2 × r161_2_2 × r_high)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.part2).toBe(PART2_EXPECTED);
  });

  it("taxableGain = 244,800,000 (part1 + part2)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.taxableGain).toBe(TAXABLE_GAIN_EXPECTED);
  });

  it("capApplied = false (캡 미발동)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.capApplied).toBe(false);
  });

  it("ratio161_1 = 0.5 (300M/600M)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.ratio161_1).toBe(0.5);
  });

  it("ratio161_2_2 = 0.5 (300M/600M)", () => {
    const result = calculateRentalHousingException(
      makeB2Input(),
      GAIN, S, HOLD_YEARS, LIVE_YEARS,
      10, 5,
    );
    expect(result.formulaTrace.ratio161_2_2).toBe(0.5);
  });
});
