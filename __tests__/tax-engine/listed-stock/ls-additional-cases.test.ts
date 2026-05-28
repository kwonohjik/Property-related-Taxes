/**
 * Phase G 추가 anchor — LS-03·LS-04·LS-06·LS-07·LS-08.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-replica.plan.md §2
 */

import { describe, it, expect } from "vitest";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const BASE: EstateItem = {
  id: "ls-base",
  category: "listed_stock",
  name: "테스트 상장사",
  listedStockAvgPrice: 10000,
  listedStockShares: 100,
  stockClass: "common",
};

describe("LS-03 §63②3호 증자 신주 미상장 — 평가구간 단축 트리거", () => {
  it("capitalIncreaseDate 입력 + isCapitalIncreaseUnlistedShare=true → ⑪~⑰ 활성", () => {
    const result = evaluateListedStock(
      {
        ...BASE,
        isCapitalIncreaseUnlistedShare: true,
        capitalIncreaseDate: "2022-06-20",
        faceValuePerShare: 5000,
        priorDividendRate: 0.05,
        dividendBaseDate: "2022-01-02",
        listedStockDividendDifference: 100,
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1.capitalIncreaseDate).toBe("2022-06-20");
    expect(result.besshiData?.page1.isUnlistedShareSection).toBe(true);
    expect(result.besshiData?.page1Values.perShareValue).toBe(10000 - 100);
    expect(result.besshiData?.page1Values.perShareMajorShareholderUnlisted).toBe(9900);
  });
});

describe("LS-04 §63②3호 합병 신주 미상장", () => {
  it("mergerDate 입력 + isCapitalIncreaseUnlistedShare=true → ⑧·⑪~⑰ 활성", () => {
    const result = evaluateListedStock(
      {
        ...BASE,
        isCapitalIncreaseUnlistedShare: true,
        mergerDate: "2022-06-25",
        faceValuePerShare: 5000,
        priorDividendRate: 0.03,
        dividendBaseDate: "2022-01-02",
        listedStockDividendDifference: 50,
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1.mergerDate).toBe("2022-06-25");
    expect(result.besshiData?.page1.isUnlistedShareSection).toBe(true);
    expect(result.besshiData?.page1Values.perShareValue).toBe(10000 - 50);
  });
});

describe("LS-06 휴장일 다수 — listedStockDailyGroupsInput echo", () => {
  it("dailyGroupsInput 없을 때 EMPTY_LISTED_STOCK_MONTH_GROUPS echo", () => {
    const result = evaluateListedStock(BASE, { valuationDate: "2022-07-06" });
    expect(result.besshiData?.page2.beforeM1).toEqual([]);
    expect(result.besshiData?.page2.tradingDays).toBe(0);
    expect(result.besshiData?.page2.closingAverage).toBe(0);
  });

  it("dailyGroupsInput 있으면 그대로 pass-through", () => {
    const result = evaluateListedStock(
      {
        ...BASE,
        listedStockDailyGroupsInput: {
          beforeM1: [],
          beforeM2: [],
          afterM1: [],
          afterM2: [],
          beforeSubtotal: 1000,
          afterSubtotal: 2000,
          tradingDays: 3,
          closingSum: 3000,
          closingAverage: 1000,
        },
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page2.closingSum).toBe(3000);
    expect(result.besshiData?.page2.closingAverage).toBe(1000);
  });
});

describe("LS-07 valuationDate 미전달 — page1.valuationDate=\"\"", () => {
  it("context 없으면 valuationDate=\"\" echo (UI에서 warning 표시 가능)", () => {
    const result = evaluateListedStock(BASE);
    expect(result.besshiData?.page1.valuationDate).toBe("");
  });
});

describe("LS-08 우선주", () => {
  it("stockClass=preferred → page1.stockClass=preferred", () => {
    const result = evaluateListedStock(
      { ...BASE, stockClass: "preferred" },
      { valuationDate: "2022-07-06" },
    );
    expect(result.besshiData?.page1.stockClass).toBe("preferred");
  });

  it("stockClass 미입력 → 기본값 'common'", () => {
    const { stockClass: _ignored, ...rest } = BASE;
    const result = evaluateListedStock(rest, { valuationDate: "2022-07-06" });
    expect(result.besshiData?.page1.stockClass).toBe("common");
  });
});

describe("LS — 평가액 산식 정합 (§63③ 적용)", () => {
  it("일반 분기 + max + large → valuatedAmount = floor(avg×1.2) × shares", () => {
    const result = evaluateListedStock(
      {
        ...BASE,
        listedStockAvgPrice: 10000,
        listedStockShares: 100,
        isMaxShareholder: true,
        companySize: "large",
        premiumExclusionReason: "none",
      },
      { valuationDate: "2022-07-06" },
    );
    expect(result.valuatedAmount).toBe(12000 * 100);
  });

  it("§63②3호 분기 + max + large → valuatedAmount = floor(⑯×1.2) × shares", () => {
    const result = evaluateListedStock(
      {
        ...BASE,
        listedStockAvgPrice: 10000,
        listedStockShares: 100,
        isMaxShareholder: true,
        companySize: "large",
        premiumExclusionReason: "none",
        isCapitalIncreaseUnlistedShare: true,
        capitalIncreaseDate: "2022-06-20",
        listedStockDividendDifference: 200,
      },
      { valuationDate: "2022-07-06" },
    );
    // ⑯ = 10000 - 200 = 9800, ⑰ = floor(9800 × 1.2) = 11760
    expect(result.besshiData?.page1Values.perShareValue).toBe(9800);
    expect(result.besshiData?.page1Values.perShareMajorShareholderUnlisted).toBe(11760);
    expect(result.valuatedAmount).toBe(11760 * 100);
  });
});
