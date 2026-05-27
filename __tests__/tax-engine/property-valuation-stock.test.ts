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
  calcCompanyWeightedNetIncome3Y,
  resolveWeightedNetIncome,
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
    expect(r.perShareFinalValue).toBe(14_000); // 가중평균 > 최소값
  });

  it("[S18] 부동산과다보유법인 40:60 가중치 검증", () => {
    // (20,000*2 + 5,000*3) / 5 = 55,000/5 = 11,000원
    const r = calcUnlistedStockPerShareValue(baseData, true);
    expect(r.perShareWeightedValue).toBe(11_000);
  });

  it("[S19] 최소값 (순자산 80%) 발동 — 적자법인", () => {
    const lossData: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 0, // 적자
    };
    const r = calcUnlistedStockPerShareValue(lossData, false);
    // 순손익가치 0 → 가중평균 = (0*3 + 5,000*2) / 5 = 2,000
    // 최소값 = 5,000 * 80% = 4,000
    expect(r.perShareWeightedValue).toBe(2_000);
    expect(r.perShareMinValue).toBe(4_000);
    expect(r.perShareFinalValue).toBe(4_000); // 최소값 발동
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
    // 가중평균 >> 최소값(8) → 가중평균 채택
    expect(r.perShareFinalValue).toBe(r.perShareWeightedValue);
  });

  // ============================================================
  // §54④ 순자산가치만 적용 분기 (PR5-4)
  // ============================================================

  it("[S22] §54④ 1호 청산 — 무조건 1주당 순자산가치 적용", () => {
    const data: UnlistedStockData = {
      ...baseData,
      assetValueOnlyReason: "liquidation",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 가중평균 14,000 > 순자산 5,000이지만 청산법인 → 순자산가치 적용
    expect(r.perShareWeightedValue).toBe(14_000);
    expect(r.perShareAssetValue).toBe(5_000);
    expect(r.perShareFinalValue).toBe(5_000); // 순자산가치 직접 적용
  });

  it("[S23] §54④ 2호 사업개시 3년 미만 — 무조건 순자산가치", () => {
    const data: UnlistedStockData = {
      ...baseData,
      assetValueOnlyReason: "lt3y",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareFinalValue).toBe(5_000); // 순자산가치 직접
  });

  it("[S24] §54④ 3호 부동산 80% — 단서 적용 (가중평균 < 순자산가치인 경우만)", () => {
    // 가중평균 14,000 > 순자산 5,000 → 단서 미발동 → 가중평균 적용
    const data1: UnlistedStockData = {
      ...baseData,
      assetValueOnlyReason: "real_estate_80",
    };
    const r1 = calcUnlistedStockPerShareValue(data1, false);
    expect(r1.perShareFinalValue).toBe(r1.perShareWeightedValue); // 14,000

    // 가중평균 2,000 < 순자산 5,000 → 단서 발동 → 순자산가치 적용
    const data2: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 0, // 적자
      assetValueOnlyReason: "real_estate_80",
    };
    const r2 = calcUnlistedStockPerShareValue(data2, false);
    // 적자라 perShareIncomeValue = 0, 가중평균 = (0×3 + 5,000×2)/5 = 2,000
    expect(r2.perShareWeightedValue).toBe(2_000);
    expect(r2.perShareAssetValue).toBe(5_000);
    expect(r2.perShareFinalValue).toBe(5_000); // 단서 발동 — 순자산
  });

  it("[S25] §54④ 5호 주식 80% — 단서 적용 (3호와 동일 로직)", () => {
    const data: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 0,
      assetValueOnlyReason: "stock_80",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareFinalValue).toBe(5_000);
  });

  it("[S26] §54④ 6호 잔여 존속 3년 이내 — 무조건 순자산가치", () => {
    const data: UnlistedStockData = {
      ...baseData,
      assetValueOnlyReason: "remaining_3y",
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareFinalValue).toBe(5_000);
  });

  // ============================================================
  // 정밀도·가드 (PR5-2)
  // ============================================================

  it("[S27] §55① 후단 — 순자산가액 음수 → 0 처리", () => {
    const data: UnlistedStockData = {
      ...baseData,
      netAssetValue: -1_000_000, // 음수 (자본잠식)
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareAssetValue).toBe(0); // 음수 → 0
  });

  it("[E1-2] 이중 floor → 단일 floor 정밀도 — 1,234,567/1,000주/10% = 12,345", () => {
    const data: UnlistedStockData = {
      totalShares: 1_000,
      ownedShares: 100,
      weightedNetIncome: 1_234_567,
      netAssetValue: 100_000_000,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 정정 전: floor(floor(1,234,567/1,000)/0.1) = floor(1234/0.1) = 12,340
    // 정정 후: floor(1,234,567/(1,000×0.1)) = floor(1,234,567/100) = 12,345
    expect(r.perShareIncomeValue).toBe(12_345);
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

  it("[S25] 최소값 발동 경고 메시지 포함", () => {
    // weightedNetIncome를 음수로 설정해 최소값 발동
    const item = makeUnlistedItem({ ...baseData, weightedNetIncome: -1 });
    const result = evaluateUnlistedStock(item, false);
    // 적자법인 or 최소값 경고
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

// ============================================================
// 7. §56① 3년치 순손익 가중평균 — calcCompanyWeightedNetIncome3Y (PR-1)
// ============================================================

describe("3년치 순손익 가중평균 — calcCompanyWeightedNetIncome3Y + resolveWeightedNetIncome", () => {
  // C-1: 3년치 흑자 — 가중평균 산식 정확성
  it("[C-1] 3년치 모두 흑자 — (Y1×3 + Y2×2 + Y3×1) ÷ 6 정확 계산 (floor 없음)", () => {
    // Y1=300M, Y2=240M, Y3=180M
    // 가중합: 300M×3 + 240M×2 + 180M×1 = 900M + 480M + 180M = 1,560M
    // ÷ 6 = 260,000,000
    expect(calcCompanyWeightedNetIncome3Y(300_000_000, 240_000_000, 180_000_000)).toBe(260_000_000);
  });

  it("[C-1b] 3년치 소수점 결과 — floor 없이 소수점 유지 (단일 floor 위임)", () => {
    // Y1=100M, Y2=100M, Y3=100M → (300M + 200M + 100M) / 6 = 600M/6 = 100M
    expect(calcCompanyWeightedNetIncome3Y(100_000_000, 100_000_000, 100_000_000)).toBe(100_000_000);
    // Y1=200M, Y2=100M, Y3=50M → (600M + 200M + 50M) / 6 = 850M/6 = 141,666,666.666...
    expect(calcCompanyWeightedNetIncome3Y(200_000_000, 100_000_000, 50_000_000)).toBeCloseTo(141_666_666.67, 0);
  });

  // C-2: 일부 연도 음수 — 산식에 음수 반영 (합산 결과는 양수)
  it("[C-2] 일부 연도 적자(음수) — 가중평균에 음수 반영, 결과 양수이면 정상", () => {
    // Y1=600M, Y2=-60M, Y3=-60M
    // 가중합: 1,800M + (-120M) + (-60M) = 1,620M → ÷6 = 270,000,000
    expect(calcCompanyWeightedNetIncome3Y(600_000_000, -60_000_000, -60_000_000)).toBe(270_000_000);
  });

  // C-3: 가중평균 음수 → §56① 단서 0 처리
  it("[C-3] 가중평균 결과 음수 → §56① 단서 0 처리", () => {
    // Y1=-300M, Y2=-200M, Y3=-100M → (-900M-400M-100M)/6 = -1,400M/6 < 0 → 0
    expect(calcCompanyWeightedNetIncome3Y(-300_000_000, -200_000_000, -100_000_000)).toBe(0);
    // 경계: 딱 0이면 0 유지
    expect(calcCompanyWeightedNetIncome3Y(0, 0, 0)).toBe(0);
  });

  // C-4: legacy weightedNetIncome만 → 기존 동일 결과 (회귀 보호)
  it("[C-4] legacy fallback — 3년치 없을 때 weightedNetIncome 직접 사용", () => {
    const legacyData: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 200_000_000,
      netAssetValue: 500_000_000,
      capitalizationRate: 0.10,
    };
    expect(resolveWeightedNetIncome(legacyData)).toBe(200_000_000);
    // calcUnlistedStockPerShareValue 결과도 기존과 동일해야 함 (S17 회귀)
    const r = calcUnlistedStockPerShareValue(legacyData, false);
    expect(r.perShareIncomeValue).toBe(20_000); // 200M / (100K × 0.1) = 20,000
    expect(r.perShareWeightedValue).toBe(14_000);
    expect(r.perShareFinalValue).toBe(14_000);
  });

  it("[C-4b] legacy fallback — weightedNetIncome=0 (적자) 도 그대로", () => {
    const legacyLossData: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 0,
    };
    expect(resolveWeightedNetIncome(legacyLossData)).toBe(0);
    const r = calcUnlistedStockPerShareValue(legacyLossData, false);
    expect(r.perShareIncomeValue).toBe(0);
    expect(r.perShareFinalValue).toBe(4_000); // 최소값 발동
  });

  // C-5: 3년치 + 부동산과다보유 (가중치 반전) 결합
  it("[C-5] 3년치 + isRealEstateHeavy=true 결합", () => {
    // Y1=300M, Y2=240M, Y3=180M → resolveWeightedNetIncome = 260M
    // 1주당 순손익가치: 260M / (100K × 0.1) = 26,000
    // 순자산: 500M / 100K = 5,000
    // 부동산과다 가중치 2:3 → (26,000×2 + 5,000×3) / 5 = (52,000+15,000)/5 = 13,400
    const data3y: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 0,
      netIncomeY1: 300_000_000,
      netIncomeY2: 240_000_000,
      netIncomeY3: 180_000_000,
      netAssetValue: 500_000_000,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data3y, true);
    expect(r.perShareIncomeValue).toBe(26_000); // 260M / (100K × 0.1)
    expect(r.perShareAssetValue).toBe(5_000);
    expect(r.perShareWeightedValue).toBe(13_400); // (26,000×2 + 5,000×3) / 5
    expect(r.perShareFinalValue).toBe(13_400);
  });

  // C-6: 3년치 + §54④ assetValueOnlyReason → 순손익 무시
  it("[C-6] 3년치 + §54④ lt3y → 순자산가치만 적용", () => {
    const data3y: UnlistedStockData = {
      totalShares: 100_000,
      ownedShares: 10_000,
      weightedNetIncome: 0,
      netIncomeY1: 300_000_000,
      netIncomeY2: 240_000_000,
      netIncomeY3: 180_000_000,
      netAssetValue: 500_000_000,
      capitalizationRate: 0.10,
      assetValueOnlyReason: "lt3y",
    };
    const r = calcUnlistedStockPerShareValue(data3y, false);
    // §54④ 2호: 사업개시 3년 미만 → 무조건 순자산가치
    expect(r.perShareFinalValue).toBe(5_000);
    // 내부 순손익가치는 3년치로 계산되어야 함 (26,000)
    expect(r.perShareIncomeValue).toBe(26_000);
  });

  // resolveWeightedNetIncome — 3년치 우선
  it("[C-1c] resolveWeightedNetIncome — 3년치 있으면 우선 사용", () => {
    const data: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 999_999_999, // legacy 쓰레기값 (무시돼야 함)
      netIncomeY1: 300_000_000,
      netIncomeY2: 240_000_000,
      netIncomeY3: 180_000_000,
    };
    // 3년치 가중평균 = 260M (legacy 999M 아님)
    expect(resolveWeightedNetIncome(data)).toBe(260_000_000);
  });

  it("[C-1d] resolveWeightedNetIncome — Y1만 있어도 3년치 모드 (Y2·Y3=0)", () => {
    const data: UnlistedStockData = {
      ...baseData,
      weightedNetIncome: 999_999_999,
      netIncomeY1: 120_000_000,
      // netIncomeY2·Y3 미입력 (undefined)
    };
    // has3y = true (Y1 != null) → calcCompanyWeightedNetIncome3Y(120M, 0, 0)
    // = (120M×3 + 0×2 + 0×1) / 6 = 360M/6 = 60M
    expect(resolveWeightedNetIncome(data)).toBe(60_000_000);
  });

  // ============================================================
  // A-1 (Pre-Do anchor) — §56① 연도별 1주당 절사 순서 정정
  // 계획서: docs/00-pm/unlisted-v1-simple-net-income-per-share-fix.plan.md
  // KoreanLaw 검증 mst=283637 (2026-05-27)
  // ============================================================

  it("[A-1] §56① 3단계 절사 — 연도별 1주당 floor 후 가중평균 (법령 정합)", () => {
    // 입력: 3년 순손익 각 100,000,003원, 총 주식 7주, 환원율 10%
    //
    // 법령 §56① 3단계:
    //   사. floor(100,000,003 / 7) = 14,285,714  (각 연도)
    //   아. floor((14,285,714×3 + 14,285,714×2 + 14,285,714×1) / 6)
    //      = floor(85,714,284 / 6) = floor(14,285,714) = 14,285,714
    //   차. floor(14,285,714 / 0.10) = 142,857,140
    //
    // 현행 V1 (수정 전): floor(100,000,003 / (7 × 0.10)) = 142,857,147 → 법령과 7원 차이
    const data: UnlistedStockData = {
      totalShares: 7,
      ownedShares: 7,
      weightedNetIncome: 0, // legacy fallback 미사용 (has3y=true)
      netIncomeY1: 100_000_003,
      netIncomeY2: 100_000_003,
      netIncomeY3: 100_000_003,
      netAssetValue: 0,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    // 법령 §56① 정합값: 142,857,140
    expect(r.perShareIncomeValue).toBe(142_857_140);
  });

  it("[A-2] V1 결과 = V2 동일 입력 정합 (자본변동·연환산 없는 케이스)", () => {
    // V2 (weighted-avg.ts) 경로: per-share floor → calcWeightedAvg3y → calcPerShareNetIncomeValue
    // V1 수정 후도 동일 3단계 → 결과 일치해야 함
    const y1 = 100_000_003, y2 = 100_000_003, y3 = 100_000_003;
    const totalShares = 7;
    const capRate = 0.10;

    // V2 수동 재현
    const ps1 = Math.floor(y1 / totalShares); // 14,285,714
    const ps2 = Math.floor(y2 / totalShares);
    const ps3 = Math.floor(y3 / totalShares);
    const wAvgRaw = (ps1 * 3 + ps2 * 2 + ps3 * 1) / 6;
    const wAvg = wAvgRaw <= 0 ? 0 : Math.floor(wAvgRaw); // 14,285,714
    const v2Expected = wAvg <= 0 ? 0 : Math.floor(wAvg / capRate); // 142,857,140

    const data: UnlistedStockData = {
      totalShares,
      ownedShares: totalShares,
      weightedNetIncome: 0, // legacy fallback 미사용 (has3y=true)
      netIncomeY1: y1,
      netIncomeY2: y2,
      netIncomeY3: y3,
      netAssetValue: 0,
      capitalizationRate: capRate,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareIncomeValue).toBe(v2Expected);
  });

  it("[A-3] 음수 결손 연도 — per-year floor 음수 허용, 가중평균 음수 → 0", () => {
    // Y1=300M (흑자), Y2=-600M (결손), Y3=-300M (결손)
    // per-year: 300M/7=42,857,142 / -600M/7=Math.floor(-85,714,285)=-85,714,286 / -300M/7=-42,857,143
    // 가중합: (42,857,142×3) + (-85,714,286×2) + (-42,857,143×1)
    //       = 128,571,426 - 171,428,572 - 42,857,143 = -85,714,289
    // 6으로 나누면 음수 → §56① 단서 0 → perShareIncomeValue = 0
    const data: UnlistedStockData = {
      totalShares: 7,
      ownedShares: 7,
      weightedNetIncome: 0, // legacy fallback 미사용 (has3y=true)
      netIncomeY1: 300_000_000,
      netIncomeY2: -600_000_000,
      netIncomeY3: -300_000_000,
      netAssetValue: 0,
      capitalizationRate: 0.10,
    };
    const r = calcUnlistedStockPerShareValue(data, false);
    expect(r.perShareIncomeValue).toBe(0); // 가중평균 음수 → 0
  });
});
