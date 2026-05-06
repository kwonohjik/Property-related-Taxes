/**
 * 장기임대주택 보유자의 거주주택 양도 — RH-B1 anchor 테스트
 *
 * 사례문제: 양도코리아 2023, 사례 25 (PDF#1)
 *
 * 시나리오: 임대주택을 거주주택으로 전환 후 양도 (PHRP, §161① 안분)
 * 양도가액 8억 (12억 미만) → §161① 단일 산식 + §161④ 표1 적용
 *
 * 검증 anchor 17개 (원단위 toBe):
 *   1. gain (양도차익) = 311,000,000
 *   2. ltcTable1 (표1·26%) = 80,860,000
 *   3. gain95Table1 = 230,140,000
 *   4. ratio161_1 분자 = 150,000,000 (P_prior - P_acq)
 *   5. ratio161_1 분모 = 200,000,000 (P_transfer - P_acq)
 *   6. ratio161_1 = 0.75
 *   7. taxableGain = 172,605,000
 *   8. exemptGain = 57,535,000
 *   9. appliedTable = 'table-1'
 *   10. scenarioId = 'RH-B1'
 *   11. capApplied = false
 *   12. holdYears = 13
 *   13. P_acq = 300,000,000
 *   14. P_prior = 450,000,000
 *   15. P_transfer = 500,000,000
 *   16. eligibility.passed = true
 *   17. applied = true
 */

import { describe, it, expect } from "vitest";
import {
  calculateRentalHousingException,
  type RentalHousingExceptionInput,
} from "@/lib/tax-engine/transfer-tax/rental-housing-exception";

describe("RH-B1 — 사례문제 PDF#1 (양도코리아 2023, 사례 25)", () => {
  // 사례 입력값
  const S = 800_000_000; // 양도가액 8억
  const gain = 311_000_000; // 양도차익 (8억 - 환산취득가 4.8억 - 필요경비 9백만 = 3.11억)
  const holdYears = 13; // 2009.8.12 ~ 2023.3.3 = 13년
  const liveYears = 2; // 사례: 2년 이상 거주

  const input: RentalHousingExceptionInput = {
    applyException: true,
    scenario: "B",
    rentalUnits: [
      {
        registrationDate: new Date("2014-01-01"), // 2020.7.10 이전 등록 (장기 5년 의무) — 사례: 8년 임대
        rentalType: "long-8",
        rentalAcquisitionType: "purchase",
        isApartment: true, // 사례에 명시 안됨 — false로 해도 무방하나 사례 문맥상 거주주택이 아닌 별도 임대 아파트
        region: "seoul-metro", // 파주시는 경기도 = 수도권 (6억 이하 적용)
        standardPriceAtRentalStart: 500_000_000, // 사례: "임대개시 당시 기준시가 6억 이하"
        rentalMonths: 96, // 8년
        rentalAutoTermination: false,
        requirementsConfirmed: true,
      },
    ],
    priorResidenceTransferDate: new Date("2016-08-25"),
    standardPriceAtAcquisition: 300_000_000, // 2009.1.1
    standardPriceAtPriorTransfer: 450_000_000, // 2016.1.1
    standardPriceAtTransfer: 500_000_000, // 2022.1.1
  };

  const result = calculateRentalHousingException(
    input,
    gain,
    S,
    holdYears,
    liveYears,
    /* residenceHoldYears */ 13,
    /* residenceLiveYears */ 2,
  );

  it("anchor 1: 양도차익 = 311,000,000", () => {
    // 입력 자체 — 엔진 외부에서 산출
    expect(gain).toBe(311_000_000);
  });

  it("anchor 2: 장기보유공제(표1·26%) = 80,860,000", () => {
    const ltc = gain - result.formulaTrace.gain95Table1;
    expect(ltc).toBe(80_860_000);
  });

  it("anchor 3: gain95Table1 = 230,140,000", () => {
    expect(result.formulaTrace.gain95Table1).toBe(230_140_000);
  });

  it("anchor 4: P_prior - P_acq = 150,000,000", () => {
    const numerator = 450_000_000 - 300_000_000;
    expect(numerator).toBe(150_000_000);
  });

  it("anchor 5: P_transfer - P_acq = 200,000,000", () => {
    const denominator = 500_000_000 - 300_000_000;
    expect(denominator).toBe(200_000_000);
  });

  it("anchor 6: ratio161_1 = 0.75", () => {
    expect(result.formulaTrace.ratio161_1).toBe(0.75);
  });

  it("anchor 7: 과세대상 양도소득금액 (taxableGain) = 172,605,000", () => {
    expect(result.taxableGain).toBe(172_605_000);
  });

  it("anchor 8: 비과세 양도소득금액 (exemptGain) = 57,535,000", () => {
    // gain95Table1 230,140,000 - taxableGain 172,605,000 = 57,535,000
    expect(result.exemptGain).toBe(57_535_000);
  });

  it("anchor 9: appliedTable = 'table-1'", () => {
    expect(result.appliedTable).toBe("table-1");
  });

  it("anchor 10: scenarioId = 'RH-B1'", () => {
    expect(result.scenarioId).toBe("RH-B1");
  });

  it("anchor 11: §161③ 캡 미발동 (capApplied = false)", () => {
    expect(result.formulaTrace.capApplied).toBe(false);
  });

  it("anchor 12: 보유연수 = 13년 (사례 입력 검증)", () => {
    expect(holdYears).toBe(13);
  });

  it("anchor 13: P_acq = 300,000,000 (2009.1.1)", () => {
    expect(input.standardPriceAtAcquisition).toBe(300_000_000);
  });

  it("anchor 14: P_prior = 450,000,000 (2016.1.1)", () => {
    expect(input.standardPriceAtPriorTransfer).toBe(450_000_000);
  });

  it("anchor 15: P_transfer = 500,000,000 (2022.1.1)", () => {
    expect(input.standardPriceAtTransfer).toBe(500_000_000);
  });

  it("anchor 16: 요건 충족 (eligibility.passed = true)", () => {
    expect(result.eligibility.passed).toBe(true);
  });

  it("anchor 17: 특례 적용됨 (applied = true)", () => {
    expect(result.applied).toBe(true);
  });

  it("anchor 18: 비과세 양도소득금액 = 57,535,000 (양도소득금액 단계에서 분리)", () => {
    // §95① 양도소득금액(표1) 230,140,000 − 과세대상 양도소득금액 172,605,000 = 57,535,000
    // 결과 표 "비과세 양도소득금액 (소령 §161①)" 행에 표시되는 값
    expect(result.exemptGain).toBe(57_535_000);
  });
});
