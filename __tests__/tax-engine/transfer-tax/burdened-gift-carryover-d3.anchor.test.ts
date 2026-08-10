/**
 * anchor: **D-3 — 증여세 상당액(§97의2①3호)은 채무비율 안분 후 산입된다**
 *
 * 계획서: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §5.7
 *
 * ## 🔴 종전 조사(2026-08-10 오전)의 「명문 0건」은 **틀렸다**
 *
 * 그때는 KoreanLaw 쿼터가 소진돼 **요건 조항 본문을 못 읽은 채** 「명문이 없다」고 적었다.
 * 원문을 읽으니 **비율 산식이 조문에 있다** ([[feedback_no_statute_claim_needs_requirement_article]]).
 *
 * 「소득세법 시행령」 **제163조의2 제2항** —
 *   증여세 상당액 = 제1호(증여세 산출세액) × **제2호 ÷ 제3호**
 *   · 2호: 「법 제97조의2제1항에 따라 **양도한 해당 자산가액**(증여세가 과세된 증여세 과세가액을 말한다)」
 *   · 3호: 「상속세 및 증여세법」 제47조에 따른 증여세 과세가액(**전체**)
 *   후단: 「필요경비로 산입되는 증여세 상당액은 **양도가액에서 법 제97조제1항 및 제2항의 금액을
 *         공제한 잔액**을 한도로 한다」
 *
 * ⇒ 조문은 이미 「**양도한 몫 ÷ 증여받은 전체**」로 증여세를 **나눠 쓰도록** 정하고 있다.
 *   부담부증여에서 「양도한」 것은 **채무액에 해당하는 부분뿐**이다(법 §88 1호 후단·시행령 §159).
 *   전액 산입은 **양도하지 않은 부분**에 대응하는 증여세까지 분자에 넣는 것이라 산식과 충돌한다.
 *   ⇒ 「명문 부재 = 납세자 유리」는 **발동하지 않는다**. 명문이 있다.
 *
 * ## 그리고 살아 있는 코드가 이미 그렇게 하고 있다
 *
 * D3-2가 실측한다 — K-4(실지취득가) 경로에서 증여세 5천만원은 **양도비 5천만원과 완전히 같은
 * 금액**(27,777,777 = 5천만 × 채무비율 5억/9억)만큼 양도차익을 줄인다. 증여세가
 * `transferExpense`에 얹히고, 그 실비 총액을 `burdened-gift-apportionment.ts:257`이
 * 채무비율로 안분하기 때문이다. ⇒ **안 ②(전액)를 채택하면 현행 동작을 되레 바꿔야 한다.**
 *
 * ## ⚠️ 이 조합은 ⑧ validate가 차단한다
 *
 * `transfer-tax-validate-bg.ts`가 부담부증여 × 이월과세를 막으므로 아래는 **사용자 경로의
 * 동작이 아니다**(엔진 단독 호출). D-7에서 차단을 풀 때 D3-3이 뒤집혀야 한다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** K-1~K-3: 상증법 기준시가 모드 — 취득가액도 기준시가(§159①1호 A괄호). */
const bgStandard: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
};

/** K-4: 시가 모드 + 실지취득가 — 실비(자본적지출·양도비)가 살아 있는 유일한 분기. */
const bgActual = {
  ...bgStandard,
  valuationMode: "sangjeungbeop_market",
  marketValueAtTransfer: 900_000_000,
  marketValueAtAcquisition: 400_000_000,
  acquisitionMethod: "actual",
  actualAcquisitionTotal: 400_000_000,
} as BurdenedGiftInfo;

/** 증여 2023-06-01(≥ 10년 룰) · 양도 2026-02-16 ⇒ 적용기간 안. */
const co = (giftTaxAmount: number) => ({
  giftRegistryDate: new Date("2023-06-01"),
  donorAcquisitionDate: new Date("2000-06-01"),
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount,
  giftDateValuation: 600_000_000,
});

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

describe("D3 — §163의2② 증여세 상당액과 채무비율", () => {
  it("D3-1 한도(§163의2② 후단)는 이미 「양도로 보는 부분」의 양도차익이다", () => {
    // 부담부증여 단독의 양도차익 = 채무비율 안분 후 값.
    const bgOnly = run({ transferType: "burdened_gift", burdenedGiftInfo: bgStandard } as never);
    expect(bgOnly.transferGain).toBe(242_500_000);

    // 이월과세를 얹었을 때의 한도가 그 값과 **같다** ⇒ 한도 축은 이미 「양도로 보는 부분」이다.
    const withCo = run({
      transferType: "burdened_gift",
      burdenedGiftInfo: bgStandard,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: co(5_000_000_000),
    } as never);
    expect(withCo.carryoverTaxationDetail?.scenarioA.giftTaxLimitCap).toBe(242_500_000);

    // 대조군 — 일반 양도(부담부증여 아님)에서는 자산 전체 양도차익이 한도다.
    const plain = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: co(5_000_000_000),
    } as never);
    expect(plain.carryoverTaxationDetail?.scenarioA.giftTaxLimitCap).toBe(800_000_000);
  });

  it("D3-2 ⭐ 증여세 5천만원의 효과 = 양도비 5천만원의 효과 (둘 다 채무비율 안분)", () => {
    const k4 = (over: Partial<TransferTaxInput>) =>
      run({ transferType: "burdened_gift", burdenedGiftInfo: bgActual, ...over } as never);

    const giftNone = k4({ acquisitionCause: "carryover_gift", carryoverTaxation: co(0) } as never);
    const gift50 = k4({
      acquisitionCause: "carryover_gift",
      carryoverTaxation: co(50_000_000),
    } as never);
    const expenseNone = k4({});
    const expense50 = k4({ transferExpense: 50_000_000 });

    const APPORTIONED = 27_777_777; // 50,000,000 × 5억(채무) ÷ 9억(증여가액)
    expect(giftNone.carryoverTaxationDetail?.scenarioA.transferGain).toBe(277_777_779);
    expect(gift50.carryoverTaxationDetail?.scenarioA.transferGain).toBe(
      277_777_779 - APPORTIONED,
    );
    expect(expenseNone.transferGain - expense50.transferGain).toBe(APPORTIONED);

    // 🔑 「전액 차감」이었다면 델타가 50,000,000이어야 한다 — 아니다.
    expect(APPORTIONED).toBeLessThan(50_000_000);
  });

  it("D3-3 🔴 그러나 기준시가 모드(K-1~K-3)에서는 세액에 **전혀 도달하지 않는다**", () => {
    /**
     * `giftTaxAddedToExpense`(표시값)는 커지는데 **결정세액이 움직이지 않는다**.
     * 증여세를 `transferExpense`에 얹지만(`transfer-tax-carryover.ts:289`) 기준시가 모드는
     * 개산공제 경로(§163⑥)라 실비를 아예 읽지 않기 때문이다.
     *
     * ⇒ D-2가 찾은 「취득가액 축 소멸」과 **같은 종류의 두 번째 소실**이다. 결과 화면에는
     *   「증여세 상당액 산입」이 뜨는데 세액은 그대로 — 침묵 오답보다 나쁘다.
     *   D-3은 「안분 비율을 고르는 문제」가 아니라 **배선을 만드는 문제**였다.
     */
    const taxes = [0, 50_000_000, 5_000_000_000].map((gt) => {
      const r = run({
        transferType: "burdened_gift",
        burdenedGiftInfo: bgStandard,
        acquisitionCause: "carryover_gift",
        carryoverTaxation: co(gt),
      } as never);
      return {
        added: r.carryoverTaxationDetail?.scenarioA.giftTaxAddedToExpense,
        taxA: r.carryoverTaxationDetail?.scenarioA.determinedTax,
      };
    });

    // 산입액은 커진다 (표시상으로는 반영된 것처럼 보인다)
    expect(taxes.map((t) => t.added)).toEqual([0, 50_000_000, 242_500_000]);
    // 그런데 시나리오 A 세액은 **완전히 동일하다**
    expect(taxes.map((t) => t.taxA)).toEqual([43_615_000, 43_615_000, 43_615_000]);
  });
});
