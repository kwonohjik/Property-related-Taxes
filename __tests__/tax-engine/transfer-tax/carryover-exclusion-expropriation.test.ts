/**
 * C-07: 사업인정고시일 2년 이전 증여 토지 수용 → 이월과세 적용배제 ②1호
 *
 * 법령: 소득세법 §97조의2 ② 1호
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

const C07_INPUT = baseTransferInput({
  propertyType: "land",
  transferPrice: 500_000_000,
  transferDate: new Date("2025-01-01"),
  acquisitionPrice: 300_000_000,
  acquisitionDate: new Date("2020-01-01"),
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
    giftRegistryDate: new Date("2022-01-01"),
    donorAcquisitionDate: new Date("2015-01-01"),
    useEstimatedAcquisition: false,
    donorAcquisitionPrice: 100_000_000,
    giftTaxAmount: 0,
    giftDateValuation: 300_000_000,
    exclusionDeclared: {
      expropriationWithin2Years: true, // ②1호 사용자 선언
    },
  },
});

describe("C-07: 사업인정고시일 2년 이전 증여 토지 수용 → 이월과세 적용배제 (§97조의2 ② 1호)", () => {
  it("C-07-1: isEligible=false, exclusionReason=expropriation", () => {
    const result = calculateTransferTax(C07_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("expropriation");
  });

  it("C-07-2: adoptedScenario=B (일반 취득으로 처리)", () => {
    const result = calculateTransferTax(C07_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });

  it("C-07-3: comparisonExclusion=false (비교과세 아닌 ②1호 배제)", () => {
    const result = calculateTransferTax(C07_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.comparisonExclusion).toBe(false);
  });
});
