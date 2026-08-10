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
 * ## ✅ D-8 완료(2026-08-10) — ②2호 **자동 판정**이 들어갔다
 *
 * 이 파일은 하루에 두 번 뒤집혔다. D-7a(세 축 배선) 직후에는 「②3호가 먼저 배제한다」였고,
 * D-8이 ②2호 자동 판정을 넣으면서 **배제 사유 자체가 바뀌었다**(`tax_comparison` →
 * `one_house_exemption`).
 *
 * ## 🔑 「해당하게 **되는**」은 **상태 변화**를 요구한다 — 예규 2건이 일치
 *
 * · **사전-2016-법령해석재산-0374**(2016.11.15.): 「제1항 규정을 **적용하지 아니하는 경우에도**
 *   … 1세대1주택 고가주택의 양도에 해당하게 되는 경우 **§97의2②2호를 적용하지 않는 것**」
 * · **서면-2022-부동산-0068**(2022.11.02. · 기재부 재산세제과-333 인용): 「§89①3호 각 목 외의
 *   부분에 따른 **1세대 1주택에 해당하는 주택**을 배우자로부터 증여받아 양도하는 경우에는
 *   … **§97의2②2호를 적용하지 않는 것**」
 *
 * ⇒ **A는 해당하는데 B는 해당하지 않는** 조합에서만 발동한다.
 *   **D5-5가 그 반대쪽(둘 다 해당 → 미발동)을 고정**한다 — 없으면 「무조건 발동」과 구별되지 않는다.
 *
 * · **D5-1·D5-2** — ②2호가 **자동으로** 걸린다(종전 `tax_comparison`이 아니다)
 * · **D5-3** — ②1호는 부담부증여에서 원리상 발현되지 않는다(수용 ≠ 부담부증여). 선언 시 배제만 확인
 * · **D5-4** — ✅ **사각지대 닫힘**. A가 비싼 채로 비과세인 조합도 이제 ②2호가 잡는다
 * · **D5-5** — 🔑 **상태 변화 조건의 양성 대조군**. B도 1세대1주택이면 ②2호는 **발동하지 않는다**
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
  // D-7a 배선 후 필수 — 당초 증여자 취득 당시 값(통상 더 낮다).
  carryoverDonorBasis: {
    landStdPriceAtAcquisition: 100_000_000,
    buildingStdPriceAtAcquisition: 50_000_000,
  },
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
  it("D5-1 ②2호가 **자동으로** 걸린다 — A에서만 1세대1주택 2년 보유가 성립한다", () => {
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

    // 🔑 배제 사유가 **②2호**다 — 종전에는 사용자 선언이 없으면 ②3호(tax_comparison)로
    //    떨어졌다. 세액은 같지만 **사유가 다르다**(②2호는 비교 이전에 적용을 배제한다).
    expect(d?.exclusionReason).toBe("one_house_exemption");
    expect(d?.comparisonExclusion).toBe(false);
    expect(d?.adoptedScenario).toBe("B");
    expect(r.calculatedTax).toBe(168_000_000);
  });

  it("D5-2 ②2호 고가주택(C=15억): 괄호가 고가주택을 **포함**하므로 동일하게 걸린다", () => {
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfoOver12,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;

    // 고가주택이라 A가 0원이 아니라 12억 초과 안분분만 과세된다.
    // (D-7a 배선으로 취득가액이 당초 증여자 기준으로 낮아져 5,981,000 → 8,709,600으로 올랐다.)
    expect(d?.scenarioA.determinedTax).toBe(8_709_600);
    expect(d?.scenarioB.determinedTax).toBe(252_116_667);
    // §97의2②2호 괄호: 「비과세대상에서 제외되는 **고가주택**(이에 딸린 토지를 포함한다)을 포함한다」
    expect(d?.exclusionReason).toBe("one_house_exemption");
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

  it("D5-4 ✅ 사각지대 닫힘 — A가 **비싼 채로** 비과세인 조합도 ②2호가 잡는다", () => {
    /**
     * ②3호가 ②2호를 대신해 주는 것은 「A가 비과세로 싸지기 때문」이다. 그렇다면
     * **A가 비싼 채로 비과세에 해당**하면 ②3호는 걸리지 않는다. 그 조합을 만든다:
     *
     * · 양도인 취득 기준시가 = 양도시와 **동일** ⇒ 시나리오 B의 양도차익 ≈ 0 (세액 0)
     * · 당초 증여자 취득 기준시가 = **1천만** ⇒ 시나리오 A의 양도차익 최대
     * · C = 15억 ⇒ 고가주택 ⇒ §89①3호 각 목의 「양도에 해당하게 되는 경우」 성립
     */
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: {
        ...bgInfoOver12,
        landStdPriceAtAcquisition: 1_000_000_000,
        buildingStdPriceAtAcquisition: 500_000_000,
        carryoverDonorBasis: {
          landStdPriceAtAcquisition: 10_000_000,
          buildingStdPriceAtAcquisition: 0,
        },
      },
      acquisitionCause: "carryover_gift",
      carryoverTaxation: { ...carryover, donorAcquisitionPrice: 10_000_000 },
    } as never);
    const d = r.carryoverTaxationDetail;

    // ②3호는 「A가 **적은** 경우」만 배제한다 — 여기서는 **A가 비싸서** 걸리지 않는다.
    expect(d?.scenarioB.determinedTax).toBe(0);
    expect(d?.scenarioA.determinedTax).toBeGreaterThan(d!.scenarioB.determinedTax);
    // 비교로 배제된 것이 아니다(②2호가 비교 이전에 적용을 배제한다).
    expect(d?.comparisonExclusion).toBe(false);

    /**
     * 🔑 **여기가 D-8의 존재 이유다.** ②3호는 「A가 **적은** 경우」만 배제하므로 이 조합을
     *    못 잡는다(A가 비싸다). ②2호 자동 판정이 없으면 §89①3호 고가주택 양도인데도
     *    이월과세가 **적용**돼 10,324,640원이 부과됐다.
     */
    expect(d?.exclusionReason).toBe("one_house_exemption");
    expect(d?.adoptedScenario).toBe("B");
    // B가 채택되므로 B의 세액(0)이 최종이다.
    expect(r.calculatedTax).toBe(0);
  });

  it("D5-5 🔑 양성 대조군 — **B도** 1세대1주택이면 ②2호는 발동하지 않는다", () => {
    /**
     * 「해당하게 **되는**」은 **상태 변화**를 요구한다(예규 2건 — 파일 헤더).
     * 이 테스트가 없으면 구현이 「A가 비과세면 무조건 배제」인지 「A만 비과세일 때 배제」인지
     * **구별되지 않는다**(메모리 `feedback_negative_assertion_needs_mutation_probe`).
     *
     * 픽스처: 증여를 2023-06-01로 **앞당겨** 시나리오 B의 보유기간도 2년을 넘긴다
     * (2년 8개월). ⇒ 이월과세를 적용하지 않아도 이미 1세대1주택이다.
     */
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfoUnder12,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: { ...carryover, giftRegistryDate: new Date("2023-06-01") },
    } as never);
    const d = r.carryoverTaxationDetail;

    // 두 시나리오 모두 2년 보유를 넘겨 **둘 다** 비과세에 해당한다.
    expect(d?.scenarioA.holdingPeriodYears).toBe(25);
    expect(d?.scenarioB.holdingPeriodYears).toBe(2);

    // ⇒ ②2호는 걸리지 않는다. 배제된다면 그것은 ②3호(세액 비교)여야 한다.
    expect(d?.exclusionReason).not.toBe("one_house_exemption");
  });
});
