/**
 * B 시나리오 3-시점 기준시가 미입력 → 차단 테스트
 *
 * 자동 안분 fallback 금지 정책: 미입력 필드는 validation 오류로 차단.
 * (CLAUDE.md: "자동 안분 fallback 금지" 정책 — feedback_no_silent_apportion_fallback.md)
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";
import { validatePrices } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/prhp-allocation";

// ============================================================
// validatePrices 단위 테스트
// ============================================================

describe("validatePrices — 미입력 차단", () => {
  it("P_acq 미입력(undefined) → P_ACQ_MISSING", () => {
    const result = validatePrices(undefined, 450_000_000, 500_000_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("P_ACQ_MISSING");
  });

  it("P_acq = 0 → P_ACQ_MISSING", () => {
    const result = validatePrices(0, 450_000_000, 500_000_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("P_ACQ_MISSING");
  });

  it("P_prior 미입력(undefined) → P_PRIOR_MISSING", () => {
    const result = validatePrices(300_000_000, undefined, 500_000_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("P_PRIOR_MISSING");
  });

  it("P_transfer 미입력(undefined) → P_TRANSFER_MISSING", () => {
    const result = validatePrices(300_000_000, 450_000_000, undefined);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("P_TRANSFER_MISSING");
  });

  it("P_transfer === P_acq → DENOMINATOR_ZERO", () => {
    const result = validatePrices(500_000_000, 450_000_000, 500_000_000);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.error).toBe("DENOMINATOR_ZERO");
  });

  it("모두 유효한 입력 → valid=true", () => {
    const result = validatePrices(300_000_000, 450_000_000, 500_000_000);
    expect(result.valid).toBe(true);
  });
});

// ============================================================
// calculateRentalHousingException — B 시나리오 미입력 차단
// ============================================================

function makeBaseBInput(overrides: Partial<RentalHousingExceptionInput> = {}): RentalHousingExceptionInput {
  return {
    applyException: true,
    scenario: "B",
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
        hasMinimum2Units: false,
        rentalMonths: 96,
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: new Date("2016-08-25"),
    standardPriceAtAcquisition: 300_000_000,
    standardPriceAtPriorTransfer: 450_000_000,
    standardPriceAtTransfer: 500_000_000,
    ...overrides,
  };
}

describe("calculateRentalHousingException B 시나리오 — 기준시가 미입력 차단", () => {
  const GAIN = 311_000_000;
  const S = 800_000_000;
  const HOLD_YEARS = 13;
  const LIVE_YEARS = 2;

  it("P_acq 미입력 → applied=false (fallback 없음)", () => {
    const input = makeBaseBInput({ standardPriceAtAcquisition: undefined });
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(false);
    expect(result.eligibility.passed).toBe(false);
  });

  it("P_prior 미입력 → applied=false", () => {
    const input = makeBaseBInput({ standardPriceAtPriorTransfer: undefined });
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(false);
  });

  it("P_transfer 미입력 → applied=false", () => {
    const input = makeBaseBInput({ standardPriceAtTransfer: undefined });
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(false);
  });

  it("priorResidenceTransferDate 미입력 → applied=false", () => {
    const input = makeBaseBInput({ priorResidenceTransferDate: undefined });
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(false);
  });

  it("P_transfer = P_acq → DENOMINATOR_ZERO → applied=false", () => {
    const input = makeBaseBInput({
      standardPriceAtAcquisition: 500_000_000,
      standardPriceAtTransfer: 500_000_000,
    });
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(false);
  });

  it("모두 유효한 입력 → applied=true (회귀)", () => {
    const input = makeBaseBInput();
    const result = calculateRentalHousingException(
      input, GAIN, S, HOLD_YEARS, LIVE_YEARS, 13, 2,
    );
    expect(result.applied).toBe(true);
    expect(result.taxableGain).toBe(172_605_000); // PDF#1 anchor
  });
});
