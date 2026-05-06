/**
 * RH-ResidencePeriodFail: 거주주택 거주기간 0개월 → applied=false 검증
 *
 * 침묵 실패(Silent Failure) 회귀 차단 anchor.
 * 사용자 발견 버그(2026-05-05): 거주기간 미입력 시 양도소득금액 230,140,000을
 * 그대로 과세하여 산출세액이 잘못 계산되는 문제.
 *
 * 검증 포인트:
 *   1. liveYears = 0 → eligibility.passed = false
 *   2. result.applied = false
 *   3. residenceFailReasons에 "거주기간 2년 미충족" 포함
 *   4. taxableGain = 0 (미적용 시 기본값)
 *   5. liveYears = 24 → applied = true (정상 적용)
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
      registrationDate: new Date("2014-01-01"),
      rentalType: "long-8",
      rentalAcquisitionType: "purchase",
      isApartment: true,
      region: "seoul-metro",
      standardPriceAtRentalStart: 500_000_000,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
  priorResidenceTransferDate: new Date("2016-08-25"),
  standardPriceAtAcquisition: 300_000_000,
  standardPriceAtPriorTransfer: 450_000_000,
  standardPriceAtTransfer: 500_000_000,
};

describe("RH-ResidencePeriodFail — 거주주택 거주기간 미달 침묵 실패 차단", () => {
  it("거주연수 0년 (residencePeriodMonths 미입력) → applied = false", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000, // gain
      800_000_000, // S
      13, // holdYears (PHRP 보유)
      0, // liveYears (PHRP 거주) — 미입력 케이스
      13, // residenceHoldYears (거주주택 보유)
      0, // residenceLiveYears (거주주택 거주) — 0개월 시뮬
    );
    expect(result.applied).toBe(false);
    expect(result.eligibility.passed).toBe(false);
  });

  it("미적용 시 residenceFailReasons에 거주기간 2년 미충족 사유 포함", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000,
      800_000_000,
      13,
      0,
      13,
      0,
    );
    const joined = result.eligibility.residenceFailReasons.join(" · ");
    expect(joined).toContain("거주기간");
    expect(joined).toContain("2년");
  });

  it("미적용 시 taxableGain = 0 (호출자가 일반 산식으로 fall-through)", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000,
      800_000_000,
      13,
      0,
      13,
      0,
    );
    expect(result.taxableGain).toBe(0);
  });

  it("거주연수 1년 (24개월 미만) → applied = false", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000,
      800_000_000,
      13,
      1,
      13,
      1,
    );
    expect(result.applied).toBe(false);
  });

  it("거주연수 2년 (24개월 이상) → applied = true + 사례문제 anchor 일치", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000,
      800_000_000,
      13,
      2,
      13,
      2,
    );
    expect(result.applied).toBe(true);
    expect(result.scenarioId).toBe("RH-B1");
    // 사례문제 PDF#1 anchor 재확인 (172,605,000)
    expect(result.taxableGain).toBe(172_605_000);
  });

  it("거주주택 보유 2년 미만 → applied = false (residenceHoldYears 검증)", () => {
    const result = calculateRentalHousingException(
      baseInput,
      311_000_000,
      800_000_000,
      13,
      2,
      1, // residenceHoldYears = 1년 (2년 미만)
      2,
    );
    expect(result.applied).toBe(false);
  });
});
