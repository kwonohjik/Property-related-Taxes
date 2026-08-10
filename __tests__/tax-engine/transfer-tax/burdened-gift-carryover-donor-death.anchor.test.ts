/**
 * anchor: **O-3 — 부담부증여 × 관계 요건 배제 (§97조의2 ① 괄호)**
 *
 * ## 왜 부담부증여를 따로 보는가
 *
 * §159가 §97의2의 **세 축 중 둘을 삼킨다**(취득가액·증여세 상당액). 그래서 「일반 양도에서
 * 됐으니 부담부증여에서도 될 것」이 성립하지 않는다 — 실제로 A-1은 세 축을 **따로** 배선해야 했다.
 *
 * 다만 **사망·관계 배제는 그 세 축이 아니다.** §97의2 ① **본문 요건**이라, 요건을 못 채우면
 * 「§159①1호 취득가액 산정에 §97의2를 적용한다」(국세청 재산세과-1059)는 근거 자체가 서지 않는다.
 * ⇒ 부담부증여에서도 **똑같이 배제**되어야 한다. 이 anchor가 그것을 고정한다.
 *
 * ## 픽스처는 D-7a와 같은 것을 쓴다 (검산 가능)
 *
 * · 양도시 기준시가 토지 6억 + 건물 2억 ⇒ 증여가액 C = 8억
 * · 인수채무 3억 + 2억 ⇒ B = 5억 ⇒ 채무비율 0.625
 * · 취득시 기준시가 — 양도인 4억 / 당초 증여자 1.5억
 *
 * ⚠️ **양성 대조군이 절반이다**(BD-2·BD-5). 배제 단언만 두면 「부담부증여는 전부 배제」라는
 *    과잉 구현도 통과한다. 메모리 `feedback_negative_assertion_needs_mutation_probe`.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

function makeInfo(): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 600_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
    landStdPriceAtAcquisition: 300_000_000,
    buildingStdPriceAtAcquisition: 100_000_000,
    carryoverDonorBasis: {
      landStdPriceAtAcquisition: 100_000_000,
      buildingStdPriceAtAcquisition: 50_000_000,
    },
  };
}

/**
 * 증여 2023-06-01(10년 룰) · 당초 증여자 취득 2000-06-01 · 양도 2026-02-16.
 *
 * ⚠️ **D-7a와 같은 날짜를 쓴다.** 증여일을 2025로 옮기면 수증자 보유기간이 1년 미만이 되어
 *    B가 단기세율로 치솟고, §97의2②3호 MAX가 B를 골라 **대조군이 「적용됐는지」를 못 본다**.
 *    직계존비속 괄호의 2025.1.1. 게이트는 BD-3에서 이 날짜만 덮어써서 확인한다.
 */
type Carryover = NonNullable<TransferTaxInput["carryoverTaxation"]>;

function makeCarryover(over: Partial<Carryover> = {}): Carryover {
  return {
    giftRegistryDate: new Date("2023-06-01"),
    donorAcquisitionDate: new Date("2000-06-01"),
    donorAcquisitionPrice: 100_000_000,
    useEstimatedAcquisition: false,
    giftTaxAmount: 0,
    giftDateValuation: 600_000_000,
    ...over,
  };
}

function runBG(carryover: Carryover) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "general_building",
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2023-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      transferType: "burdened_gift",
      burdenedGiftInfo: makeInfo(),
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("O-3 — 부담부증여 × §97의2① 관계 요건 배제", () => {
  it("BD-1 배우자가 사망으로 혼인관계 소멸 → 부담부증여에서도 **배제**된다", () => {
    const d = runBG(
      makeCarryover({ donorRelation: "spouse", donorDeceased: true }),
    ).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(false);
    expect(d?.exclusionReason).toBe("relation_invalid");
    expect(d?.adoptedScenario).toBe("B");
    // 비교로 진 것이 아니라 **요건 미충족**이다 — 결과 카드 문구가 갈린다.
    expect(d?.comparisonExclusion).toBe(false);
  });

  it("BD-2 【양성 대조군】 배우자 **생존** → 종전대로 이월과세가 적용된다", () => {
    const d = runBG(
      makeCarryover({ donorRelation: "spouse", donorDeceased: false }),
    ).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(true);
    expect(d?.exclusionReason).toBeUndefined();
    // §159 위에서도 취득가액 축이 살아 A가 채택된다(D-7a A7-1과 같은 부등호).
    expect(d?.adoptedScenario).toBe("A");
  });

  it("BD-3 직계존비속 사망 + 증여일 ≥ 2025.1.1. → **배제**", () => {
    const d = runBG(
      makeCarryover({
        giftRegistryDate: new Date("2025-01-01"),
        donorRelation: "lineal",
        donorDeceased: true,
      }),
    ).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(false);
    expect(d?.exclusionReason).toBe("relation_invalid");
  });

  it("BD-4 🪤 직계존비속 사망이라도 증여일 < 2025.1.1.이면 **적용**된다 (종전 규정)", () => {
    const d = runBG(
      makeCarryover({ donorRelation: "lineal", donorDeceased: true }),
    ).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(true);
    expect(d?.exclusionReason).not.toBe("relation_invalid");
    expect(d?.adoptedScenario).toBe("A");
  });

  it("BD-5 【양성 대조군】 관계 미선택(구형 입력) → 종전대로 적용된다", () => {
    const d = runBG(makeCarryover()).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(true);
    expect(d?.adoptedScenario).toBe("A");
  });

  it("BD-6 「그 외」 관계는 증여자가 **생존해도** 배제된다 (① 본문 요건)", () => {
    const d = runBG(
      makeCarryover({ donorRelation: "other", donorDeceased: false }),
    ).carryoverTaxationDetail;

    expect(d?.isEligible).toBe(false);
    expect(d?.exclusionReason).toBe("relation_invalid");
  });

  it("BD-7 배제되면 세액이 시나리오 B(수증자 기준)와 **일치**한다 — MAX가 걸리지 않는다", () => {
    const excluded = runBG(
      makeCarryover({ donorRelation: "spouse", donorDeceased: true }),
    );
    // 이월과세 선언 자체가 없는 부담부증여(= 순수 B)와 같은 세액이어야 한다.
    const plain = calculateTransferTax(
      baseTransferInput({
        propertyType: "general_building",
        transferDate: new Date("2026-02-16"),
        acquisitionDate: new Date("2023-06-01"),
        transferPrice: 0,
        acquisitionPrice: 0,
        expenses: 0,
        useEstimatedAcquisition: false,
        isOneHousehold: false,
        householdHousingCount: 0,
        transferType: "burdened_gift",
        burdenedGiftInfo: makeInfo(),
      } as Partial<TransferTaxInput>),
      rates,
    );

    expect(excluded.determinedTax).toBe(plain.determinedTax);
  });
});
