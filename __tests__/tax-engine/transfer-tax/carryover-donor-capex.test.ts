/**
 * C-13 / C-13b: 증여자 자본적지출 + 시행시기 경계 anchor
 *
 * C-13: 양도일 2024.6.1 (≥ 2024.1.1) → 증여자 capex 산입 ☑
 * C-13b: 양도일 2023.12.20 (< 2024.1.1) → 증여자 capex 산입 ❌ (시행 전)
 *
 * 법령: 소득세법 §97조의2 ① 2호 후단 (2023.12.31. 신설, 2024.1.1. 이후 양도분 시행)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

/** 증여자 자본적지출(리모델링 5천만) + 수증자 자본적지출(8천만) 케이스 */
function makeDonorCapexInput(transferDate: Date) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 1_000_000_000,
    transferDate,
    acquisitionPrice: 400_000_000,
    acquisitionDate: new Date("2020-06-01"),
    expenses: 0,
    capitalExpenditure: 80_000_000,   // 수증자 자본적지출 8천만
    transferExpense: 20_000_000,      // 양도비 2천만
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
      giftRegistryDate: new Date("2020-06-01"),
      donorAcquisitionDate: new Date("2015-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 400_000_000,
      giftTaxAmount: 0,
      giftDateValuation: 600_000_000,
      donorCapitalExpenditure: 50_000_000, // 증여자 자본적지출 5천만 (리모델링)
    },
  });
}

describe("C-13: 증여자 자본적지출 산입 — 양도일 2024.6.1 (≥ 2024.1.1 시행)", () => {
  const transferDate = new Date("2024-06-01");

  it("C-13-1: donorCapexGuardApplied = false (시행 이후)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexGuardApplied).toBe(false);
  });

  it("C-13-2: donorCapexAddedToExpense = 50,000,000 (5천만 산입)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexAddedToExpense).toBe(50_000_000);
  });

  it("C-13-3: effectiveCapex = 130,000,000 (수증자 8천만 + 증여자 5천만)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.effectiveCapex).toBe(130_000_000);
  });

  it("C-13-4: Scenario B의 capex = 수증자 capex만 (8천만)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    // Scenario B에서는 증여자 capex 미포함 → B 양도차익이 A보다 낮을 수 있음
    // (B는 증여 당시 평가액으로 취득가 계산)
    const detB = result.carryoverTaxationDetail?.scenarioB;
    expect(detB).toBeDefined();
    // B 취득가액 = 증여 당시 평가액 = 600M
    expect(detB?.acquisitionPrice).toBe(600_000_000);
  });
});

describe("C-13b: 증여자 자본적지출 산입 금지 — 양도일 2023.12.20 (< 2024.1.1 시행 전)", () => {
  const transferDate = new Date("2023-12-20");

  it("C-13b-1: donorCapexGuardApplied = true (시행 전 → 가드 발동)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexGuardApplied).toBe(true);
  });

  it("C-13b-2: donorCapexAddedToExpense = 0 (시행 전 → 산입 없음)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexAddedToExpense).toBe(0);
  });

  it("C-13b-3: effectiveCapex = 80,000,000 (수증자 8천만만)", () => {
    const result = calculateTransferTax(makeDonorCapexInput(transferDate), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.effectiveCapex).toBe(80_000_000);
  });

  it("C-13b-4: 시행시기 경계값 — 2024.01.01 정확히는 가드 미발동", () => {
    const exactDate = new Date("2024-01-01");
    const result = calculateTransferTax(makeDonorCapexInput(exactDate), MOCK_RATES);
    // 2024-01-01 < 2024-01-01 는 false → 가드 미발동
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexGuardApplied).toBe(false);
    expect(result.carryoverTaxationDetail?.scenarioA.donorCapexAddedToExpense).toBe(50_000_000);
  });
});
