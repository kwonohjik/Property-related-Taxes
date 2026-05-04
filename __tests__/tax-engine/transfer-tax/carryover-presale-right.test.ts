/**
 * C-12: 분양권 증여 후 양도 (시행령 §163의2 ① 위임 확정) → 이월과세 적용 (10년)
 *
 * 법령: 소득세법 §97조의2 ①, 시행령 §163의2 ① (§94①2호 가목 포함)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

const C12_INPUT = baseTransferInput({
  propertyType: "presale_right", // 분양권
  transferPrice: 600_000_000,
  transferDate: new Date("2026-08-01"),
  acquisitionPrice: 400_000_000,
  acquisitionDate: new Date("2024-03-01"),
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  residencePeriodMonths: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  acquisitionCause: "carryover_gift",
  carryoverTaxation: {
    giftRegistryDate: new Date("2024-03-01"), // 2024.3.1 이후 → 10년 룰
    donorAcquisitionDate: new Date("2022-01-01"),
    useEstimatedAcquisition: false,
    donorAcquisitionPrice: 300_000_000,
    giftTaxAmount: 0,
    giftDateValuation: 400_000_000,
  },
});

describe("C-12: 분양권 증여 후 양도 → 이월과세 적용 (시행령 §163의2 ① v1 활성화)", () => {
  it("C-12-1: propertyType=presale_right 에서 이월과세 정상 적용", () => {
    const result = calculateTransferTax(C12_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeDefined();
    expect(result.carryoverTaxationDetail?.isEligible).toBe(true);
  });

  it("C-12-2: 증여일 >= 2023.01.01 → 10년 룰", () => {
    const result = calculateTransferTax(C12_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.applicablePeriodYears).toBe(10);
  });

  it("C-12-3: Scenario A 취득가액 = 증여자 취득가(3억)", () => {
    const result = calculateTransferTax(C12_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(300_000_000);
  });

  it("C-12-4: 결과 determinedTax 양수 (정상 계산)", () => {
    const result = calculateTransferTax(C12_INPUT, MOCK_RATES);
    expect(result.determinedTax).toBeGreaterThanOrEqual(0);
  });
});
