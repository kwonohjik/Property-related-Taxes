/**
 * RH-Cap: §161③ 캡 발동 — ①·② 결과가 §95①(표1) 양도소득금액을 초과
 *
 * 시나리오: 기준시가가 비현실적으로 변동하여 §161① 비율이 1을 초과하는 경우
 * 예: P_acq=100, P_prior=300, P_transfer=200 (역행)
 *
 * 단, validatePrices에서 P_transfer >= P_acq 등 최소 검증을 한다면 일부 케이스가
 * eligibility 단계에서 차단될 수 있음. validation을 통과하더라도 안전망으로 캡 적용 검증.
 *
 * Design 결정: B1은 taxable ≤ gain95(표1) 단순 캡, B2는 호별 분리 캡 (a)안.
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

describe("RH-Cap — §161③ 캡 발동 검증", () => {
  it("B1 정상 케이스 — 캡 미발동 (capApplied = false)", () => {
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
      standardPriceAtAcquisition: 300_000_000,
      standardPriceAtPriorTransfer: 400_000_000,
      standardPriceAtTransfer: 500_000_000,
    };
    const result = calculateRentalHousingException(
      input, 200_000_000, 800_000_000, 10, 5, 10, 5,
    );
    expect(result.formulaTrace.capApplied).toBe(false);
    expect(result.taxableGain).toBeLessThanOrEqual(result.formulaTrace.gain95Table1);
  });

  it("B1 — taxableGain은 항상 gain95(표1) 이하 (Design (a) 캡)", () => {
    // 정상 비율 0.5 케이스
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
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtPriorTransfer: 400_000_000,
      standardPriceAtTransfer: 600_000_000,
    };
    const result = calculateRentalHousingException(
      input, 100_000_000, 800_000_000, 10, 5, 10, 5,
    );
    // 비율 = 200/400 = 0.5
    // gain95T1 = 100M − (10×2% × 100M) = 100M − 20M = 80M
    // taxableGain = 80M × 0.5 = 40,000,000
    expect(result.taxableGain).toBe(40_000_000);
    expect(result.taxableGain).toBeLessThanOrEqual(result.formulaTrace.gain95Table1);
  });

  it("B2 — part1·part2는 각 표 §95①을 초과하지 않음 (호별 분리 캡)", () => {
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
      input, 600_000_000, 1_500_000_000, 15, 5, 15, 5,
    );

    expect(result.formulaTrace.part1).toBeLessThanOrEqual(result.formulaTrace.gain95Table1);
    expect(result.formulaTrace.part2).toBeLessThanOrEqual(result.formulaTrace.gain95Table2);
  });
});
