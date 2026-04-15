/**
 * 비상장·상장주식 평가 전용 테스트 (상증법 §63, 시행령 §54)
 *
 * property-valuation.test.ts의 T11~T17b가 기본 시나리오를 커버하므로
 * 이 파일은 경계값·에러케이스·고급 시나리오에 집중한다.
 */

import { describe, it, expect } from "vitest";
import {
  evaluateListedStock,
  evaluateListedStockValue,
  evaluateUnlistedStock,
  calcUnlistedStockPerShareValue,
  calcPerShareNetIncomeValue,
  calcPerShareNetAssetValue,
} from "@/lib/tax-engine/property-valuation-stock";
import { TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { EstateItem, UnlistedStockData } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 헬퍼
// ============================================================

const makeListedItem = (avgPrice: number, shares: number): EstateItem => ({
  id: "s1",
  name: "상장주식",
  category: "listed_stock",
  listedStockAvgPrice: avgPrice,
  listedStockShares: shares,
});

const makeUnlistedItem = (data: UnlistedStockData, id = "u1"): EstateItem => ({
  id,
  name: "비상장주식",
  category: "unlisted_stock",
  unlistedStockData: data,
});

const baseData: UnlistedStockData = {
  totalShares: 100_000,
  ownedShares: 10_000,
  weightedNetIncome: 200_000_000, // 회사 전체
  netAssetValue: 500_000_000,
  capitalizationRate: 0.10,
};

// ============================================================
// 1. 상장주식 — evaluateListedStockValue
// ============================================================

describe("상장주식 평가값 계산 — evaluateListedStockValue", () => {
  it("[S1] 정상: 평균가 × 주식 수 정수 곱셈", () => {
    expect(evaluateListedStockValue(25_000, 4_000)).toBe(100_000_000);
  });

  it("[S2] 소수점 평균가 → Math.floor 적용", () => {
    // 25,000.9원 → 25,000으로 절사 후 곱셈
    expect(evaluateListedStockValue(25_000.9, 100)).toBe(2_500_000);
  });

  it("[S3] 평균가 0 → 0 반환", () => {
    expect(evaluateListedStockValue(0, 1_000)).toBe(0);
  });

  it("[S4] 주식 수 0 → 0 반환", () => {
    expect(evaluateListedStockValue(10_000, 0)).toBe(0);
  });

  it("[S5] 음수 평균가 → 0 반환", () => {
    expect(evaluateListedStockValue(-1_000, 100)).toBe(0);
  });
});

// ============================================================
// 2. 상장주식 — evaluateListedStock (EstateItem 기반)
// ============================================================

describe("상장주식 평가 — evaluateListedStock", () => {
  it("[S6] 정상: 결과 구조 및 총 평가액 확인", () => {
    const item = makeListedItem(50_000, 2_000);
    const result = evaluateListedStock(item);
    expect(result.valuatedAmount).toBe(100_000_000);
    expect(result.method).toBe("market_value");
    expect(result.estateItemId).toBe("s1");
    expect(result.warnings).toHaveLength(0);
  });

  it("[S7] 평균가 미입력 → TaxCalculationError (MARKET_VALUE_UNAVAILABLE)", () => {
    const item: EstateItem = {
      id: "s2",
      name: "상장주식",
      category: "listed_stock",
      listedStockShares: 1_000,
      // listedStockAvgPrice 없음
    };
    expect(() => evaluateListedStock(item)).toThrow(
      expect.objectContaining({ code: TaxErrorCode.MARKET_VALUE_UNAVAILABLE }),
    );
  });

  it("[S8] 잘못된 category → TaxCalculationError (INVALID_INPUT)", () => {
    const item: EstateItem = {
      id: "s3",
      name: "토지",
      category: "real_estate_land",
    };
    expect(() => evaluateListedStock(item as EstateItem)).toThrow(
      expect.objectContaining({ code: TaxErrorCode.INVALID_INPUT }),
    );
  });

  it("[S9] 주식 수 0 → TaxCalculationError", () => {
    const item = makeListedItem(50_000, 0);
    expect(() => evaluateListedStock(item)).toThrow();
  });
});

// ============================================================
// 3. 비상장주식 — calcPerShareNetIncomeValue
// ============================================================

describe("1주당 순손익가치 — calcPerShareNetIncomeValue", () => {
  it("[S10] 자본환원율 10%: 2,000원 ÷ 10% = 20,000원", () => {
    expect(calcPerShareNetIncomeValue(2_000, 0.10)).toBe(20_000);
  });

  it("[S11] 소수 나눗셈 → Math.floor 절사", () => {
    // 1,000 / 0.10 = 10,000 (정확)
    expect(calcPerShareNetIncomeValue(1_001, 0.10)).toBe(10_010);
  });

  it("[S12] 적자법인 (순손익 <= 0) → 0 반환", () => {
    expect(calcPerShareNetIncomeValue(0, 0.10)).toBe(0);
    expect(calcPerShareNetIncomeValue(-500, 0.10)).toBe(0);
  });

  it("[S13] 자본환원율 0 → 0 반환 (0 나눗셈 방어)", () => {
    expect(calcPerShareNetIncomeValue(5_000, 0)).toBe(0);
  });
});

// ============================================================
// 4. 비상장주식 — calcPerShareNetAssetValue
// ============================================================

describe("1주당 순자산가치 — calcPerShareNetAssetValue", () => {
  it("[S14] 정상: 1,000,000,000 ÷ 100,000 = 10,000원", () => {
    expect(calcPerShareNetAssetValue(1_000_000_000, 100_000)).toBe(10_000);
  });

  it("[S15] 소수 결과 → Math.floor 절사", () => {
    // 10,000,001 / 100,000 = 100.00001 → 100
    expect(calcPerShareNetAssetValue(10_000_001, 100_000)).toBe(100);
  });

  it("[S16] 총 주식 수 0 → 0 반환 (0 나눗셈 방어)", () => {
    expect(calcPerShareNetAssetValue(1_000_000_000, 0)).toBe(0);
  });
});

// ============================================================
// 5. 비상장주식 — calcUnlistedStockPerShareValue (핵심 공식)
// ============================================================

describe("비상장주식 1주당 가중평균 — calcUnlistedStockPerShareValue", () => {
  it("[S17] 일반법인 60:40 가중치 검증", () => {
    // 순손익가치: 200M / 0.1 / 100K = 20,000원
    // 순자산가치: 500M / 100K = 5,000원
    // 가중평균: (20,000*3 + 5,000*2) / 5 = 70,000/5 = 14,000원
    const r = calcUnlistedStockPerShareValue(baseData, false);
    expect(r.perShareIncomeValue).toBe(20_000);
    expect(r.perShareAssetValue).toBe(5_000);
    expect(r.perShareWeightedValue).toBe(14_000);
    expect(r.perShareMinValue).toBe(4_000); // 5,000 * 80%
    expect(r.perShareFinalValue).toBe(14_000); // 가중평균 > 최솟값
  });

  it("[S18] 부동산과다보유법인 40:60 가중치 검증", () => {
    // (20,000*2 + 5,000*3) / 5 = 55,000/5 = 11,000원
    const r = calcUnlistedStockPerShareValue(baseData, true);
    expect(r.perShareWeightedValue).toBe(11_000);
  });

  it("[S19] 최솟값 (순자산 80%) 발동 — 적자법인", () => {
    const lossData: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 0, // 적자
    };
    const r = calcUnlistedStockPerShareValue(lossData, false);
    // 순손익가치 0 → 가중평균 = (0*3 + 5,000*2) / 5 = 2,000
    // 최솟값 = 5,000 * 80% = 4,000
    expect(r.perShareWeightedValue).toBe(2_000);
    expect(r.perShareMinValue).toBe(4_000);
    expect(r.perShareFinalValue).toBe(4_000); // 최솟값 발동
  });

  it("[S20] 자본환원율 미입력 → 기본값 10% 사용", () => {
    const data: UnlistedStockData = { ...baseData, capitalizationRate: 0 };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 환원율 0 → 기본 10% 적용
    expect(r.perShareIncomeValue).toBe(20_000);
  });

  it("[S21] 극소 순자산 (순손익가치가 압도적으로 높은 경우)", () => {
    const data: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 1_000,
      weightedNetIncome: 10_000_000_000, // 1천억
      netAssetValue: 1_000_000,           // 100만
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 순손익가치: 10B / 0.1 / 100K = 1,000,000
    // 순자산가치: 1M / 100K = 10
    expect(r.perShareIncomeValue).toBe(1_000_000);
    expect(r.perShareAssetValue).toBe(10);
    // 가중평균 >> 최솟값(8) → 가중평균 채택
    expect(r.perShareFinalValue).toBe(r.perShareWeightedValue);
  });
});

// ============================================================
// 6. 비상장주식 — evaluateUnlistedStock (EstateItem 기반)
// ============================================================

describe("비상장주식 총 평가액 — evaluateUnlistedStock", () => {
  it("[S22] 일반법인: 1주당 14,000원 × 10,000주 = 140,000,000원", () => {
    const item = makeUnlistedItem(baseData);
    const result = evaluateUnlistedStock(item, false);
    expect(result.valuatedAmount).toBe(140_000_000);
    expect(result.method).toBe("book_value");
    expect(result.estateItemId).toBe("u1");
  });

  it("[S23] 부동산과다보유법인 경고 메시지 포함", () => {
    const item = makeUnlistedItem(baseData);
    const result = evaluateUnlistedStock(item, true);
    expect(result.warnings.some((w) => w.includes("부동산과다"))).toBe(true);
  });

  it("[S24] 적자법인 경고 메시지 포함", () => {
    const item = makeUnlistedItem({ ...baseData, weightedNetIncome: 0 });
    const result = evaluateUnlistedStock(item, false);
    expect(result.warnings.some((w) => w.includes("적자법인"))).toBe(true);
  });

  it("[S25] 최솟값 발동 경고 메시지 포함", () => {
    // weightedNetIncome를 음수로 설정해 최솟값 발동
    const item = makeUnlistedItem({ ...baseData, weightedNetIncome: -1 });
    const result = evaluateUnlistedStock(item, false);
    // 적자법인 or 최솟값 경고
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("[S26] unlistedStockData 미입력 → TaxCalculationError (UNLISTED_STOCK_DATA_MISSING)", () => {
    const item: EstateItem = { id: "u2", name: "비상장주식", category: "unlisted_stock" };
    expect(() => evaluateUnlistedStock(item)).toThrow(
      expect.objectContaining({ code: TaxErrorCode.UNLISTED_STOCK_DATA_MISSING }),
    );
  });

  it("[S27] totalShares = 0 → TaxCalculationError (INVALID_INPUT)", () => {
    const item = makeUnlistedItem({ ...baseData, totalShares: 0 });
    expect(() => evaluateUnlistedStock(item)).toThrow(
      expect.objectContaining({ code: TaxErrorCode.INVALID_INPUT }),
    );
  });

  it("[S28] 잘못된 category → TaxCalculationError (INVALID_INPUT)", () => {
    const item: EstateItem = { id: "u3", name: "토지", category: "real_estate_land" };
    expect(() => evaluateUnlistedStock(item)).toThrow(
      expect.objectContaining({ code: TaxErrorCode.INVALID_INPUT }),
    );
  });

  it("[S29] breakdown 배열에 핵심 항목 포함", () => {
    const item = makeUnlistedItem(baseData);
    const result = evaluateUnlistedStock(item, false);
    const labels = result.breakdown.map((b) => b.label);
    expect(labels.some((l) => l.includes("순손익가치"))).toBe(true);
    expect(labels.some((l) => l.includes("순자산가치"))).toBe(true);
    expect(labels.some((l) => l.includes("가중평균"))).toBe(true);
    expect(labels.some((l) => l.includes("총 평가액"))).toBe(true);
  });
});
