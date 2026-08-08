/**
 * anchor: **부담부증여 × 이월과세(증여)** 차단의 근거 (§10-6)
 *
 * 계획서: `docs/02-design/features/transfer-gb-inheritance-extension-3part.plan.md` §10-6
 *
 * ## 두 스텝이 함께 돌고, 뒤엣것이 앞엣것을 덮는다
 *
 * STEP 0.475(이월과세 §97의2)가 `workingInput`을 시나리오 결과로 바꾼 뒤,
 * STEP 0.48(부담부증여 §159)이 `transferPrice`·`acquisitionPrice`·`expenses`를 안분값으로
 * **덮어쓴다**. ⇒ 이월과세 입력은 세액에 도달하지 않는다.
 *
 * ⚠️ **「§97의2가 부담부증여에 적용되지 않는다」는 판정을 고정하는 것이 아니다.** 그 판정은
 *    아직 서 있지 않다 — 「소득세법 시행령」 제159조 제1항 제1호의 **A**는 「법 제97조제1항제1호에
 *    따른 가액」이고, 「소득세법」 제97조의2 제1항 제1호가 바로 그 금액을 증여자의 취득 당시
 *    가액으로 치환하므로 **법문상으로는 연결된다**. 국세청 해석 2건이 존재하나 본문 미확인이다.
 *    이 테스트가 고정하는 것은 **현행 구현이 무엇을 하는가**이고, 그것이 ⑧ 차단의 근거다.
 *    적용해야 한다는 근거가 확인되면 **엔진을 먼저 고치고** 이 파일과 차단을 함께 손본다.
 */

import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { validateBurdenedGiftAsset } from "@/lib/calc/transfer-tax-validate-bg";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

const burdenedGiftInfo: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 200_000_000,
  annualRentTotal: 0,
  landStdPriceAtTransfer: 600_000_000,
  buildingStdPriceAtTransfer: 200_000_000,
  landStdPriceAtAcquisition: 300_000_000,
  buildingStdPriceAtAcquisition: 100_000_000,
};

/** 증여 2023-06-01(10년 룰) · 양도 2026-02-16 → 이월과세 적용기간 안. */
const carryover = (donorAcquisitionPrice: number) => ({
  giftRegistryDate: new Date("2023-06-01"),
  donorAcquisitionDate: new Date("2012-01-01"),
  donorAcquisitionPrice,
  useEstimatedAcquisition: false,
  giftTaxAmount: 0,
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

describe("CO-1 대조군 — 이월과세 단독은 증여자 취득가액에 크게 반응한다", () => {
  /**
   * 이것이 없으면 CO-2의 「무반응」이 **픽스처가 이월과세 적용기간을 벗어난 탓**인지
   * 구별되지 않는다. 실제로 probe 첫 시도가 그 함정에 빠졌다(증여일 2020 → 5년 룰 초과).
   */
  it("증여자 취득가액 1억 vs 7억 → 204,930,000 vs 93,110,000", () => {
    const low = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(100_000_000),
    } as never);
    const high = run({
      transferPrice: 900_000_000,
      acquisitionCause: "carryover_gift",
      carryoverTaxation: carryover(700_000_000),
    } as never);
    expect(low.calculatedTax).toBe(204_930_000);
    expect(high.calculatedTax).toBe(93_110_000);
  });
});

describe("CO-2 부담부증여를 얹으면 이월과세가 세액에 도달하지 않는다", () => {
  const bg = { transferType: "burdened_gift", burdenedGiftInfo } as Partial<TransferTaxInput>;

  it("증여자 취득가액을 흔들어도 부담부증여 단독과 같다 (71,260,000)", () => {
    const alone = run(bg);
    const withLow = run({ ...bg, acquisitionCause: "carryover_gift", carryoverTaxation: carryover(100_000_000) } as never);
    const withHigh = run({ ...bg, acquisitionCause: "carryover_gift", carryoverTaxation: carryover(700_000_000) } as never);

    expect(alone.calculatedTax).toBe(71_260_000);
    expect(withLow.calculatedTax).toBe(alone.calculatedTax);
    expect(withHigh.calculatedTax).toBe(alone.calculatedTax);
  });

  it("취득원인 네 가지가 모두 같은 세액을 낸다 — 그래서 차단이 손해가 없다", () => {
    /**
     * §159가 취득가액을 정하므로 취득원인은 세액을 가르지 않는다. ⑧ 차단이 「증여로
     * 선택하세요」라고 안내해도 사용자가 얻는 답이 **동일하다**는 것이 그 안내의 근거다.
     */
    const taxes = [
      run(bg).calculatedTax,
      run({ ...bg, acquisitionCause: "gift", acquisitionPrice: 400_000_000 } as never).calculatedTax,
      run({ ...bg, acquisitionCause: "inheritance", acquisitionPrice: 400_000_000 } as never).calculatedTax,
      run({ ...bg, acquisitionCause: "carryover_gift", carryoverTaxation: carryover(100_000_000) } as never).calculatedTax,
    ];
    expect(new Set(taxes).size).toBe(1);
    expect(taxes[0]).toBe(71_260_000);
  });
});

describe("CO-3 ⑧ validate — 조합을 차단하고 「증여」로 안내한다", () => {
  const base = {
    ...makeDefaultAsset(1),
    assetKind: "general_building" as const,
    transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard",
    bgLendingDepositTotal: "300000000",
    bgMortgageDebtAmount: "200000000",
    bgDonorRelation: "lineal_descendant",
    // (5-b) 일반건물 부담부증여는 §159①1호 환산용 취득시 기준시가를 요구한다.
    gbAcqLandPricePerSqm: "2130000",
    gbAcqBuildingValue: "424472064",
    gbLandArea: "1279",
  };

  it("이월과세(증여) → 차단", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, acquisitionCause: "carryover_gift" } as never,
      "자산1",
    );
    expect(v).toMatch(/「이월과세\(증여\)」 취득원인과 함께 쓸 수 없습니다/);
    expect(v).toMatch(/「증여」로 선택하세요/);
  });

  it("증여 → 통과 (안내가 가리키는 목적지가 실제로 열려 있다)", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, acquisitionCause: "gift" } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });

  it("부담부증여가 아니면 이월과세를 막지 않는다 (회귀 0)", () => {
    const v = validateBurdenedGiftAsset(
      { ...base, transferType: "regular", acquisitionCause: "carryover_gift" } as never,
      "자산1",
    );
    expect(v).toBeNull();
  });
});
