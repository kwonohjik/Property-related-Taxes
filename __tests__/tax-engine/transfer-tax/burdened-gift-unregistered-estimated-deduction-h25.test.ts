/**
 * Anchor — H-25 부담부증여 미등기양도자산 개산공제율 0.3% (소령 §163⑥1호 단서)
 *
 * §104③ 미등기양도자산의 개산공제는 취득당시 기준시가 × 3/1000(0.3%). 등기 3%(3/100)의 1/10.
 * 종전: estimatedDeductionForBurdenedGift이 항상 3% → 미등기 자산 개산공제 10배 과대(과소과세).
 * 부담부증여는 transfer 모드 → TransferTaxInput.isUnregistered(기존 미등기 토글) 재사용.
 */
import { describe, it, expect } from "vitest";
import {
  estimatedDeductionForBurdenedGift,
  buildBurdenedGiftBreakdown,
} from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

describe("H-25 estimatedDeductionForBurdenedGift 미등기 0.3%", () => {
  it("등기(기본) = 3%", () => {
    expect(estimatedDeductionForBurdenedGift(100_000_000)).toBe(3_000_000);
    expect(estimatedDeductionForBurdenedGift(100_000_000, false)).toBe(3_000_000);
  });
  it("미등기 = 0.3% (10배 축소)", () => {
    expect(estimatedDeductionForBurdenedGift(100_000_000, true)).toBe(300_000);
  });
});

describe("H-25 buildBurdenedGiftBreakdown 미등기 배선 (K-5 환산경로)", () => {
  const info: BurdenedGiftInfo = {
    valuationMode: "sangjeungbeop_market",
    acquisitionMethod: "converted",
    lendingDepositTotal: 155_000_000,
    mortgageDebtAmount: 0,
    annualRentTotal: 0,
    marketValueAtTransfer: 450_000_000,
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
  };
  const stdPrices = {
    landStdPriceAtTransfer: 315_000_000,
    buildingStdPriceAtTransfer: 135_000_000,
    landStdPriceAtAcquisition: 147_000_000,
    buildingStdPriceAtAcquisition: 63_000_000,
  };

  it("등기(기본): 개산공제 3% — 회귀 보존", () => {
    const b = buildBurdenedGiftBreakdown({ ...stdPrices, info });
    expect(b.perAsset.land.estimatedDeduction).toBe(1_518_999); // 50,633,333 × 3%
    expect(b.perAsset.building.estimatedDeduction).toBe(651_000); // 21,700,000 × 3%
  });

  it("미등기: 개산공제 0.3% (1/10)", () => {
    const b = buildBurdenedGiftBreakdown({ ...stdPrices, info, isUnregistered: true });
    expect(b.perAsset.land.estimatedDeduction).toBe(151_899); // floor(50,633,333 × 0.003)
    expect(b.perAsset.building.estimatedDeduction).toBe(65_100); // 21,700,000 × 0.003
  });
});
