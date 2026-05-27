/**
 * 주식 증여재산 합계 누락 교정 — anchor (증여세)
 *
 * 계획: docs/00-pm/inheritance-unlisted-simple-stock-gross-estate-wiring.plan.md (C7)
 * 증여세는 per-donee 과세 → 협의분할/heir 배부 없음. grossGiftValue 평가 포함만 단언.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import type { GiftTaxInput, EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function gi(giftItems: EstateItem[]): GiftTaxInput {
  return {
    giftDate: "2026-01-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems,
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: true },
  };
}

const grossGift = (r: ReturnType<typeof calcGiftTax>) =>
  (r as unknown as { grossGiftValue: number }).grossGiftValue;

describe("주식 grossGift 배선 — 증여세 (C7)", () => {
  it("listed_stock → grossGiftValue 포함", () => {
    const listed: EstateItem = {
      id: "L",
      category: "listed_stock",
      name: "삼성전자",
      listedStockAvgPrice: 70_000,
      listedStockShares: 10_000,
    };
    const r = calcGiftTax(gi([listed]));
    expect(grossGift(r)).toBe(computeStockValuation(listed));
    expect(grossGift(r)).toBe(70_000 * 10_000);
  });

  it("V1 간편 비상장 → grossGiftValue 포함", () => {
    const stock: EstateItem = {
      id: "U",
      category: "unlisted_stock",
      name: "비상장",
      unlistedValuationMode: "simple",
      unlistedStockData: {
        totalShares: 10_000,
        ownedShares: 10_000,
        weightedNetIncome: 100_000_000,
        netAssetValue: 5_000_000_000,
        capitalizationRate: 0.1,
      },
    };
    const expected = computeStockValuation(stock);
    expect(expected).toBeGreaterThan(0);
    const r = calcGiftTax(gi([stock]));
    expect(grossGift(r)).toBe(expected); // ★ 이전: 0
  });
});
