/**
 * 이월과세 환산 모드 + 증여세 + 자본적지출 swap 회귀 anchor (§97조의2 ① · §97② 2호 단서)
 *
 * §97②2호 단서(환산취득가액 전용): 가목(환산+개산) < 나목(자본+양도비)이면 필요경비 = 나목 단독.
 *   나목 채택 시 환산취득가액은 가목에 포함되어 별도 차감하지 않는다.
 * 이월과세(§97의2): 증여세 산출세액을 필요경비에 산입.
 *
 * 시나리오: 양도가 1B / 환산취득가 400M(취득기준 200M·양도기준 500M) / 수증자 capex 500M(>개산 6M) / 증여세 30M
 *   swap 발동(capex 500M > 환산+개산 406M) → 필요경비 = 나목(capex 500M) + 증여세 30M = 530M
 *   scenarioA gain = 1B − 530M = 470M  (환산취득가 미차감. 이중차감 버그 시 70M, capex 누락 버그 시 564M)
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

describe("이월과세 환산+증여세+capex swap (회귀)", () => {
  it("swap 발동 capex가 필요경비에 반영 — scenarioA gain = 470M (환산 미차감, 이중차감 시 70M)", () => {
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
    expect(a.transferGain).toBe(470_000_000); // 1B − (capex 500M + 증여세 30M). 이중차감 버그 시 70M
  });
});
