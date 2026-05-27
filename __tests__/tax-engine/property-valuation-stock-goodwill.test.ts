/**
 * 비상장주식 간편평가(V1) 영업권(§59②) 가산 — anchor
 *
 * 계획: docs/00-pm/inheritance-unlisted-stock-simple-goodwill.plan.md
 * 설계: docs/02-design/features/inheritance-unlisted-stock-simple-goodwill.engine.design.md
 *
 * 영업권 = {3년 가중평균 순손익 × 50% − 자기자본 × 10%} × 5년 연금현가(Σ 1/1.1^n)
 *   → 순자산가액에 가산 (상증법 §55③ + §59②, 상증규 §19① 10%)
 *
 * V1-GW-1 = 사용자 첨부 이미지25 (= goodwill.ts PDF 사례 5)
 */

import { describe, it, expect } from "vitest";
import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import type { UnlistedStockData } from "@/lib/tax-engine/types/inheritance-gift.types";

describe("비상장 간편평가(V1) 영업권 가산 — §55③·§59②", () => {
  it("[V1-GW-1] PDF 사례5(이미지25) 영업권 가산 — 1주당 순자산 4,587원", () => {
    // 발행 20,000주, 순자산 100,000,000−40,000,000=60,000,000
    // 가중평균 (23,500,000×3+40,000,000×2+22,000,000×1)/6 = 28,750,000
    // 나 14,375,000 / 마 6,000,000 / 초과이익 8,375,000
    // 자(엔진 정확 Σ) 31,747,839 (PDF 표 3.7908 → 31,747,950, 111원 차이)
    // 순자산+영업권 91,747,839 ÷ 20,000 = 4,587.39 → floor 4,587 (PDF 일치)
    const data: UnlistedStockData = {
      totalShares: 20_000,
      ownedShares: 10_000,
      netIncomeY1: 23_500_000,
      netIncomeY2: 40_000_000,
      netIncomeY3: 22_000_000,
      netAssetValue: 60_000_000,
      capitalizationRate: 0.10,
      weightedNetIncome: 0,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(31_747_839);
    expect(r.netAssetWithGoodwill).toBe(91_747_839);
    expect(r.perShareAssetValue).toBe(4_587);
  });

  const gw1Income = { netIncomeY1: 23_500_000, netIncomeY2: 40_000_000, netIncomeY3: 22_000_000 };

  it("[V1-GW-2] 초과이익 음수(사례6) → 영업권 0 / 순자산 불변", () => {
    // 가중평균 58,341,511 → 나 29,170,755 / 마(489,351,700×10%) 48,935,170 → 초과이익 0
    const data: UnlistedStockData = {
      totalShares: 50_000, ownedShares: 25_000,
      netIncomeY1: 58_341_511, netIncomeY2: 58_341_511, netIncomeY3: 58_341_511,
      netAssetValue: 489_351_700, capitalizationRate: 0.10, weightedNetIncome: 0,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(0);
    expect(r.goodwill.excludedByLaw).toBeUndefined();
    expect(r.netAssetWithGoodwill).toBe(489_351_700);
    expect(r.perShareAssetValue).toBe(9_787);
  });

  it("[V1-GW-3] §55③1호 liquidation → 영업권 배제", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000, ...gw1Income,
      netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
      assetValueOnlyReason: "liquidation",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(0);
    expect(r.goodwill.excludedByLaw).toBe("liquidation");
    expect(r.perShareAssetValue).toBe(3_000);
  });

  it("[V1-GW-4] §55③2호 lt3y → 영업권 배제", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000, ...gw1Income,
      netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
      assetValueOnlyReason: "lt3y",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(0);
    expect(r.goodwill.excludedByLaw).toBe("lt3y");
    expect(r.perShareAssetValue).toBe(3_000);
  });

  it("[V1-GW-5] §55③1호 real_estate_80 → 영업권 배제", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000, ...gw1Income,
      netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
      assetValueOnlyReason: "real_estate_80",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(0);
    expect(r.goodwill.excludedByLaw).toBe("real_estate_80");
    expect(r.perShareAssetValue).toBe(3_000);
  });

  it("[V1-GW-6] §55③3호 3년 계속결손 도출 → 영업권 0 + 라벨", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000,
      netIncomeY1: -1_000_000, netIncomeY2: -500_000, netIncomeY3: -200_000,
      netAssetValue: 100_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(0);
    expect(r.goodwill.excludedByLaw).toBe("continuous_loss_3y");
    expect(r.perShareAssetValue).toBe(5_000);
  });

  it("[V1-GW-7] stock_80(5호) → §55③ 배제 없음, 영업권 가산", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000, ...gw1Income,
      netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
      assetValueOnlyReason: "stock_80",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(31_747_839);
    expect(r.goodwill.excludedByLaw).toBeUndefined();
    expect(r.perShareAssetValue).toBe(4_587);
  });

  it("[V1-GW-8] remaining_3y(6호) → §55③ 배제 없음, 영업권 가산", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000, ...gw1Income,
      netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
      assetValueOnlyReason: "remaining_3y",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(31_747_839);
    expect(r.goodwill.excludedByLaw).toBeUndefined();
    expect(r.perShareAssetValue).toBe(4_587);
  });

  it("[V1-GW-9] legacy fallback (weightedNetIncome 단일값) → GW-1과 동일", () => {
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000,
      netAssetValue: 60_000_000, capitalizationRate: 0.10,
      weightedNetIncome: 28_750_000, // 3년치 미입력 → legacy 경로
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(31_747_839);
    expect(r.perShareAssetValue).toBe(4_587);
  });

  it("[V1-GW-10] 자본잠식 (순자산 음수 → 자기자본 0) → 영업권만 순자산", () => {
    // selfCapital=0 → 마=0 → 초과이익=나=5,000,000 → 자=18,953,933
    const data: UnlistedStockData = {
      totalShares: 20_000, ownedShares: 10_000,
      netIncomeY1: 10_000_000, netIncomeY2: 10_000_000, netIncomeY3: 10_000_000,
      netAssetValue: -5_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.goodwill.goodwillFinal).toBe(18_953_933);
    expect(r.netAssetWithGoodwill).toBe(18_953_933);
    expect(r.perShareAssetValue).toBe(947);
  });
});
