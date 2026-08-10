/**
 * anchor: **D-5 — §97의2② 1호(수용)·2호(1세대1주택 비과세)가 부담부증여에서 어떻게 발현되나**
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §4 D-5
 *
 * ## 조문 (「소득세법」 §97의2② — 2026-08-10 원문 확인)
 *
 * > 1. 사업인정고시일부터 소급하여 2년 이전에 증여받은 경우로서 「공익사업을 위한 토지 등의
 * >    취득 및 보상에 관한 법률」이나 그 밖의 법률에 따라 **협의매수 또는 수용**된 경우
 * > 2. 제1항을 적용할 경우 제89조제1항제3호 각 목의 **주택**[같은 호에 따라 양도소득의
 * >    비과세대상에서 제외되는 **고가주택**(이에 딸린 토지를 포함한다)을 포함한다]의
 * >    **양도에 해당하게 되는 경우**
 * > 3. 제1항을 적용하여 계산한 양도소득 결정세액이 제1항을 적용하지 아니하고 계산한
 * >    양도소득 결정세액보다 **적은** 경우
 *
 * ## 이 anchor가 고정하는 것
 *
 * D5-1 · D5-2는 **현행 동작의 관찰**이다 — 「이래야 한다」가 아니라 「지금 이렇다」.
 * D-7 배선 후 뒤집히면 그 자리에서 재해석한다(값 맞추기 금지).
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 증여가액 C = 8억(12억 미만 → 고가주택 아님) · 채무 B = 5억. */
const bgInfoUnder12: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
};

/** 증여가액 C = 15억(12억 초과 → 고가주택) · 채무 B = 5억. */
const bgInfoOver12: BurdenedGiftInfo = {
  ...bgInfoUnder12,
  landStdPriceAtTransfer: 1_000_000_000,
  buildingStdPriceAtTransfer: 500_000_000,
};

/**
 * ⭐ 픽스처의 요점: **시나리오 A에서만 2년 보유가 성립**한다.
 *   · 시나리오 B(미적용) 기산 = 증여 등기접수일 2025-06-01 → 양도까지 **8개월**(2년 미달)
 *   · 시나리오 A(적용)   기산 = 당초 증여자 취득일 2000-06-01 → **25년 8개월**
 * ⇒ §97의2②2호가 말하는 「제1항을 적용할 경우 … 비과세 주택의 양도에 **해당하게 되는**」
 *   상황을 정확히 만든다.
 */
const carryover = {
  giftRegistryDate: new Date("2025-06-01"),
  donorAcquisitionDate: new Date("2000-06-01"),
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
  giftDateValuation: 600_000_000,
};

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2025-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("D5 — §97의2② 1호·2호가 부담부증여에서 어떻게 발현되나", () => {
  it("D5-1 ②2호: A에서만 1세대1주택 2년 보유가 성립하는데도 **자동 판정이 없다**", () => {
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfoUnder12,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;

    // 보유기간 축은 살아 있다 — A만 2년 요건을 넘긴다.
    expect(d?.scenarioB.holdingPeriodYears).toBe(0);
    expect(d?.scenarioA.holdingPeriodYears).toBe(25);

    // ⭐ A가 **비과세로 0원**이 된다 — 즉 §97의2②2호가 말하는 「비과세 주택의 양도에
    //   해당하게 되는」 상황이 실제로 발생한다.
    expect(d?.scenarioA.determinedTax).toBe(0);
    expect(d?.scenarioB.determinedTax).toBe(168_000_000);

    // 그런데 현행 엔진의 ②2호 경로는 **사용자 선언**(oneHouseExemptionApplies)뿐이라
    // 자동 판정이 없다. 배제를 실제로 일으킨 것은 **②3호**(A < B)다.
    expect(d?.exclusionReason).not.toBe("one_house_exemption");
    expect(d?.exclusionReason).toBe("tax_comparison");
    expect(d?.adoptedScenario).toBe("B");
    expect(r.calculatedTax).toBe(168_000_000);
  });

  it("D5-2 ②2호 고가주택(C=15억): 여기서도 ②3호가 먼저 배제한다", () => {
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfoOver12,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;

    // 고가주택이라 A가 0원이 아니라 12억 초과 안분분만 과세된다.
    expect(d?.scenarioA.determinedTax).toBe(5_981_000);
    expect(d?.scenarioB.determinedTax).toBe(252_116_667);
    expect(d?.exclusionReason).toBe("tax_comparison");
    expect(d?.adoptedScenario).toBe("B");
  });

  it("D5-3 ②1호(수용): 사용자 선언 시 부담부증여에서도 이월과세가 배제된다", () => {
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfoUnder12,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        ...carryover,
        exclusionDeclared: { expropriationWithin2Years: true },
      },
    } as never);
    const d = r.carryoverTaxationDetail;
    expect(d?.exclusionReason).toBe("expropriation");
    expect(d?.adoptedScenario).toBe("B");
  });
});
