/**
 * anchor: **D-2 — 부담부증여에서 §97의2②3호 비교가 이월과세를 자동으로 꺼버린다**
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §5 D-2
 *
 * ## 구조 확인 — 시나리오 비교는 **이미 §159 경로 위에 있다**
 *
 * `calcCarryoverScenarios`가 만드는 시나리오 입력은 `{ ...rawInput, ... }` **spread**라
 * `transferType: "burdened_gift"`·`burdenedGiftInfo`가 **보존된다**
 * (`transfer-tax-carryover.ts` `inputABase` · `buildInputB`). 주입된 `calculateTransferTax`로
 * 재귀 호출되면 두 시나리오 모두 STEP 0.48(§159)을 통과한다.
 * ⇒ 계획서 D-2가 걱정한 「§159 경로에 태우는 구조」는 **새로 만들 것이 없다**.
 *
 * ## ✅ 2026-08-10 D-7a로 **전건 해소** — 아래 진단은 「해소 전」의 기록이다
 *
 * D2-2·D2-3은 정반대로 다시 쓰였다. 남은 가치는 **왜 그랬는지의 기록**과 D2-1 대조군이다.
 *
 * ## 🔴 (해소 전) 그래서 **더 나빴다** — 한쪽 축만 살아남았다
 *
 * 시나리오 A는 `acquisitionPrice`를 원증여자 가액으로 낮추지만 **§159는 그 값을 읽지 않는다**
 * (§159①1호의 A는 `burdenedGiftInfo`의 4개 모드에서 온다). 그래서:
 *
 * | 축 | 시나리오 A에 반영되나 | 세액 방향 |
 * |---|---|---|
 * | 취득가액(§159①1호 A) | ❌ **사라진다** | (상승 요인) |
 * | 보유기간(**§95④ 단서** `acquisitionDate`) | ✅ 반영된다 | **하락** |
 *
 * ⚠️ 2026-08-10 정정 — 종전 주석은 보유기간 축을 「§97의2③」이라 적었다. **틀렸다.**
 *    ③은 ①의 **10년 요건**을 재는 규정이고, 보유기간 기산은 **§95④ 단서**다(계획서 §5.8).
 *
 * ⇒ A가 **항상 싸진다** ⇒ §97의2②3호(「적용한 세액이 적으면 미적용」)가 걸려 **B가 채택**된다.
 *   즉 **이월과세가 자동으로 꺼진다**.
 *
 * ## ⚠️ 그래서 「차단만 풀면 된다」가 아니다
 *
 * 차단을 풀면 엔진이 「이월과세를 **검토했고 불리해서 미적용**」이라는 결론을 낸다.
 * 침묵 오답보다 나쁘다 — 사용자가 **판정을 받았다고 믿는다**.
 *
 * ## ⇒ 설계 순서가 확정된다: **D-1 → D-2**
 *
 * A 시나리오가 `burdenedGiftInfo`의 취득 관련 값까지 원증여자 기준으로 바꿔야 비교가 성립하는데,
 * 그 값은 **전부 사용자 입력**이라 엔진이 만들 수 없다 ⇒ **D-1(입력 의미 재정의)이 D-2의 선행조건**이다.
 * D-2는 독립 착수가 **불가능**하다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const bgInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
  // D-7a 배선 후 필수 — 당초 증여자 취득 당시 값(§97의2①1호).
  carryoverDonorBasis: {
    landStdPriceAtAcquisition: 100_000_000,
    buildingStdPriceAtAcquisition: 50_000_000,
  },
};

/** 증여 2023-06-01(≥ 10년 룰 시행) · 양도 2026-02-16 ⇒ 적용기간 안. */
const carryover = {
  giftRegistryDate: new Date("2023-06-01"),
  donorAcquisitionDate: new Date("2000-06-01"),
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
  giftDateValuation: 600_000_000,
};

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

describe("D2 — 부담부증여 × §97의2②3호 비교", () => {
  it("D2-1 대조군(일반 양도): A가 비싸 **이월과세가 적용**된다", () => {
    const r = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;
    expect(d?.scenarioA.determinedTax).toBe(198_210_000);
    expect(d?.scenarioB.determinedTax).toBe(93_110_000);
    expect(d?.adoptedScenario).toBe("A");
    expect(d?.comparisonExclusion).toBe(false);
  });

  it("D2-2 ✅ 해소 — 취득가액 축이 배선되어 **부등호가 대조군과 같아졌다**", () => {
    /**
     * ## 2026-08-10 D-7a로 뒤집힌 테스트
     *
     * 종전에는 A = 43,615,000 < B = 71,260,000이라 §97의2②3호가 **이월과세를 자동으로 꺼버렸다**.
     * §159①1호의 A가 `burdenedGiftInfo`에서 오는데 시나리오 A가 그것을 바꾸지 못해
     * **취득가액 축만 사라지고 보유기간 축(하락 요인)만 살아남았기** 때문이다.
     *
     * `carryoverDonorBasis`가 §159에 주입되면서 A의 취득가액이 당초 증여자 기준
     * (1.5억 × 채무비율 0.625 = 93,750,000)으로 낮아져 양도차익이 커졌다.
     */
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfo,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;

    expect(d?.scenarioA.determinedTax).toBe(86_424_375);
    expect(d?.scenarioB.determinedTax).toBe(71_260_000);
    // 🔑 대조군(D2-1)과 **같은 방향**이다 — A가 비싸서 이월과세가 적용된다.
    expect(d?.scenarioA.determinedTax).toBeGreaterThan(d!.scenarioB.determinedTax);
    expect(d?.adoptedScenario).toBe("A");
    expect(d?.comparisonExclusion).toBe(false);
    expect(r.calculatedTax).toBe(86_424_375);
  });

  it("D2-3 ✅ 해소 — 이월과세를 켠 결과가 **부담부증여 단독과 다르다**", () => {
    /**
     * 종전 D2-3은 「이월과세 판정을 거쳤는데 결과가 안 넣은 것과 **완전히 같다**」를 고정했고,
     * 그것이 「차단만 해제」를 금지하는 근거였다(계획서 §5.4) — 사용자가 **근거 없는 판정**을
     * 받기 때문이다.
     *
     * 세 축이 배선되면서 그 근거가 사라졌다. 이제 이월과세 판정은 실제 계산에 도달한다.
     */
    const withCarryover = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfo,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const withoutCarryover = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfo,
    } as never);

    expect(withoutCarryover.calculatedTax).toBe(71_260_000);
    expect(withCarryover.calculatedTax).not.toBe(withoutCarryover.calculatedTax);
  });
});
