/**
 * Pre-Do anchor: **§97의2(이월과세) × 부담부증여(§159①1호)** — 착수 조건 ④
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §5
 * 근거:   국세청 **재산세과-1059**(2009.12.18.) — 증여받은 자산을 다시 부담부증여하는 경우
 *         「시행령 §159 제1호에 따른 취득가액 산정 시 §97①1호 가액에 **이월과세가 적용되는 것임**」
 *
 * ## 이 anchor가 답하는 질문
 *
 * 「이월과세를 적용하면 세액이 **어느 방향으로 얼마나** 움직이는가」.
 * 계획서는 이를 착수 조건으로 걸어 두었다 — 방향조차 모르면 D-2(세액 비교)의 필요성을
 * 판단할 수 없기 때문이다.
 *
 * ## 실측 결론 — **두 축이 반대로 움직인다**
 *
 * | 축 | 이동 | 세액 |
 * |---|---|---|
 * | 취득가액 (§159①1호 **A**) | 수증자 취득 당시 → **원증여자** 취득 당시 기준시가(통상 더 낮다) | **↑ +72,475,000** |
 * | 보유기간 (§97의2③) | 수증자 취득일 → **원증여자** 취득일(길어진다) | **↓ −18,430,000** |
 *
 * ⇒ **순효과는 사안마다 갈린다.** 그래서 §97의2②3호(「적용한 세액이 적은 경우 미적용」)가
 *   장식이 아니라 **실질적으로 작동하는 분기**다 — 두 시나리오를 각각 §159 경로에 태워
 *   비교해야 한다(계획서 D-2). 한쪽만 구현하면 방향이 뒤집히는 사안에서 틀린 답이 나온다.
 *
 * ## ⭐ 부수 발견 — 두 축 모두 「입력 이동」으로 도달한다
 *
 * P-1·P-2 모두 **엔진 로직 변경 없이** 입력값만 바꿔 재현했다. 즉 §159의 A도, §97의2③ 연수도
 * 이미 입력에서 온다 ⇒ **신규 엔진 로직이 필요한 것은 세 가지로 좁혀진다**:
 *   ① §97의2②3호 세액 비교(두 시나리오 × §159 경로)
 *   ② §97의2①3호 증여세 필요경비 산입
 *   ③ 「어느 시점 값을 넣어야 하는가」의 UI·validate 안내(계획서 D-1)
 * 종전 계획서의 「엔진이 자동 치환할 수 없다」는 진단은 맞았으나, 그것이 **막는 이유는 아니다** —
 * 막는 것은 입력 의미의 모호함이지 계산 경로가 아니다.
 *
 * ⚠️ 현재 이 조합은 ⑧ validate가 **차단**한다(`transfer-tax-validate-bg.ts`).
 *    아래는 엔진 단독 호출이라 차단을 거치지 않는다 — 사용자 경로의 동작이 아니다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/**
 * 재산세과-1059 사실관계(1972 A취득 → 2007 A→B증여 → 2009 B→A 부담부증여)의 **기간 구조**를
 * 보존하되 연혁 세율을 피하려 현행 연도로 옮겼다: 원증여자 취득 2000 → 증여 2020 → 양도 2026.
 */
const bg = (landAcq: number, buildingAcq: number): BurdenedGiftInfo => ({
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: landAcq,
  buildingStdPriceAtAcquisition: buildingAcq,
});

function run(over: Partial<TransferTaxInput>) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "general_building",
      transferDate: new Date("2026-02-16"),
      acquisitionDate: new Date("2020-06-01"),
      transferPrice: 0,
      acquisitionPrice: 0,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: false,
      householdHousingCount: 0,
      transferType: "burdened_gift",
      ...over,
    } as Partial<TransferTaxInput>),
    rates,
  );
}

describe("PD — §97의2 × 부담부증여 Pre-Do", () => {
  it("PD-1 취득가액 축: 원증여자 취득 당시 기준시가로 옮기면 세액이 **오른다**", () => {
    const doneeBasis = run({ burdenedGiftInfo: bg(300_000_000, 100_000_000) } as never);
    const donorBasis = run({ burdenedGiftInfo: bg(60_000_000, 20_000_000) } as never);

    expect(doneeBasis.calculatedTax).toBe(62_045_000);
    expect(donorBasis.calculatedTax).toBe(134_520_000);
    // 취득가액이 낮아지므로 세액은 올라간다 — 이 방향이 뒤집히면 전제가 깨진 것이다.
    expect(donorBasis.calculatedTax).toBeGreaterThan(doneeBasis.calculatedTax);
  });

  it("PD-2 보유기간 축: 원증여자 취득일로 기산하면 세액이 **내린다**", () => {
    const acq2020 = run({
      acquisitionDate: new Date("2020-06-01"),
      burdenedGiftInfo: bg(300_000_000, 100_000_000),
    } as never);
    const acq2000 = run({
      acquisitionDate: new Date("2000-06-01"),
      burdenedGiftInfo: bg(300_000_000, 100_000_000),
    } as never);

    expect(acq2020.calculatedTax).toBe(62_045_000);
    expect(acq2000.calculatedTax).toBe(43_615_000);
    // 보유기간이 길어져 장기보유특별공제가 늘어난다.
    expect(acq2000.calculatedTax).toBeLessThan(acq2020.calculatedTax);
  });

  it("PD-3 ⇒ 두 축이 반대라 §97의2②3호 세액 비교가 **필수**다", () => {
    /**
     * 한 축만 구현하면(예: 취득가액만 원증여자 기준으로) 세액이 일방적으로 오르고,
     * 반대로 보유기간만 옮기면 일방적으로 내린다. 실제 §97의2는 **둘 다** 적용한 뒤
     * ②3호로 미적용 시나리오와 비교한다. ⇒ 부분 구현은 방향 자체가 틀릴 수 있다.
     */
    const base = run({ burdenedGiftInfo: bg(300_000_000, 100_000_000) } as never).calculatedTax;
    const priceAxisOnly = run({ burdenedGiftInfo: bg(60_000_000, 20_000_000) } as never).calculatedTax;
    const periodAxisOnly = run({
      acquisitionDate: new Date("2000-06-01"),
      burdenedGiftInfo: bg(300_000_000, 100_000_000),
    } as never).calculatedTax;

    expect(priceAxisOnly - base).toBe(72_475_000); // 상승
    expect(periodAxisOnly - base).toBe(-18_430_000); // 하락
    // 부호가 반대임을 명시 고정 — 계획서 §4.1 「부분 모드 지원 금지」의 수치 근거다.
    expect(Math.sign(priceAxisOnly - base)).not.toBe(Math.sign(periodAxisOnly - base));
  });
});
