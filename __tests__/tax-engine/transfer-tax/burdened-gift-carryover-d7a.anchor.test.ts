/**
 * anchor: **D-7a — 세 축 동시 배선이 실제로 세액을 움직인다**
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §8.1
 *
 * ## 이 anchor가 지키는 것
 *
 * 종전 결함은 「입력은 받는데 계산에 도달하지 않는」 것이었다. 그래서 여기서는
 * **입력을 흔들어 세액이 따라 움직이는지**를 본다 — 중간값이 아니라 **결정세액**까지.
 * (메모리 `feedback_anchor_observes_wrong_stage` · `feedback_api_trigger_without_input_path_is_noop`)
 *
 * | 축 | 조문 | 검증 |
 * |---|---|---|
 * | 취득가액 | §97의2①1호 | A7-2 — 당초 증여자 기준시가를 낮추면 A 세액이 **오른다** |
 * | 증여세 상당액 | §97의2①3호 | A7-3·A7-4 — **기준시가 모드에서도** 세액이 움직인다(D3-3 뒤집힘) |
 * | 보유기간 | §95④ 단서 | A7-1 — 25년 기산 유지 |
 *
 * ## 픽스처 산수 (검산용)
 *
 * · 양도시 기준시가: 토지 6억 + 건물 2억 ⇒ 증여가액 **C = 8억**
 * · 인수채무: 보증금 3억 + 차입금 2억 ⇒ **B = 5억** ⇒ 채무비율 **B/C = 0.625**
 * · 취득시 기준시가 — **양도인** 기준 4억(토지 3억·건물 1억) / **당초 증여자** 기준 1.5억(1억·5천만)
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 당초 증여자 기준 취득값 한 벌 — 통상 더 낮다(옛날 취득). */
const DONOR_BASIS = {
  landStdPriceAtAcquisition: 100_000_000,
  buildingStdPriceAtAcquisition: 50_000_000,
} as const;

function makeInfo(over: Partial<BurdenedGiftInfo> = {}): BurdenedGiftInfo {
  return {
    valuationMode: "sangjeungbeop_standard",
    lendingDepositTotal: 300_000_000,
    mortgageDebtAmount: 200_000_000,
    annualRentTotal: 0,
    landStdPriceAtTransfer: 600_000_000,
    buildingStdPriceAtTransfer: 200_000_000,
    // 양도인(= 부담부증여를 하는 사람) 취득 당시 — 시나리오 B가 쓴다
    landStdPriceAtAcquisition: 300_000_000,
    buildingStdPriceAtAcquisition: 100_000_000,
    carryoverDonorBasis: { ...DONOR_BASIS },
    ...over,
  };
}

/** 증여 2023-06-01(10년 룰) · 당초 증여자 취득 2000-06-01 · 양도 2026-02-16. */
function makeCarryover(over: Record<string, unknown> = {}) {
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

function run(over: Partial<TransferTaxInput>) {
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
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

function runBG(info: BurdenedGiftInfo, carryover: Record<string, unknown> | null) {
  return run({
    transferType: "burdened_gift",
    burdenedGiftInfo: info,
    ...(carryover
      ? { acquisitionCause: "carryover_gift", carryoverTaxation: carryover }
      : {}),
  } as never);
}

describe("D7a — 부담부증여 × 이월과세 세 축 배선", () => {
  it("A7-1 취득가액 축이 §159에 **도달한다** — 시나리오 A가 당초 증여자 기준을 쓴다", () => {
    const r = runBG(makeInfo(), makeCarryover());
    const d = r.carryoverTaxationDetail;

    // 보유기간 축(§95④ 단서)은 종전대로 살아 있다.
    expect(d?.scenarioA.holdingPeriodYears).toBe(25);
    expect(d?.scenarioB.holdingPeriodYears).toBe(2);

    // 🔴 종전에는 A가 **항상 싸서** ②3호가 이월과세를 자동으로 꺼버렸다(D2-2).
    //    취득가액 축이 배선되면 A의 양도차익이 커져 **부등호가 되돌아온다**.
    expect(d?.scenarioA.determinedTax).toBeGreaterThan(d!.scenarioB.determinedTax);
    expect(d?.adoptedScenario).toBe("A");
    expect(d?.comparisonExclusion).toBe(false);
  });

  it("A7-2 당초 증여자 취득가액을 흔들면 **최종 세액까지** 따라 움직인다", () => {
    // 기준(1.5억) vs 더 낮은 취득가(9천만). 둘 다 A가 이기는 구간이다.
    const high = runBG(makeInfo(), makeCarryover());
    const low = runBG(
      makeInfo({
        carryoverDonorBasis: {
          landStdPriceAtAcquisition: 60_000_000,
          buildingStdPriceAtAcquisition: 30_000_000,
        },
      }),
      makeCarryover(),
    );

    /**
     * ⚠️ **채택 시나리오를 고정한 뒤에 비교한다.**
     *
     * 두 케이스의 `adoptedScenario`가 서로 다르면 최종 세액 차이는 「취득가액 축이 배선됐다」가
     * 아니라 「채택이 A↔B로 갈렸다」는 뜻이라 **아무것도 증명하지 못한다**.
     * 그래서 둘 다 A가 이기는 구간에서만 비교한다
     * (메모리 `feedback_anchor_observes_wrong_stage`).
     */
    expect(low.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect(high.carryoverTaxationDetail?.adoptedScenario).toBe("A");

    // 취득가액이 크면 양도차익이 작아져 세액이 내려간다 — 시나리오 A 내부.
    expect(high.carryoverTaxationDetail?.scenarioA.determinedTax).toBeLessThan(
      low.carryoverTaxationDetail!.scenarioA.determinedTax,
    );
    // 🔑 그리고 그 차이가 **채택 후 본 계산까지** 전달된다.
    expect(high.calculatedTax).toBeLessThan(low.calculatedTax);
    // 본 계산의 §159 취득가액도 당초 증여자 기준이어야 한다(= 시나리오 A와 자기일치).
    const perAsset = high.transferBurdenedGiftBreakdown!.perAsset;
    expect(perAsset.land.acquisitionPrice + perAsset.building.acquisitionPrice).toBe(
      // (1억 + 5천만) × 채무비율 0.625
      93_750_000,
    );
  });

  it("A7-3 🔴 D3-3 뒤집힘 — **기준시가 모드에서도** 증여세 상당액이 세액을 움직인다", () => {
    const zero = runBG(makeInfo(), makeCarryover({ giftTaxAmount: 0 }));
    const some = runBG(makeInfo(), makeCarryover({ giftTaxAmount: 80_000_000 }));

    const cgZero = zero.transferBurdenedGiftBreakdown?.carryoverGiftTax;
    const cgSome = some.transferBurdenedGiftBreakdown?.carryoverGiftTax;

    // 0원이면 명세 자체가 없다(허수 표시 금지).
    expect(cgZero).toBeUndefined();

    // 채무비율 안분: 80,000,000 × 5억 ÷ 8억 = 50,000,000 (시행령 §163의2②2호)
    expect(cgSome?.raw).toBe(80_000_000);
    expect(cgSome?.apportioned).toBe(50_000_000);
    expect(cgSome?.limitApplied).toBe(false);
    expect(cgSome?.applied).toBe(50_000_000);

    // ⭐ 종전 D3-3은 여기서 **세액이 그대로**였다 — 개산공제 경로가 실비를 안 읽었기 때문이다.
    expect(some.carryoverTaxationDetail!.scenarioA.determinedTax).toBeLessThan(
      zero.carryoverTaxationDetail!.scenarioA.determinedTax,
    );
  });

  it("A7-4 한도는 **안분 후** 값에 걸린다 (시행령 §163의2② 후단)", () => {
    const huge = runBG(makeInfo(), makeCarryover({ giftTaxAmount: 5_000_000_000 }));
    const a = huge.carryoverTaxationDetail!.scenarioA;

    /**
     * ⚠️ **최종 `transferBurdenedGiftBreakdown`을 보면 안 된다.** 한도가 걸릴 만큼 증여세가
     * 크면 시나리오 A의 세액이 0에 수렴해 ②3호가 **반드시 B를 채택**하고, 최종 명세는
     * 증여세를 싣지 않은 B 경로의 것이 된다. 한도 동작은 **시나리오 A 명세**에서 본다.
     */
    expect(huge.carryoverTaxationDetail?.adoptedScenario).toBe("B");

    // 한도 = 「양도로 보는 부분」의 양도차익. 안분액(5,000,000,000 × 0.625 = 3,125,000,000)이
    // 이를 훨씬 넘으므로 한도가 깎는다.
    expect(a.giftTaxLimitApplied).toBe(true);
    expect(a.giftTaxAddedToExpense).toBe(a.giftTaxLimitCap);
    expect(a.giftTaxLimitCap).toBeGreaterThan(0);
    // 한도까지 산입했으므로 양도차익이 0이 된다.
    expect(a.transferGain).toBe(0);
  });

  it("A7-4b 순서 검증 — **안분 → 한도**여야 한다 (뒤집으면 한도가 과소 적용된다)", () => {
    /**
     * 한도는 **파트마다** 그 파트의 잔액이다(계획서 `gb-bg-carryover-gift-tax-part-limit.plan.md` Q-1 a).
     * 손계산(기준시가 모드 · 채무비율 0.625 · 양도가액 토지 375,000,000 · 건물 125,000,000):
     *   건물 잔액 = 125,000,000 − 5천만 × 0.625 − 개산공제 937,500 = 92,812,500.
     *   건물 몫 = 안분액 × 2억/8억 ⇒ 안분액 371,250,000(= 증여세 594,000,000 × 0.625)에서 건물 몫이 **정확히** 잔액이다.
     *   토지 몫 278,437,500은 토지 잔액 310,625,000 안이다.
     * 동률에서는 한도가 발동하지 않고 안분액 전액이 들어간다. 「한도 → 안분」이었다면 0.625배로 더 줄었을 것이다.
     */
    const at = runBG(makeInfo(), makeCarryover({ giftTaxAmount: 594_000_000 })).carryoverTaxationDetail!.scenarioA;
    expect(at.giftTaxLimitApplied).toBe(false);
    expect(at.giftTaxAddedToExpense).toBe(371_250_000);
    expect(at.giftTaxLimitCap).toBe(310_625_000 + 92_812_500);
    // 1원 단위를 넘기면 건물에서만 잘린다 — 넘친 몫은 토지로 옮기지 않는다.
    const over = runBG(makeInfo(), makeCarryover({ giftTaxAmount: 600_000_000 })).carryoverTaxationDetail!.scenarioA;
    expect(over.giftTaxLimitApplied).toBe(true);
    // 안분 375,000,000 → 토지 281,250,000(한도 안) + 건물 93,750,000 → 92,812,500으로 잘림
    expect(over.giftTaxAddedToExpense).toBe(281_250_000 + 92_812_500);
  });

  it("A7-4c 한 파트만 이월과세(건물) — 한도 echo는 그 파트 잔액뿐이다(토지 잔액을 더하지 않는다)", () => {
    const info = makeInfo({ carryoverDonorBasis: { ...DONOR_BASIS, parts: { land: false, building: true } } });
    const a = runBG(info, makeCarryover({ giftTaxAmount: 600_000_000 })).carryoverTaxationDetail!.scenarioA;
    // 건물 잔액 92,812,500(A7-4b 손계산) · 안분 375,000,000 전액이 건물 몫이라 잘린다
    expect([a.giftTaxLimitCap, a.giftTaxAddedToExpense, a.giftTaxLimitApplied]).toEqual([92_812_500, 92_812_500, true]);
  });

  it("A7-5 ⛔ 당초 증여자 기준 값 미입력은 **차단**된다 (fallback 금지)", () => {
    const noBasis = makeInfo({ carryoverDonorBasis: undefined });
    expect(() => runBG(noBasis, makeCarryover())).toThrow(/당초 증여자/);
  });

  it("A7-6 ⛔ 이월과세 환산 플래그는 부담부증여에서 차단된다 (§5.7.5)", () => {
    expect(() =>
      runBG(makeInfo(), makeCarryover({ useEstimatedAcquisition: true })),
    ).toThrow(/환산/);
  });

  it("A7-7 §97의2②3호가 **양방향**으로 작동한다 — B가 이기는 케이스", () => {
    // 당초 증여자 취득가액이 양도인 기준보다 **높으면** A가 싸져 ②3호가 배제한다.
    const r = runBG(
      makeInfo({
        carryoverDonorBasis: {
          landStdPriceAtAcquisition: 900_000_000,
          buildingStdPriceAtAcquisition: 300_000_000,
        },
      }),
      makeCarryover(),
    );
    const d = r.carryoverTaxationDetail;
    expect(d?.scenarioA.determinedTax).toBeLessThan(d!.scenarioB.determinedTax);
    expect(d?.adoptedScenario).toBe("B");
    expect(d?.exclusionReason).toBe("tax_comparison");
  });

  it("A7-9 표시값도 §159 안분 후다 — 결과 카드가 **쓰이지 않는 값**을 보여주지 않는다", () => {
    /**
     * `carryoverTaxation.donorAcquisitionPrice`는 일반 양도 경로의 **단일 총액**이고
     * 부담부증여에서는 §159가 `carryoverDonorBasis`로 자산별 취득가액을 따로 구하므로
     * **계산에 쓰이지 않는다**(계획서 §5.7.6). 그런데 결과 카드는
     * `scenarioA.acquisitionPrice`를 「취득가액」으로 그대로 찍는다
     * ⇒ 그 값이 §159 안분값이 아니면 **화면과 계산이 어긋난다**.
     */
    const r = runBG(makeInfo(), makeCarryover({ donorAcquisitionPrice: 999_999_999 }));
    const a = r.carryoverTaxationDetail!.scenarioA;
    const perAsset = r.transferBurdenedGiftBreakdown!.perAsset;

    // 표시값 = §159 안분 취득가액 합 = (1억 + 5천만) × 0.625
    expect(a.acquisitionPrice).toBe(93_750_000);
    expect(a.acquisitionPrice).toBe(
      perAsset.land.acquisitionPrice + perAsset.building.acquisitionPrice,
    );
    // ❌ 입력한 donorAcquisitionPrice가 그대로 새어나오면 안 된다.
    expect(a.acquisitionPrice).not.toBe(999_999_999);
  });

  it("A7-8 이월과세를 켠 결과가 **부담부증여 단독과 다르다**", () => {
    const withCO = runBG(makeInfo(), makeCarryover());
    const without = runBG(makeInfo(), null);
    // D2-3이 고정하던 「완전히 같다」가 뒤집힌다.
    expect(withCO.calculatedTax).not.toBe(without.calculatedTax);
  });
});
