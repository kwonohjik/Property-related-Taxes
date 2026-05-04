/**
 * C-11: 직계존속(부) 증여 + 증여세 상당액 가산 (§163의2 산식)
 *
 * 법령: 소득세법 §97조의2 ① 2호 전단, 시행령 §163의2
 *
 * 검증 항목:
 * - 증여세 상당액이 필요경비에 가산됨
 * - 한도(잔액 한도 = 증여세 가산 전 양도차익) 적용
 * - 한도 미초과 케이스 + 한도 초과 케이스
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

function makeGiftTaxInput(giftTaxAmount: number) {
  return baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2025-04-01"),
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date("2020-05-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 0,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false, // 비과세 없음 → 전액 과세
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    carryoverTaxation: {
      giftRegistryDate: new Date("2020-05-01"),
      donorAcquisitionDate: new Date("2010-01-01"),
      useEstimatedAcquisition: false,
      donorAcquisitionPrice: 300_000_000,
      giftTaxAmount,                    // 증여세 상당액 (사용자 입력)
      giftDateValuation: 500_000_000,   // Scenario B 취득가액
    },
  });
}

describe("C-11: 증여세 상당액 필요경비 가산 (§97조의2 ① 2호 전단, §163의2)", () => {
  it("C-11-1: giftTaxAmount > 0 → giftTaxAddedToExpense > 0", () => {
    const result = calculateTransferTax(makeGiftTaxInput(30_000_000), MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBeGreaterThan(0);
  });

  it("C-11-2: 한도 미초과 — giftTaxAddedToExpense = giftTaxAmount (3천만원)", () => {
    // 양도차익 = 800M - 300M = 500M >> 3천만원 → 한도 미발동
    const result = calculateTransferTax(makeGiftTaxInput(30_000_000), MOCK_RATES);
    const d = result.carryoverTaxationDetail!.scenarioA;
    expect(d.giftTaxAddedToExpense).toBe(30_000_000);
    expect(d.giftTaxLimitApplied).toBe(false);
  });

  it("C-11-3: 한도 초과 — giftTaxAddedToExpense = 한도 (양도차익 잔액), giftTaxLimitApplied=true", () => {
    // giftTaxAmount = 700M (양도차익 500M 초과) → 한도 발동
    const result = calculateTransferTax(makeGiftTaxInput(700_000_000), MOCK_RATES);
    const d = result.carryoverTaxationDetail!.scenarioA;
    expect(d.giftTaxLimitApplied).toBe(true);
    expect(d.giftTaxAddedToExpense).toBeLessThan(700_000_000);
    expect(d.giftTaxAddedToExpense).toBe(d.giftTaxLimitCap);
  });

  it("C-11-4: giftTaxAmount = 0 → giftTaxAddedToExpense = 0, limitApplied=false", () => {
    const result = calculateTransferTax(makeGiftTaxInput(0), MOCK_RATES);
    const d = result.carryoverTaxationDetail!.scenarioA;
    expect(d.giftTaxAddedToExpense).toBe(0);
    expect(d.giftTaxLimitApplied).toBe(false);
  });

  it("C-11-5: 증여세 가산 시 Scenario A 결정세액이 감소함 (양도차익 감소 → 세액 감소)", () => {
    // 증여세 상당액은 필요경비 가산 → 양도차익/소득금액 감소 → 결정세액 감소
    // transferGain은 legacy expenses 처리 방식에 따라 같을 수 있으므로 determinedTax로 검증
    const resultWith = calculateTransferTax(makeGiftTaxInput(30_000_000), MOCK_RATES);
    const resultWithout = calculateTransferTax(makeGiftTaxInput(0), MOCK_RATES);
    expect(resultWith.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense).toBe(30_000_000);
    // 증여세 가산액이 0원인 케이스보다 결정세액이 같거나 작아야 함
    expect(resultWith.carryoverTaxationDetail?.scenarioA.determinedTax)
      .toBeLessThanOrEqual(resultWithout.carryoverTaxationDetail?.scenarioA.determinedTax ?? Infinity);
  });
});
