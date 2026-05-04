/**
 * C-03 / C-04: 이월과세 기간 경계 anchor
 *
 * C-03: 2018.06.19 증여 + 2024.07.01 양도 → 5년 1일 초과 → 이월과세 미적용
 * C-04: 2023.06.01 증여 + 2033.07.01 양도 → 10년 1일 초과 → 이월과세 미적용
 *
 * 법령: 소득세법 §97조의2 ③ (등기부 소유기간 기준)
 * 부칙 (2022.12.31. 법률 제19196호): 2023.1.1 이후 증여분 → 10년
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

function makeCarryoverInput(
  giftRegistryDate: Date,
  transferDate: Date,
  donorAcquisitionDate: Date,
) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate,
    acquisitionPrice: 500_000_000,
    acquisitionDate: donorAcquisitionDate,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false, // 비과세 없이 전액 과세
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate,
      donorAcquisitionDate,
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 200_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 500_000_000,
    },
  });
}

describe("C-03: 5년 룰 경계 — 2018.06.19 증여 + 2024.07.01 양도 (5년 1일 초과)", () => {
  const giftDate = new Date("2018-06-19");
  const donorAcqDate = new Date("2010-01-01");
  const transferDate = new Date("2024-07-01"); // addYears(2018-06-19, 5) = 2023-06-19 초과

  it("C-03-1: 증여일 < 2023.01.01 → 5년 룰 적용", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    expect(result.carryoverTaxationDetail?.applicablePeriodYears).toBe(5);
  });

  it("C-03-2: 양도일이 증여일+5년 초과 → isEligible=false, exclusionReason=period_exceeded", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("period_exceeded");
  });

  it("C-03-3: 이월과세 미적용 → 일반 양도세 계산 (carryoverTaxation 없는 것과 동일)", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    // B 채택 (일반 취득 기준)
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
    expect(result.determinedTax).toBeGreaterThan(0);
  });
});

describe("C-03b: 5년 룰 경계 — 2018.06.19 증여 + 2023.06.19 양도 (정확히 5년 = 적용)", () => {
  const giftDate = new Date("2018-06-19");
  const donorAcqDate = new Date("2010-01-01");
  const transferDate = new Date("2023-06-19"); // 정확히 5년

  it("C-03b-1: 정확히 5년 = 기간 이내 → isEligible=true (경계값)", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    // transferDate <= limitDate (2023-06-19 <= 2023-06-19) → 이월과세 적용
    expect(result.carryoverTaxationDetail?.isEligible).toBe(true);
  });
});

describe("C-04: 10년 룰 경계 — 2023.06.01 증여 + 2033.07.01 양도 (10년 1일 초과)", () => {
  const giftDate = new Date("2023-06-01");
  const donorAcqDate = new Date("2010-01-01");
  const transferDate = new Date("2033-07-01"); // addYears(2023-06-01, 10) = 2033-06-01 초과

  it("C-04-1: 증여일 >= 2023.01.01 → 10년 룰 적용", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    expect(result.carryoverTaxationDetail?.applicablePeriodYears).toBe(10);
  });

  it("C-04-2: 양도일이 증여일+10년 초과 → isEligible=false, exclusionReason=period_exceeded", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("period_exceeded");
  });

  it("C-04-3: 이월과세 미적용 → B 채택 (일반 취득 기준)", () => {
    const result = calculateTransferTax(
      makeCarryoverInput(giftDate, transferDate, donorAcqDate),
      MOCK_RATES,
    );
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });
});
