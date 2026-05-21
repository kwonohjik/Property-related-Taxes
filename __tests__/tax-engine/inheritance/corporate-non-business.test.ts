/**
 * 법인 사업무관자산 차감 — anchor 테스트 (PR-C F-8)
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21)
 * 계획서: docs/00-pm/inheritance-farming-remaining-prs.plan.md §6
 *
 * 산식: adjustedValue = floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 */

import { describe, expect, it } from "vitest";

import { calcCorporateStockAdjustedValue } from "@/lib/tax-engine/property-valuation-corporate";
import {
  suggestFamilyBusinessValue,
  suggestFarmingAssetValue,
} from "@/lib/calc/inheritance-deduction-suggest";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

function stockItem(over: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "s1",
    category: "unlisted_stock",
    name: "테스트 비상장주식",
    marketValue: 1_000_000_000,
    ...over,
  };
}

describe("calcCorporateStockAdjustedValue — 법인 사업무관자산 차감 (§15⑤2호 + §16⑤2호)", () => {
  it("FNB-1: 사업무관자산 0 → adjustedValue=stockValue", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 2_000_000_000, undefined);
    expect(r.adjustedValue).toBe(1_000_000_000);
    expect(r.sumOfNonBusiness).toBe(0);
    expect(r.ratio).toBe(1);
  });

  it("FNB-2: 비사업용토지 50% → adjustedValue=stockValue×0.5", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 2_000_000_000, {
      nonBusinessLand: 1_000_000_000,
    });
    expect(r.adjustedValue).toBe(500_000_000);
    expect(r.sumOfNonBusiness).toBe(1_000_000_000);
    expect(r.ratio).toBe(0.5);
  });

  it("FNB-3: 5종 모두 입력 (합 30%) → 70% 적용", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 10_000_000_000, {
      nonBusinessLand: 1_000_000_000,
      rentedRealEstate: 500_000_000,
      externalLoans: 500_000_000,
      excessCash: 500_000_000,
      nonOperatingFinancial: 500_000_000,
    });
    expect(r.sumOfNonBusiness).toBe(3_000_000_000);
    // (10e9 − 3e9) / 10e9 = 0.7 → 1e9 × 0.7 = 7e8
    expect(r.adjustedValue).toBe(700_000_000);
  });

  it("FNB-4: sumOfNonBusiness > totalAssets → adjustedValue=0", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 1_000_000_000, {
      nonBusinessLand: 2_000_000_000,
    });
    expect(r.adjustedValue).toBe(0);
    expect(r.ratio).toBe(0);
  });

  it("FNB-5: BigInt 정밀도 — 1조 stockValue × 1조 totalAssets + 사업무관 5천억", () => {
    // stockValue = 1e12, totalAssets = 1e12, nonBusiness = 5e11
    // → ratio = 0.5, adjustedValue = 5e11
    const r = calcCorporateStockAdjustedValue(
      1_000_000_000_000,
      1_000_000_000_000,
      { nonBusinessLand: 500_000_000_000 },
    );
    expect(r.adjustedValue).toBe(500_000_000_000);
  });

  it("FNB-6: totalAssets=0 → ratio=0, adjustedValue=0", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 0, {
      nonBusinessLand: 100_000_000,
    });
    expect(r.adjustedValue).toBe(0);
    expect(r.ratio).toBe(0);
    expect(r.sumOfNonBusiness).toBe(100_000_000);
  });

  it("FNB-7: corporateNonBusinessAssets undefined → stockValue 그대로", () => {
    const r = calcCorporateStockAdjustedValue(2_000_000_000, 5_000_000_000, undefined);
    expect(r.adjustedValue).toBe(2_000_000_000);
    expect(r.sumOfNonBusiness).toBe(0);
  });

  it("FNB-8: suggestFarmingAssetValue corporate_stock 자동 차감 적용", () => {
    const items: EstateItem[] = [
      stockItem({
        farmingCategory: "corporate_stock",
        marketValue: 1_000_000_000,
        corporateTotalAssets: 2_000_000_000,
        corporateNonBusinessAssets: { nonBusinessLand: 1_000_000_000 },
      }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(500_000_000); // 1e9 × 0.5
  });

  it("FNB-9: suggestFamilyBusinessValue corporate_stock 자동 차감 동일 적용", () => {
    const items: EstateItem[] = [
      stockItem({
        familyBusinessCategory: "corporate_stock",
        isFamilyBusinessAsset: true,
        marketValue: 1_000_000_000,
        corporateTotalAssets: 4_000_000_000,
        corporateNonBusinessAssets: { excessCash: 1_000_000_000 },
      }),
    ];
    const r = suggestFamilyBusinessValue(items);
    // ratio = (4e9 − 1e9) / 4e9 = 0.75 → 1e9 × 0.75 = 7.5e8
    expect(r.value).toBe(750_000_000);
  });

  it("FNB-10: 음수 입력값 → Math.max(0, x) clamp", () => {
    const r = calcCorporateStockAdjustedValue(1_000_000_000, 2_000_000_000, {
      nonBusinessLand: -500_000_000, // 음수
      rentedRealEstate: 500_000_000,
    });
    // 음수는 0으로 clamp → sum = 0 + 5e8 = 5e8
    expect(r.sumOfNonBusiness).toBe(500_000_000);
    // (2e9 − 5e8) / 2e9 = 0.75 → 7.5e8
    expect(r.adjustedValue).toBe(750_000_000);
  });

  it("FNB-11: corporateTotalAssets 미입력 → suggest legacy fallback (raw value)", () => {
    const items: EstateItem[] = [
      stockItem({
        farmingCategory: "corporate_stock",
        marketValue: 1_000_000_000,
        // corporateTotalAssets 미입력
        corporateNonBusinessAssets: { nonBusinessLand: 500_000_000 },
      }),
    ];
    const r = suggestFarmingAssetValue(items);
    expect(r.value).toBe(1_000_000_000); // legacy raw
  });
});
