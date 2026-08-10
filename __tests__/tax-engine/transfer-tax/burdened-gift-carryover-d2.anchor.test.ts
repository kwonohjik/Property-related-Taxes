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
 * ## 🔴 그런데 그래서 **더 나쁘다** — 한쪽 축만 살아남는다
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

  it("D2-2 🔴 부담부증여: A가 싸져 **이월과세가 자동 배제**된다 (방향이 뒤집힌다)", () => {
    const r = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgInfo,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover,
    } as never);
    const d = r.carryoverTaxationDetail;

    expect(d?.scenarioA.determinedTax).toBe(43_615_000);
    expect(d?.scenarioB.determinedTax).toBe(71_260_000);
    // 대조군과 **부등호가 반대**다 — 이것이 결함의 증상이다.
    expect(d?.scenarioA.determinedTax).toBeLessThan(d!.scenarioB.determinedTax);
    expect(d?.adoptedScenario).toBe("B");
    expect(d?.comparisonExclusion).toBe(true);
    expect(d?.exclusionReason).toBe("tax_comparison");
    // 결국 부담부증여 단독과 같은 세액이 된다 — 이월과세가 세액에 닿지 않는다.
    expect(r.calculatedTax).toBe(71_260_000);
  });

  it("D2-3 ⇒ 차단을 「그냥 푸는」 것이 금지되는 이유", () => {
    /**
     * ⑧ validate 차단을 제거하면 사용자는 「이월과세를 검토했고 불리해서 미적용」이라는
     * **판정**을 받는다. 그 판정은 §159가 취득가액 축을 삼킨 탓에 생긴 것이라 **근거가 없다**.
     * 침묵 오답보다 나쁘다 — 사용자가 답을 받았다고 믿기 때문이다.
     *
     * ⇒ 계획서 §4.1 「부분 지원 금지」에 **경로 하나 더** 추가된다: 「차단만 해제」도 금지다.
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
    // 「이월과세 판정」을 거쳤는데 결과는 이월과세를 안 넣은 것과 **완전히 같다**.
    expect(withCarryover.calculatedTax).toBe(withoutCarryover.calculatedTax);
  });
});
