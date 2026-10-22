/**
 * anchor: **증축(3-way) × 일반건물 이월과세 × 환산 donor — 증여자 취득가액이 0이던 결함** (PR-0)
 *
 * 계획서: docs/00-pm/gb-card-built-penalty-114-2.plan.md §10.2 (Q-11 확정: PR-0 먼저)
 *
 * ## 결함
 * 환산 donor(`useEstimatedAcquisition`)의 취득가액은 단건 엔진 `calcCarryoverScenarios`가
 * `양도가액 × standardPriceAtAcquisition ÷ standardPriceAtTransfer`로 계산한다(`transfer-tax-carryover.ts` Step 4a).
 * 일반건물 카드에는 그 두 값이 없어서 `applyCarryoverEstimationBasis`가 **카드 조립 후** 일괄 주입한다.
 * 그 호출이 2-way(`general-building-valuation.ts:625`)와 실가(`general-building-route-actual.ts:480`)에는 있는데
 * **증축 3-way(`general-building-extension.ts`)에는 없어** scenarioA.acquisitionPrice 가 0이었다
 * (⑧ `validateGbCarryover`는 분자를 필수로 요구 — 입력 강제·미반영).
 * 기존 GX-1~4(`gb-carryover-card-wiring.anchor.test.ts`)는 실가 donor 만 검증해 이 셀을 가렸다.
 *
 * ## 기대값 손계산 (2-way 와 같은 규약: 파트 양도가액 × 증여자 취득시 기준시가 ÷ 그 파트 양도시 기준시가)
 * 총 양도가 1,000,000,000 · 3-way 양도시 기준시가: 토지 100㎡×2,000,000=200,000,000 · 건물1 200,000,000 · 건물2 50,000,000 (합 450,000,000)
 *   토지 양도가  = floor(1,000,000,000 × 200,000,000 / 450,000,000) = 444,444,444
 *   건물1 양도가 = floor(1,000,000,000 × 200,000,000 / 450,000,000) = 444,444,444
 *   건물2 양도가 = 1,000,000,000 − 888,888,888 = 111,111,112
 * 건물1 환산 donor = 444,444,444 × 100,000,000(분자) ÷ 200,000,000(건물1 양도시 기준시가) = 222,222,222
 *   (분모는 증축 부분을 **포함하지 않는다** — 2-way 가 `input.transferBuildingStdPrice`를 넘기는 것과 같다. 건물2는 수증자의 증축이라 이월과세 대상이 아니다: GX-3)
 * 토지 환산 donor = 444,444,444 × 50,000,000 ÷ 200,000,000 = 111,111,111
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

const BASE = {
  totalTransferPrice: 1_000_000_000,
  transferDate: D("2026-03-01"),
  acquisitionDate: D("2024-05-01"),
  landArea: 100,
  buildingArea: 200,
  buildingFootprintArea: 50,
  transferLandPricePerSqm: 2_000_000,
  transferBuildingStdPrice: 200_000_000,
  zoneType: "general_residential",
  acquisitionLandPricePerSqm: 1_000_000,
  acquisitionBuildingStdPrice: 100_000_000,
  buildingAcquisitionCause: "carryover_gift",
  buildingAcquisitionDate: D("2024-05-01"),
};
const EXT = {
  extensionDate: D("2022-06-01"),
  extensionArea: 100,
  extensionFloorArea85: 100,
  transferExtensionBuildingStdPrice: 50_000_000,
  acquisitionExtensionBuildingStdPrice: 20_000_000,
  extensionAcquisitionCause: "newConstruction" as const,
  acquisitionMode: "estimated" as const,
  // route-helper(`extensionBundledInjection`)가 항상 주입 — production 은 늘 이 값이 0 이어도 «있다»
  actualBundledAcquisitionPrice: 0,
  actualBundledExpenses: 0,
};
const CT = (over: object = {}) => ({
  giftRegistryDate: D("2024-05-01"),
  donorAcquisitionDate: D("2015-01-01"),
  donorAcquisitionPrice: 0,
  useEstimatedAcquisition: true,
  giftTaxAmount: 0,
  giftDateValuation: 800_000_000,
  donorStandardPriceAtAcquisition: 100_000_000,
  ...over,
});

function run(over: Record<string, unknown>) {
  const { aggregated } = calculateGeneralBuildingTransfer({ ...BASE, ...over } as never, 2026, 0, [], rates);
  const card = (id: string) => aggregated.properties.find((p) => p.propertyId === id);
  return { aggregated, card };
}

describe("PR-0 증축 × 이월과세 × 환산 donor", () => {
  it("X1 건물1 — scenarioA.acquisitionPrice = 222,222,222 (종전 0)", () => {
    const b1 = run({ buildingCarryoverTaxation: CT(), extensionInfo: EXT }).card("building1");
    expect(b1?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(222_222_222);
    expect(b1?.carryoverTaxationDetail?.scenarioA.acquisitionWasEstimated).toBe(true);
  });

  it("X2 토지 — 환산 donor 분자도 3-way 에서 도달한다 (111,111,111)", () => {
    const land = run({
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: CT({ donorStandardPriceAtAcquisition: 50_000_000 }),
      extensionInfo: EXT,
    }).card("land");
    expect(land?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(111_111_111);
  });

  it("X3 2-way 와 같은 규약 — 증축 없는 같은 건물 카드는 양도가 × 분자 ÷ 건물 양도시 기준시가", () => {
    // 증축 없음: 토지 200M · 건물 200M → 건물 양도가 500,000,000 → 500,000,000 × 100M / 200M = 250,000,000
    const b = run({ buildingCarryoverTaxation: CT() }).card("building");
    expect(b?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(250_000_000);
  });

  it("X4 건물2(증축분)는 이월과세 대상이 아니다 — 주입되지 않는다 (GX-3 유지)", () => {
    const b2 = run({ buildingCarryoverTaxation: CT(), extensionInfo: EXT }).card("building2");
    expect(b2?.carryoverTaxationDetail).toBeUndefined();
  });

  it("X5 실가 donor 는 종전 그대로 (회귀 0)", () => {
    const b1 = run({
      buildingCarryoverTaxation: CT({ useEstimatedAcquisition: false, donorAcquisitionPrice: 50_000_000, donorStandardPriceAtAcquisition: undefined }),
      extensionInfo: EXT,
    }).card("building1");
    expect(b1?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(50_000_000);
  });

  it("X6 이월과세 아님(대조군) — 증축 비이월 세액은 donor 입력과 무관", () => {
    const a = run({ buildingAcquisitionCause: "purchase", extensionInfo: EXT }).aggregated.determinedTax;
    const b = run({ buildingAcquisitionCause: "purchase", extensionInfo: EXT, buildingCarryoverTaxation: undefined }).aggregated.determinedTax;
    expect(a).toBe(b);
  });
  it("X7 토지·건물 분모가 서로 다르면 각자 자기 분모를 쓴다 (분모 뒤바뀜 방지 — 뮤테이션 M2·M5)", () => {
    // 토지 양도시 300,000,000(3,000,000/㎡ × 100) · 건물1 200,000,000 · 건물2 50,000,000 (합 550,000,000)
    //   토지 양도가  = floor(1,000,000,000 × 300/550) = 545,454,545 → 토지 환산 donor = floor(545,454,545 × 60,000,000 / 300,000,000) = 109,090,909
    //   건물1 양도가 = floor(1,000,000,000 × 200/550) = 363,636,363 → 건물 환산 donor = floor(363,636,363 × 100,000,000 / 200,000,000) = 181,818,181
    const r = run({
      transferLandPricePerSqm: 3_000_000,
      landAcquisitionCause: "carryover_gift",
      landCarryoverTaxation: CT({ donorStandardPriceAtAcquisition: 60_000_000 }),
      buildingCarryoverTaxation: CT(),
      extensionInfo: EXT,
    });
    expect(r.card("land")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(109_090_909);
    expect(r.card("building1")?.carryoverTaxationDetail?.scenarioA.acquisitionPrice).toBe(181_818_181);
  });
});
