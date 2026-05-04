/**
 * C-06 / C-06b: 적용배제 ②2호 — 1세대1주택 비과세 사용자 체크
 *
 * C-06: 1세대1주택 비과세 사용자 체크 → 이월과세 적용배제 ②2호, 일반 양도세
 * C-06b: 12억 초과 고가주택(1세대1주택) 사용자 체크 → 동일 적용배제
 *
 * 법령: 소득세법 §97조의2 ② 2호 (§89①3호 각 목, 고가주택 포함)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

function makeOneHouseExclusionInput(transferPrice: number) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice,
    transferDate: new Date("2025-06-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2020-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 36,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2022-01-01"),
      donorAcquisitionDate: new Date("2015-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 200_000_000,
      giftTaxAmount: 10_000_000,
      giftDateValuation: 500_000_000,
      exclusionDeclared: {
        oneHouseExemptionApplies: true, // ②2호 사용자 선언
      },
    },
  });
}

describe("C-06: 1세대1주택 비과세 사용자 체크 → 이월과세 적용배제 (§97조의2 ② 2호)", () => {
  it("C-06-1: isEligible=false, exclusionReason=one_house_exemption", () => {
    const result = calculateTransferTax(makeOneHouseExclusionInput(1_000_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
  });

  it("C-06-2: adoptedScenario=B (일반 취득으로 처리)", () => {
    const result = calculateTransferTax(makeOneHouseExclusionInput(1_000_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });

  it("C-06-3: comparisonExclusion=false (비교과세가 아닌 ②2호 배제)", () => {
    const result = calculateTransferTax(makeOneHouseExclusionInput(1_000_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.comparisonExclusion).toBe(false);
  });
});

describe("C-06b: 12억 초과 고가주택 사용자 체크 → 이월과세 적용배제 (§97조의2 ② 2호 괄호)", () => {
  it("C-06b-1: 양도가 12억 초과 + oneHouseExemptionApplies=true → isEligible=false", () => {
    const result = calculateTransferTax(makeOneHouseExclusionInput(1_500_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("one_house_exemption");
  });

  it("C-06b-2: adoptedScenario=B (고가주택이어도 ②2호 배제 시 일반 취득 처리)", () => {
    const result = calculateTransferTax(makeOneHouseExclusionInput(1_500_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });
});
