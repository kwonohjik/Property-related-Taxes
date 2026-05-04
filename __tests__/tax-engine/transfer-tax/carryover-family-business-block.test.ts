/**
 * C-15: 가업상속공제 적용 자산 입력 → 엔진 방어코드 (exclusionReason=family_business)
 *
 * 실제로는 validation에서 진행 차단. 엔진 방어코드 확인용.
 * 법령: 소득세법 §97조의2 ④ (가업상속공제 자산 특례, v1 미지원)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

const C15_INPUT = baseTransferInput({
  propertyType: "housing",
  transferPrice: 1_000_000_000,
  transferDate: new Date("2025-06-01"),
  acquisitionPrice: 500_000_000,
  acquisitionDate: new Date("2020-01-01"),
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 1,
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
    donorAcquisitionPrice: 200_000_000,
    giftTaxAmount: 0,
    giftDateValuation: 500_000_000,
    exclusionDeclared: {
      isFamilyBusinessInheritedAsset: true, // ④항 가업상속공제 자산
    },
  },
});

describe("C-15: 가업상속공제 자산 → 엔진 방어코드 (§97조의2 ④)", () => {
  it("C-15-1: isEligible=false, exclusionReason=family_business", () => {
    const result = calculateTransferTax(C15_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.isEligible).toBe(false);
    expect(result.carryoverTaxationDetail?.exclusionReason).toBe("family_business");
  });

  it("C-15-2: adoptedScenario=B (이월과세 미적용, 일반 취득 처리)", () => {
    const result = calculateTransferTax(C15_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.adoptedScenario).toBe("B");
  });

  it("C-15-3: 엔진이 크래시 없이 정상 결과 반환", () => {
    expect(() => calculateTransferTax(C15_INPUT, MOCK_RATES)).not.toThrow();
  });
});
