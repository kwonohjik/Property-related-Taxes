/**
 * RH-B2: PHRP 양도 (양도가 15억, 고가주택)
 *
 * 적용 산식 (§161②):
 *   1호 (이전 보유분, 표1): gain95(표1) × (P_prior − P_acq) / (P_transfer − P_acq)
 *   2호 (이후 보유분, 표2): gain95(표2) × (P_transfer − P_prior) / (P_transfer − P_acq) × (S − 12억)/S
 *   합산 = part1 + part2
 *
 * 검증값:
 *   gain = 600,000,000
 *   holdYears = 15, liveYears = 5
 *   표1: 15×2% = 30% (cap), ltcT1 = 180,000,000, gain95T1 = 420,000,000
 *   표2: 15×4% + 5×4% = 80% (cap), ltcT2 = 480,000,000, gain95T2 = 120,000,000
 *
 *   P_acq=400M, P_prior=600M, P_transfer=1,000M
 *   r161_1 = 200/600 = 1/3 ≈ 0.3333
 *   r161_2_2 = 400/600 = 2/3 ≈ 0.6667
 *   r_high = (15억 − 12억) / 15억 = 0.2
 *
 *   part1 = 420,000,000 × 200 / 600 = 140,000,000
 *   part2 = 120,000,000 × 400 / 600 × (3억/15억)
 *         = 120,000,000 × 400 / 600 = 80,000,000 (1차)
 *         80,000,000 × 0.2 = 16,000,000 (최종)
 *   taxableGain = 140,000,000 + 16,000,000 = 156,000,000
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

describe("RH-B2 — PHRP 고가주택 양도 (12억 초과, §161② 1호+2호 합산)", () => {
  const input: RentalHousingExceptionInput = {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
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
      },
    ],
    priorResidenceTransferDate: new Date("2018-01-01"),
    standardPriceAtAcquisition: 400_000_000,
    standardPriceAtPriorTransfer: 600_000_000,
    standardPriceAtTransfer: 1_000_000_000,
  };

  const result = calculateRentalHousingException(
    input,
    /* gain */ 600_000_000,
    /* S */ 1_500_000_000,
    /* holdYears */ 15,
    /* liveYears */ 10, // 거주 10년 → 표2 80% 캡 도달 (15×4%=40+10×4%=40=80%)
    /* residenceHoldYears */ 15,
    /* residenceLiveYears */ 10,
  );

  it("scenarioId = 'RH-B2'", () => {
    expect(result.scenarioId).toBe("RH-B2");
  });

  it("appliedTable = 'mixed' (표1 + 표2)", () => {
    expect(result.appliedTable).toBe("mixed");
  });

  it("gain95Table1 = 420,000,000 (표1·30%)", () => {
    expect(result.formulaTrace.gain95Table1).toBe(420_000_000);
  });

  it("gain95Table2 = 120,000,000 (표2·80%)", () => {
    expect(result.formulaTrace.gain95Table2).toBe(120_000_000);
  });

  it("ratio161_1 = 1/3 (1호 비율)", () => {
    expect(result.formulaTrace.ratio161_1).toBeCloseTo(1 / 3, 10);
  });

  it("ratio161_2_2 = 2/3 (2호 비율)", () => {
    expect(result.formulaTrace.ratio161_2_2).toBeCloseTo(2 / 3, 10);
  });

  it("ratioHighValue = 0.2 (고가주택 비율)", () => {
    expect(result.formulaTrace.ratioHighValue).toBeCloseTo(0.2, 10);
  });

  it("part1 (§161②1호) = 140,000,000", () => {
    expect(result.formulaTrace.part1).toBe(140_000_000);
  });

  it("part2 (§161②2호) = 16,000,000", () => {
    expect(result.formulaTrace.part2).toBe(16_000_000);
  });

  it("taxableGain = 156,000,000 (part1 + part2)", () => {
    expect(result.taxableGain).toBe(156_000_000);
  });

  it("applied = true", () => {
    expect(result.applied).toBe(true);
  });
});
