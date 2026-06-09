/**
 * sidebar-valuation-single-source — 사이드바 합계 평가 단일 소스화 anchor
 *
 * Design: docs/02-design/features/inheritance-sidebar-valuation-single-source.engine.design.md
 *
 * 배경: 사이드바 estimateAssetValue가 비상장 V1·deposit·similarSales를 누락(0)하던 dual-truth를
 *       computeEffectiveValuation 위임으로 해소. 엔진(computeStockValuation)과 일치.
 *
 * 검증:
 *   A-1 비상장 V1(unlistedStockData) → 사이드바 = 엔진 (이전 0 → 정정)
 *   A-4 deposit(leaseDeposit만) → 사이드바 반영 (이전 0)
 *   A-4b similarSalesValue → 사이드바 반영 (이전 0)
 *   A-5 명시 평가액(marketValue) → 무인자 computeEffectiveValuation 동작 불변
 */

import { describe, it, expect } from "vitest";
import { sumEstateItemsValuation } from "@/lib/stores/inheritance-summary";
import { computeStockValuation } from "@/lib/tax-engine/valuation/resolve-estate-item-value";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const v1Stock = {
  id: "s1",
  category: "unlisted_stock",
  name: "비상장M",
  unlistedValuationMode: "simple",
  unlistedStockData: {
    totalShares: 10000,
    ownedShares: 5000,
    weightedNetIncome: 0,
    netIncomeY1: 100_000_000,
    netIncomeY2: 80_000_000,
    netIncomeY3: 60_000_000,
    netAssetValue: 1_000_000_000,
    capitalizationRate: 0.1,
  },
} as unknown as EstateItem;

describe("[단일소스] 사이드바 평가 위임", () => {
  it("A-1: 비상장 V1 → 사이드바 = 엔진 (이전 0)", () => {
    const sidebar = sumEstateItemsValuation([v1Stock]);
    const engine = computeStockValuation(v1Stock);
    expect(engine).toBe(459_980_000);
    expect(sidebar).toBe(engine); // dual-truth 해소
  });

  it("A-4: deposit(leaseDeposit만) → 사이드바 반영", () => {
    const deposit = {
      id: "d1",
      category: "deposit",
      name: "전세보증금반환채권",
      leaseDeposit: 200_000_000,
    } as unknown as EstateItem;
    expect(sumEstateItemsValuation([deposit])).toBe(200_000_000);
  });

  it("A-4b: similarSalesValue → 사이드바 반영", () => {
    const apt = {
      id: "a1",
      category: "real_estate_apartment",
      name: "아파트",
      similarSalesValue: 300_000_000,
    } as unknown as EstateItem;
    expect(sumEstateItemsValuation([apt])).toBe(300_000_000);
  });

  it("A-5: 명시 평가액(marketValue) → 무인자 computeEffectiveValuation 동작 불변", () => {
    const fin = {
      id: "f1",
      category: "financial",
      name: "예금",
      marketValue: 400_000_000,
    } as unknown as EstateItem;
    expect(computeEffectiveValuation(fin)).toBe(400_000_000);
    expect(sumEstateItemsValuation([fin])).toBe(400_000_000);
  });
});
