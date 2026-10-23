/**
 * `buildBurdenedGiftBreakdown` × 의제취득일(1985.1.1.) 전 상속·증여 (계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md` §18).
 * route 경로는 `__tests__/api/transfer.route.bg-pre-deemed-159.routes.anchor.test.ts`가 원 단위로 고정한다. 여기서는 분기·슬롯·경계.
 */
import { describe, it, expect } from "vitest";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import { withDeemedAcquisitionStd } from "@/lib/tax-engine/burdened-gift-valuation";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const land: BurdenedGiftInfo = {
  valuationMode: "sangjeungbeop_market",
  lendingDepositTotal: 0,
  mortgageDebtAmount: 460_000_000,
  annualRentTotal: 0,
  marketValueAtTransfer: 920_000_000,
  landStdPriceAtTransfer: 1_243_350_000,
  buildingStdPriceAtTransfer: 0,
  landStdPriceAtAcquisition: 999_999_999, // 사용자가 고른 산정방식의 「취득시 기준시가」 — 의제취득일 전이면 쓰지 않는다
  buildingStdPriceAtAcquisition: 0,
  acquisitionMethod: "actual",
  actualAcquisitionTotal: 10_000_000,
} as BurdenedGiftInfo;

const run = (info: BurdenedGiftInfo, preDeemed: Parameters<typeof buildBurdenedGiftBreakdown>[0]["preDeemed"], extra: Record<string, unknown> = {}) =>
  buildBurdenedGiftBreakdown({
    landStdPriceAtTransfer: info.landStdPriceAtTransfer,
    buildingStdPriceAtTransfer: info.buildingStdPriceAtTransfer,
    landStdPriceAtAcquisition: info.landStdPriceAtAcquisition,
    buildingStdPriceAtAcquisition: info.buildingStdPriceAtAcquisition,
    info,
    preDeemed,
    ...extra,
  });

const converted = { stdAtDeemed: 202_620_000, acquisition: 149_925_925, selected: "converted" as const, reported: null, sec164: null, converted: 149_925_925 };

describe("§159①1호 A — 의제취득일 전", () => {
  it("E-1 ③ 채택 → 환산 경로 · 개산공제 base = 의제취득일 기준시가 × β (사용자가 고른 실지 1천만은 쓰지 않는다)", () => {
    const b = run(land, converted);
    expect(b.acquisitionMethodUsed).toBe("converted");
    expect(b.perAsset.land.stdPriceAtAcquisition).toBe(202_620_000);
    expect(b.perAsset.land.acquisitionPrice).toBe(74_962_962);
    expect(b.perAsset.land.estimatedDeduction).toBe(3_039_300); // 202,620,000 × 0.5 × 3%
  });

  it("E-2 ① 채택 → 실지 경로 · 개산공제 없음 · 실제 경비 × β", () => {
    const b = run(land, { ...converted, acquisition: 300_000_000, selected: "reported", reported: 300_000_000 }, { capitalExpenditure: 10_000_000 });
    expect(b.acquisitionMethodUsed).toBe("actual");
    expect(b.perAsset.land.acquisitionPrice).toBe(150_000_000);
    expect(b.perAsset.land.actualAcquisition).toBe(300_000_000);
    expect(b.perAsset.land.estimatedDeduction).toBe(5_000_000);
  });

  it("E-3 기준시가 평가 · 의제취득일 기준시가 0 → 400(취득가액 0 오답을 막는다)", () => {
    expect(() => run({ ...land, valuationMode: "sangjeungbeop_standard" }, { ...converted, stdAtDeemed: 0 })).toThrow(/의제취득일 기준시가를 입력하세요/);
  });

  it("E-4 기준시가 평가 → 의제취득일 기준시가 × β · echo deemed_std", () => {
    const b = run({ ...land, valuationMode: "sangjeungbeop_standard" }, converted);
    expect(b.acquisitionMethodUsed).toBe("standard_price");
    expect(b.preDeemed).toEqual({ basis: "deemed_std", stdAtDeemed: 202_620_000 });
  });

  it("E-5 preDeemed가 없으면 종전 그대로(실지 1천만 × β)", () => {
    const b = run(land, undefined);
    expect(b.perAsset.land.acquisitionPrice).toBe(5_000_000);
    expect(b.preDeemed).toBeUndefined();
  });
});

describe("withDeemedAcquisitionStd — 슬롯", () => {
  it("S-1 토지(건물 양도시 0) → 토지 슬롯 · 주택(토지 양도시 0) → 건물 슬롯 · 둘 다면 양도시 비율", () => {
    expect(withDeemedAcquisitionStd(land, 100)).toMatchObject({ landStdPriceAtAcquisition: 100, buildingStdPriceAtAcquisition: 0 });
    const house = { ...land, landStdPriceAtTransfer: 0, buildingStdPriceAtTransfer: 500 };
    expect(withDeemedAcquisitionStd(house, 100)).toMatchObject({ landStdPriceAtAcquisition: 0, buildingStdPriceAtAcquisition: 100 });
    const both = { ...land, landStdPriceAtTransfer: 300, buildingStdPriceAtTransfer: 100 };
    expect(withDeemedAcquisitionStd(both, 100)).toMatchObject({ landStdPriceAtAcquisition: 75, buildingStdPriceAtAcquisition: 25 });
  });
});
