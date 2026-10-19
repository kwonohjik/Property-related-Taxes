/**
 * 파트 이월과세 `SplitCarryoverEventEcho.orderDependent` — «안정 구성이 둘이라 판정 순서가 결과를 가른다» 표지 (P2 C, 표시 전용)
 *
 * 설계: ui.design.md §12 U-9 · engine.design.md §4.2(단기 구간 100/1,050) · anchor SPCO-T9
 * 해결자를 stub으로 돌려 결정세액 4조합 표를 정한다(resolver.test.ts와 같은 방식). 표지는 세액·채택을 바꾸지 않는다.
 */
import { describe, it, expect } from "vitest";
import { calcSplitCarryoverScenarios } from "@/lib/tax-engine/transfer-tax-split-carryover";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

const D = (s: string) => new Date(s);
const GIFT = D("2023-03-01");
const LAND_DONOR = D("1995-03-01");
const BUILDING_DONOR = D("2015-06-01");
const rates = makeMockRates();
const ct = (donor: Date, price: number) => ({
  giftRegistryDate: GIFT, donorAcquisitionDate: donor, donorAcquisitionPrice: price, useEstimatedAcquisition: false,
  giftTaxAmount: 0, giftDateValuation: 100_000_000, donorRelation: "lineal" as const, exclusionDeclared: {},
});
function inputC(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    transferPrice: 1_200_000_000, transferDate: D("2025-06-30"), acquisitionPrice: 0, acquisitionDate: GIFT, isOneHousehold: false, householdHousingCount: 2,
    landAcquisitionDate: GIFT, landAcqMode: "actual", buildingAcqMode: "actual", saleSplitMode: "actual",
    landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000,
    landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 100_000_000, acquisitionCause: "carryover_gift", landAcquisitionCause: "carryover_gift", isSeparateAcquisition: false,
    carryoverGiftEvent: { giftRegistryDate: GIFT, giftTaxCalculated: 0, giftTaxBase: 200_000_000 },
    landCarryoverTaxation: ct(LAND_DONOR, 50_000_000),
    buildingCarryoverTaxation: ct(BUILDING_DONOR, 50_000_000),
    ...over,
  });
}
const sideOf = (i: TransferTaxInput) => ({
  land: i.landAcquisitionDate!.getTime() === LAND_DONOR.getTime() ? "A" : "B",
  building: i.acquisitionDate.getTime() === BUILDING_DONOR.getTime() ? "A" : "B",
});
const stub = (table: Record<string, number>) => (i: TransferTaxInput) => {
  const s = sideOf(i);
  return { determinedTax: table[`${s.land}${s.building}`] };
};

describe("orderDependent", () => {
  it("SPCO-T9 표(안정 구성 {BA, AB} 둘) → true — 순차 고정점은 BA(토지 먼저)로 가고 세액은 그대로", () => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub({ AA: 292_500_000, AB: 341_250_000, BA: 320_250_000, BB: 208_250_000 }));
    expect(out!.detail.event.orderDependent).toBe(true);
    expect(out!.detail.land!.judgment).toBe("excluded"); // 채택은 종전 그대로
    expect(out!.detail.building!.judgment).toBe("applied");
  });

  it.each([
    ["안정 구성이 하나(AA — 둘 다 적용이 가장 크다)", { AA: 300, AB: 200, BA: 200, BB: 100 }],
    ["동률 전부 — 전부 A만 안정", { AA: 100, AB: 100, BA: 100, BB: 100 }],
    ["둘 다 B가 안정(적용하면 세액이 더 적다)", { AA: 100, AB: 150, BA: 150, BB: 300 }],
  ])("%s → 표지 없음", (_, table) => {
    const out = calcSplitCarryoverScenarios(inputC(), rates, stub(table));
    expect(out!.detail.event.orderDependent).toBeUndefined();
  });

  it("파트가 하나뿐이면 순서가 없다 — 표지 없음", () => {
    const input = inputC({ buildingCarryoverTaxation: undefined, acquisitionCause: "purchase", acquisitionDate: D("2021-03-01") });
    const out = calcSplitCarryoverScenarios(input, rates, (i) => ({ determinedTax: i.landAcquisitionDate!.getTime() === LAND_DONOR.getTime() ? 10 : 20 }));
    expect(out!.detail.event.orderDependent).toBeUndefined();
  });

  it("호출은 여전히 4조합 상한(메모이즈 — 표지 판정이 추가 호출을 만들지 않는다)", () => {
    const calls: string[] = [];
    calcSplitCarryoverScenarios(inputC(), rates, (i) => {
      const s = sideOf(i);
      calls.push(`${s.land}${s.building}`);
      return { determinedTax: ({ AA: 292_500_000, AB: 341_250_000, BA: 320_250_000, BB: 208_250_000 } as Record<string, number>)[`${s.land}${s.building}`] };
    });
    expect(calls.length).toBeLessThanOrEqual(4);
    expect(new Set(calls).size).toBe(calls.length);
  });
});
