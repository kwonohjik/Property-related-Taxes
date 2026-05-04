/**
 * C-09: 증여자 취득가액 직접 입력 (실거래가) — 환산 미사용
 *
 * 법령: 소득세법 §97조의2 ① 1호
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

const MOCK_RATES = makeMockRates();

const C09_DONOR_ACQ_PRICE = 250_000_000; // 증여자 취득가액 (직접 입력)
const C09_GIFT_DATE_VALUATION = 600_000_000; // 증여 당시 평가액

// 증여일 2023.06.01 (10년 룰) + 양도일 2026.06.01 (3년) → 이월과세 적용
const C09_INPUT = baseTransferInput({
  propertyType: "housing",
  transferPrice: 900_000_000,
  transferDate: new Date("2026-06-01"),
  acquisitionPrice: C09_DONOR_ACQ_PRICE, // carryoverTaxation.donorAcquisitionPrice와 동일
  acquisitionDate: new Date("2012-01-01"),
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
    giftRegistryDate: new Date("2023-06-01"), // 2023.1.1 이후 → 10년 룰 (3년 이내 양도)
    donorAcquisitionDate: new Date("2012-01-01"),
    useEstimatedAcquisition: false,            // 실거래가 직접 입력
    donorAcquisitionPrice: C09_DONOR_ACQ_PRICE,
    giftTaxAmount: 5_000_000,
    giftDateValuation: C09_GIFT_DATE_VALUATION,
  },
});

describe("C-09: 증여자 취득가액 직접 입력 (실거래가) — 환산 미사용", () => {
  it("C-09-1: Scenario A 취득가액 = 증여자 직접 입력가(2.5억)", () => {
    const result = calculateTransferTax(C09_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(C09_DONOR_ACQ_PRICE);
  });

  it("C-09-2: Scenario B 취득가액 = 증여 당시 평가액(6억)", () => {
    const result = calculateTransferTax(C09_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioB.acquisitionPrice).toBe(C09_GIFT_DATE_VALUATION);
  });

  it("C-09-3: Scenario A 보유연수 = 증여자 취득일 기산 (2012 ~ 2026 = 14년)", () => {
    const result = calculateTransferTax(C09_INPUT, MOCK_RATES);
    expect(result.carryoverTaxationDetail?.scenarioA.holdingPeriodYears).toBe(14);
  });

  it("C-09-4: Scenario A 양도차익 > B 양도차익 (증여자 취득가 낮아 차익 큼)", () => {
    const result = calculateTransferTax(C09_INPUT, MOCK_RATES);
    const d = result.carryoverTaxationDetail!;
    // A: 900M - 250M = 650M (증여세 5M 차감 후 645M)
    // B: 900M - 600M = 300M
    expect(d.scenarioA.transferGain).toBeGreaterThan(d.scenarioB.transferGain);
  });

  it("C-09-5: 이월과세 결정세액 비교 후 채택 시나리오 결정", () => {
    const result = calculateTransferTax(C09_INPUT, MOCK_RATES);
    const d = result.carryoverTaxationDetail!;
    // A > B 이면 A 채택, A < B 이면 B 채택
    if (d.scenarioA.determinedTax >= d.scenarioB.determinedTax) {
      expect(d.adoptedScenario).toBe("A");
    } else {
      expect(d.adoptedScenario).toBe("B");
    }
    expect(result.determinedTax).toBe(
      d.adoptedScenario === "A" ? d.scenarioA.determinedTax : d.scenarioB.determinedTax
    );
  });
});
