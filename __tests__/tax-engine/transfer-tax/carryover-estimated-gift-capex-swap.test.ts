/**
 * 이월과세 환산 모드 + 증여세 + 자본적지출 swap 회귀 anchor (§97조의2 ① · §97② 2호 단서)
 *
 * 버그: 환산→실가 전환 시 expenses=개산공제+증여세로 두고 capitalExpenditure를 제거 →
 *   capex가 개산공제보다 커서 swap이 발동했어야 하는 경우 자본적지출 전액 누락 → 양도차익 과대.
 * 수정: expenses = (양도가−환산취득가−gainBeforeGiftTax) + 증여세 = swap-aware 필요경비.
 *
 * 시나리오: 양도가 1B / 환산취득가 400M(취득기준 200M·양도기준 500M) / 수증자 capex 500M(>개산 6M) / 증여세 30M
 *   gainBeforeGiftTax(swap) = 1B − 400M − 500M = 100M
 *   scenarioA gain = 100M − 30M = 70M  (capex 누락 버그 시 564M)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

describe("이월과세 환산+증여세+capex swap (회귀)", () => {
  it("swap 발동 capex가 필요경비에 반영 — scenarioA gain = 70M (564M 아님)", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      transferDate: new Date("2025-04-01"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2020-05-01"),
      capitalExpenditure: 500_000_000,
      transferExpense: 0,
      useEstimatedAcquisition: true,
      householdHousingCount: 1, isOneHousehold: false,
      isRegulatedArea: false, wasRegulatedAtAcquisition: false,
      isUnregistered: false, isNonBusinessLand: false,
      residencePeriodMonths: 0, annualBasicDeductionUsed: 0, reductions: [],
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2020-05-01"),
        donorAcquisitionDate: new Date("2010-01-01"),
        useEstimatedAcquisition: true,
        giftTaxAmount: 30_000_000,
        giftDateValuation: 500_000_000,
      },
      standardPriceAtAcquisition: 200_000_000,
      standardPriceAtTransfer: 500_000_000,
    });
    const r = calculateTransferTax(input, makeMockRates());
    const a = r.carryoverTaxationDetail!.scenarioA;
    expect(a.effectiveCapex).toBe(500_000_000);
    expect(a.giftTaxAddedToExpense).toBe(30_000_000);
    expect(a.transferGain).toBe(70_000_000); // 버그 시 564,000,000
  });
});
