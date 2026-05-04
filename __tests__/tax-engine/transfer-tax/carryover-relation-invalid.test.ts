/**
 * C-08: 이월과세 미적용 — carryoverTaxation 없는 케이스 (기간 초과 또는 acquisitionCause 불일치)
 *
 * 실무에서 "배우자 사망 후 양도" 케이스는 acquisitionCause를 "carryover_gift"가 아닌
 * 다른 값으로 입력하거나 carryoverTaxation 자체를 생략하여 처리.
 * 엔진은 acquisitionCause !== "carryover_gift" 시 이월과세 분기를 skip (null 반환).
 *
 * 법령: 소득세법 §97조의2 ① 단서 (사망으로 혼인관계 소멸 시 배우자 요건 불충족)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

describe("C-08: 이월과세 비적용 케이스 (acquisitionCause != carryover_gift)", () => {
  /**
   * 배우자 사망 후 양도 시: UI에서 acquisitionCause="gift"(일반 증여) 또는
   * "purchase"로 처리. carryoverTaxation이 없으면 엔진은 skip.
   */
  const inputNoCarryover = baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2025-06-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2020-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 24,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "gift", // 일반 증여 — carryover_gift 아님
    // carryoverTaxation 미입력
  });

  it("C-08-1: carryoverTaxationDetail = undefined (이월과세 분기 skip)", () => {
    const result = calculateTransferTax(inputNoCarryover, MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeUndefined();
  });

  it("C-08-2: 일반 양도세 계산됨 (기존 gift 경로)", () => {
    const result = calculateTransferTax(inputNoCarryover, MOCK_RATES);
    expect(result.determinedTax).toBeGreaterThanOrEqual(0);
  });
});

describe("C-08b: 이월과세 비적용 — acquisitionCause=carryover_gift 이나 carryoverTaxation 미입력", () => {
  const inputMissing = baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    transferDate: new Date("2025-06-01"),
    acquisitionPrice: 500_000_000,
    acquisitionDate: new Date("2020-01-01"),
    expenses: 0,
    useEstimatedAcquisition: false,
    householdHousingCount: 1,
    residencePeriodMonths: 24,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: true,
    reductions: [],
    annualBasicDeductionUsed: 0,
    acquisitionCause: "carryover_gift",
    // carryoverTaxation 미입력 → 엔진이 skip
  });

  it("C-08b-1: carryoverTaxation 미입력 시 carryoverTaxationDetail = undefined", () => {
    const result = calculateTransferTax(inputMissing, MOCK_RATES);
    expect(result.carryoverTaxationDetail).toBeUndefined();
  });
});
