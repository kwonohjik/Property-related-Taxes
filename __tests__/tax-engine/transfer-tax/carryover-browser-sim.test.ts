/**
 * 브라우저 시뮬레이션: acquisitionDate=등기접수일로 설정한 경우
 * main result가 채택 시나리오와 일치해야 함
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";

describe("브라우저 시뮬레이션: C-01 acquisitionDate=등기접수일", () => {
  it("main determinedTax가 scenarioA.determinedTax(64,684,518)와 일치해야 함", () => {
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 700_000_000,
      transferDate: new Date("2023-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2018-06-19"), // 브라우저: 자산-수준 등기접수일
      expenses: 0,
      useEstimatedAcquisition: true,
      standardPriceAtAcquisition: 404_000_000,
      standardPriceAtTransfer: 794_000_000,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: true,
      isUnregistered: false,
      isNonBusinessLand: false,
      isOneHousehold: true,
      reductions: [],
      annualBasicDeductionUsed: 0,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2018-06-19"),
        donorAcquisitionDate: new Date("2006-05-21"),
        useEstimatedAcquisition: true,
        giftTaxAmount: 10_000_000,
        giftDateValuation: 457_000_000,
        donorCapitalExpenditure: 0,
      },
    });

    const rates = makeMockRates();
    const result = calculateTransferTax(input, rates);

    // 디버그용 콘솔 출력
    console.log("result.determinedTax:", result.determinedTax);
    console.log("result.transferGain:", result.transferGain);
    console.log("result.longTermHoldingDeduction:", result.longTermHoldingDeduction);
    console.log("result.longTermHoldingRate:", result.longTermHoldingRate);
    console.log("scenarioA.determinedTax:", result.carryoverTaxationDetail?.scenarioA.determinedTax);
    console.log("adoptedScenario:", result.carryoverTaxationDetail?.adoptedScenario);

    // 이것이 통과해야 함
    expect(result.determinedTax).toBe(64_684_518);
    expect(result.longTermHoldingDeduction).toBe(96_512_614);
  });
});
