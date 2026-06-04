/**
 * 법인 사업무관자산 차감 — anchor 테스트 (PR-C F-8)
 *
 * 법령: 시행령 §15⑤2호 + §16⑤2호 (KoreanLaw MCP 검증 2026-05-21)
 * 계획서: docs/00-pm/inheritance-farming-remaining-prs.plan.md §6
 *
 * 산식: adjustedValue = floor(stockValue × (totalAssets − sumOfNonBusiness) / totalAssets)
 */

import { describe, expect, it } from "vitest";

import {
  calcCorporateStockAdjustedValue,
  getExcessCashRatioByDate,
} from "@/lib/tax-engine/property-valuation-corporate";
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

// ============================================================
// PR-3-b — 과다현금 자동산정 + 나·다목 제외 단서 (상증령 §15⑤2호 라/나/다목)
// ============================================================

const 억 = 100_000_000;

describe("PR-3-b 과다현금 비율 시기별 (getExcessCashRatioByDate, PDF 375p)", () => {
  it("FNB-RATIO-1: 미입력·현행 → 200%", () => {
    expect(getExcessCashRatioByDate()).toBe(2.0);
    expect(getExcessCashRatioByDate("2025-03-01")).toBe(2.0);
  });
  it("FNB-RATIO-2: 2025.2.28. 경계 — 당일 200%, 전일 150%", () => {
    expect(getExcessCashRatioByDate("2025-02-28")).toBe(2.0);
    expect(getExcessCashRatioByDate("2025-02-27")).toBe(1.5);
  });
  it("FNB-RATIO-3: 2024 상속 → 150%", () => {
    expect(getExcessCashRatioByDate("2024-06-01")).toBe(1.5);
  });
});

describe("PR-3-b 과다현금 자동산정 (calcCorporateStockAdjustedValue)", () => {
  const baseCash = {
    currentCash: 500 * 억,
    cashByYearEnd: [100 * 억, 100 * 억, 100 * 억, 100 * 억, 100 * 억], // 평균 100억
  };

  it("FNB-CASH-1: 현행 200% — 보유 500억 − 평균100억×2.0 = 300억 초과분", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, baseCash, "2025-03-01");
    expect(r.excessCashAuto).toBe(true);
    expect(r.excessCashAvg5y).toBe(100 * 억);
    expect(r.excessCashRatio).toBe(2.0);
    expect(r.excessCash).toBe(300 * 억);
    expect(r.sumOfNonBusiness).toBe(300 * 억);
    // adjusted = 100억 × (1000−300)/1000 = 70억
    expect(r.adjustedValue).toBe(70 * 억);
  });

  it("FNB-CASH-2: 2024 상속 150% — 보유 500억 − 평균100억×1.5 = 350억 초과분", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, baseCash, "2024-06-01");
    expect(r.excessCashRatio).toBe(1.5);
    expect(r.excessCash).toBe(350 * 억);
    expect(r.sumOfNonBusiness).toBe(350 * 억);
  });

  it("FNB-CASH-3: 보유 < 평균×비율 → 과다현금 0 (음수 방지)", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      currentCash: 150 * 억,
      cashByYearEnd: [100 * 억, 100 * 억], // 평균 100억 × 2.0 = 200억 > 150억
    }, "2025-03-01");
    expect(r.excessCash).toBe(0);
    expect(r.excessCashAuto).toBe(true);
  });

  it("FNB-CASH-4: 이중차감 가드 — currentCash+cashByYearEnd 입력 시 excessCash 직접입력 무시", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      ...baseCash,
      excessCash: 999 * 억, // 무시되어야 함
    }, "2025-03-01");
    expect(r.excessCashAuto).toBe(true);
    expect(r.excessCash).toBe(300 * 억); // 자동산정, 직접입력 999억 무시
  });

  it("FNB-CASH-5: currentCash 없으면 excessCash 직접입력 (auto=false)", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      excessCash: 200 * 억,
    }, "2025-03-01");
    expect(r.excessCashAuto).toBe(false);
    expect(r.excessCash).toBe(200 * 억);
    expect(r.sumOfNonBusiness).toBe(200 * 억);
  });
});

describe("PR-3-b 나·다목 제외 단서 (2025.2.28. 신설 시기 가드)", () => {
  it("FNB-EXCL-1: 2025.2.28+ — 임대부동산 100억 − 사택 30억 = 70억, 대여금 50억 − 학자금 20억 = 30억", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      rentedRealEstate: 100 * 억,
      rentedRealEstateExclusion: 30 * 억,
      externalLoans: 50 * 억,
      externalLoansExclusion: 20 * 억,
    }, "2025-03-01");
    expect(r.sumOfNonBusiness).toBe(70 * 억 + 30 * 억); // 100억
  });

  it("FNB-EXCL-2: 2024 상속 — 단서 미적용(신설 전), 임대 100억·대여 50억 전액 사업무관", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      rentedRealEstate: 100 * 억,
      rentedRealEstateExclusion: 30 * 억, // 무시
      externalLoans: 50 * 억,
      externalLoansExclusion: 20 * 억, // 무시
    }, "2024-06-01");
    expect(r.sumOfNonBusiness).toBe(150 * 억); // 100 + 50 전액
  });

  it("FNB-EXCL-3: 제외분이 총액 초과 → 0 (음수 방지)", () => {
    const r = calcCorporateStockAdjustedValue(100 * 억, 1000 * 억, {
      rentedRealEstate: 30 * 억,
      rentedRealEstateExclusion: 50 * 억, // 초과
    }, "2025-03-01");
    expect(r.sumOfNonBusiness).toBe(0);
  });
});
