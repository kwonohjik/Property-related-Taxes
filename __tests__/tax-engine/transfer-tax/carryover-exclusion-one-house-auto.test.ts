/**
 * D-8: **§97의2②2호 자동 판정** — 사용자 선언 없이도 걸린다 (2026-08-10)
 *
 * ## 조문
 *
 * > 2. 제1항을 적용할 경우 제89조제1항제3호 각 목의 주택[같은 호에 따라 양도소득의
 * >    비과세대상에서 제외되는 **고가주택**(이에 딸린 토지를 포함한다)을 포함한다]의
 * >    양도에 **해당하게 되는 경우**
 *
 * ## 🔑 「해당하게 **되는**」 = 상태 변화 (예규 2건 일치)
 *
 * · **사전-2016-법령해석재산-0374**(법령해석과-3693, 2016.11.15.):
 *   「제1항 규정을 **적용하지 아니하는 경우에도** … 1세대1주택 고가주택의 양도에
 *     해당하게 되는 경우 **제97조의2제2항제2호를 적용하지 않는 것**이며, 취득가액은 그
 *     배우자의 취득 당시 금액으로 하고, 그 배우자의 보유기간을 통산하는 것입니다.」
 * · **서면-2022-부동산-0068**(부동산납세과-3383, 2022.11.02. · 기재부 재산세제과-333 인용):
 *   「§89①3호 각 목 외의 부분에 따른 **1세대 1주택에 해당하는 주택**을 배우자로부터
 *     증여받아 양도하는 경우에는 … **§97의2②2호를 적용하지 않는 것**입니다.」
 *
 * ⇒ **A는 해당하는데 B는 해당하지 않는** 조합에서만 발동한다.
 *
 * ## 왜 필요했나 — ②3호가 못 잡는 구간이 있다
 *
 * ②3호(세액 비교)가 ②2호를 덮어 주는 것은 「A가 비과세로 **싸지기**」 때문이다.
 * **A가 비싼 채로** 비과세에 해당하면 ②3호는 걸리지 않는다 — OH-1이 그 구간이다.
 *
 * ⚠️ 이 파일은 **일반 양도** 경로를 본다. 부담부증여 쪽은
 *    `burdened-gift-carryover-d5.anchor.test.ts` D5-1·2·4·5가 담당한다.
 *    D-8의 착수 근거가 「부담부증여가 만든 결함이 아니다」였으므로 **양쪽 모두** 고정한다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "@/__tests__/tax-engine/_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/**
 * ⭐ 픽스처의 요점: **A가 비싸면서 동시에 비과세**인 구간을 만든다.
 *   · 증여 당시 평가액 = 양도가액 ⇒ 시나리오 B의 양도차익 ≈ 0 (세액 0)
 *   · 당초 증여자 취득가액 1천만 ⇒ 시나리오 A의 양도차익 최대
 *   · 양도가 15억 ⇒ 12억 초과 고가주택(§89①3호 괄호)
 */
function run(over: Record<string, unknown> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      transferDate: new Date("2026-02-16"),
      acquisitionPrice: 0,
      acquisitionDate: new Date("2025-06-01"),
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: {
        giftRegistryDate: new Date("2025-06-01"), // B 보유 8개월 → 1세대1주택 미해당
        donorAcquisitionDate: new Date("2000-06-01"), // A 보유 25년 → 해당
        donorAcquisitionPrice: 10_000_000,
        useEstimatedAcquisition: false,
        giftTaxAmount: 0,
        giftDateValuation: 1_500_000_000,
        ...(over.carryoverOver as object ?? {}),
      },
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("OH-AUTO: §97의2②2호 자동 판정 (D-8)", () => {
  it("OH-1 ✅ A가 **비싼 채로** 비과세면 ②3호가 못 잡는다 — ②2호가 잡는다", () => {
    const r = run();
    const d = r.carryoverTaxationDetail;

    // ②3호가 걸리지 않는 구간임을 먼저 확인한다(A가 비싸다).
    expect(d?.scenarioB.determinedTax).toBe(0);
    expect(d?.scenarioA.determinedTax).toBeGreaterThan(d!.scenarioB.determinedTax);

    // 🔑 그런데도 배제된다 — 사유는 비교가 아니라 ②2호다.
    expect(d?.exclusionReason).toBe("one_house_exemption");
    expect(d?.comparisonExclusion).toBe(false);
    expect(d?.adoptedScenario).toBe("B");
    expect(d?.isEligible).toBe(false);

    // 배제 결과 B가 채택되어 세액 0.
    expect(r.calculatedTax).toBe(0);
  });

  it("OH-2 🔑 양성 대조군 — **B도** 1세대1주택이면 ②2호는 발동하지 않는다", () => {
    /**
     * 「해당하게 **되는**」은 상태 변화를 요구한다. 이 대조군이 없으면 구현이
     * 「A가 비과세면 무조건 배제」인지 「A만 비과세일 때 배제」인지 구별되지 않는다.
     *
     * 증여를 2023-06-01로 앞당겨 B의 보유기간도 2년을 넘긴다(2년 8개월).
     */
    const r = run({ carryoverOver: { giftRegistryDate: new Date("2023-06-01") } });
    const d = r.carryoverTaxationDetail;

    expect(d?.scenarioB.holdingPeriodYears).toBe(2);
    expect(d?.exclusionReason).not.toBe("one_house_exemption");
  });

  it("OH-3 1세대1주택이 아니면 ②2호와 무관하다 (회귀 0)", () => {
    // 다주택 → 어느 시나리오도 §89①3호에 해당하지 않는다.
    const r = run({ isOneHousehold: false, householdHousingCount: 3 });
    expect(r.carryoverTaxationDetail?.exclusionReason).not.toBe("one_house_exemption");
  });
});
