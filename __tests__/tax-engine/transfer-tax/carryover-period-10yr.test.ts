/**
 * C-02: 2023.1.1 이후 증여 + 7년차 양도 → 10년 룰 적용 (이월과세 적용)
 *
 * 법령: 부칙 (2022.12.31. 법률 제19196호) + 소득세법 §97조의2 ①
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

describe("C-02: 2023.1.1 이후 증여 + 7년차 양도 → 10년 룰 적용", () => {
  const giftDate = new Date("2023-06-01");   // 2023.1.1 이후 → 10년 룰
  const transferDate = new Date("2030-05-31"); // 7년 미만 → 이월과세 적용
  const donorAcqDate = new Date("2010-01-01"); // 증여자 취득일 (20년 보유)

  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate,
    acquisitionPrice: 700_000_000,
    acquisitionDate: donorAcqDate,
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false, // 비과세 없이 전액 과세 → 양도차익 비교 의미 있음
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: giftDate,
      donorAcquisitionDate: donorAcqDate,
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 300_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 700_000_000,
    },
  });

  it("C-02-1: 증여일 >= 2023.01.01 → applicablePeriodYears = 10", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.applicablePeriodYears).toBe(10);
  });

  it("C-02-2: 7년차 양도 = 10년 이내 → isEligible = true", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(true);
  });

  it("C-02-3: Scenario A 취득가액 = 증여자 취득가액(3억)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(300_000_000);
  });

  it("C-02-4: Scenario B 취득가액 = 증여 당시 평가액(7억)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.acquisitionPrice).toBe(700_000_000);
  });

  it("C-02-5: 증여자 취득일 기산 보유연수 = 20년 (2010.01.01 ~ 2030.05.31)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    // 2010.01.01 ~ 2030.05.31 = 20년 5개월 → 20년
    expect(result.carryoverTaxationDetail?.scenarioA.holdingPeriodYears).toBe(20);
  });

  it("C-02-6: Scenario A 양도차익이 Scenario B보다 큼 (증여자 취득가 낮아 차익 큼)", () => {
    const result = calculateTransferTax(input, MOCK_RATES);
    const detail = result.carryoverTaxationDetail!;
    expect(detail.scenarioA.transferGain).toBeGreaterThan(detail.scenarioB.transferGain);
  });
});
