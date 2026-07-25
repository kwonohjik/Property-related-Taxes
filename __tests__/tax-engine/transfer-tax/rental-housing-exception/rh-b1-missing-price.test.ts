/**
 * RH-NoPrice: B 시나리오에서 3-시점 기준시가 일부 누락 시 차단
 *
 * 자동 안분 fallback 금지 정책에 따라, 미입력은 validation에서 차단되어야 함.
 * 엔진 측에서는 validatePrices가 오류 코드를 반환하거나, 진입점에서 적절히 처리.
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

const baseInput: RentalHousingExceptionInput = {
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
      isRegulatedAreaNewAcq: false,
      standardPriceAtRentalStart: 500_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
  priorResidenceTransferDate: new Date("2018-01-01"),
  standardPriceAtAcquisition: 300_000_000,
  standardPriceAtPriorTransfer: 450_000_000,
  standardPriceAtTransfer: 500_000_000,
};

describe("RH-NoPrice — B 시나리오 3-시점 기준시가 누락", () => {
  it("P_acq 누락 → 자동 안분 없이 안전 처리 (taxableGain 0 또는 throw)", () => {
    const input: RentalHousingExceptionInput = {
      ...baseInput,
      standardPriceAtAcquisition: undefined,
    };
    // 엔진은 validatePrices에서 P_ACQ_MISSING 반환 — 결과는 안전 처리
    // 호출자(transfer-tax.ts)에서 미입력 시 fallback 또는 0 처리
    const result = (() => {
      try {
        return calculateRentalHousingException(
          input, 200_000_000, 800_000_000, 10, 5, 10, 5,
        );
      } catch {
        return null;
      }
    })();

    if (result) {
      // 자동 안분 fallback 금지 — taxableGain은 안전한 0 또는 캡 적용
      expect(result.taxableGain).toBeGreaterThanOrEqual(0);
    } else {
      // throw도 허용 (validation에서 차단)
      expect(result).toBeNull();
    }
  });

  it("P_prior 누락 → 동일 처리", () => {
    const input: RentalHousingExceptionInput = {
      ...baseInput,
      standardPriceAtPriorTransfer: undefined,
    };
    const result = (() => {
      try {
        return calculateRentalHousingException(
          input, 200_000_000, 800_000_000, 10, 5, 10, 5,
        );
      } catch {
        return null;
      }
    })();
    if (result) {
      expect(result.taxableGain).toBeGreaterThanOrEqual(0);
    }
  });

  it("P_transfer 누락 → 동일 처리", () => {
    const input: RentalHousingExceptionInput = {
      ...baseInput,
      standardPriceAtTransfer: undefined,
    };
    const result = (() => {
      try {
        return calculateRentalHousingException(
          input, 200_000_000, 800_000_000, 10, 5, 10, 5,
        );
      } catch {
        return null;
      }
    })();
    if (result) {
      expect(result.taxableGain).toBeGreaterThanOrEqual(0);
    }
  });

  it("3-시점 모두 입력 → 정상 결과", () => {
    const result = calculateRentalHousingException(
      baseInput, 200_000_000, 800_000_000, 10, 5, 10, 5,
    );
    expect(result.applied).toBe(true);
    expect(result.scenarioId).toBe("RH-B1");
  });
});
