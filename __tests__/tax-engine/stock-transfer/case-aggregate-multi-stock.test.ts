/**
 * 다자산 합산신고 anchor 테스트
 *
 * §103② 기본공제 그룹별 1회 한정:
 *   - 그룹2 (주식 §94①3 가·나목): 250만원 연간 1회
 *   - 그룹1 (기타자산 §94①4): 250만원 연간 1회
 *
 * 케이스:
 *   MA-01: 주식 2종목 합산 — 기본공제 1회만 (첫 종목 적용)
 *   MA-02: 주식 1종목 + 기타자산 1종목 — 그룹별 각 1회
 *   MA-03: each_item 모드 — 기본공제 중복 (단건과 동일)
 */

import { describe, it, expect } from "vitest";
import {
  calculateStockTransferTaxAggregate,
} from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 공용 팩토리
// ============================================================

function stockInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: true,
    selfShareRatio: 0.03,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    priorYearEndDate: new Date("2023-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    isVentureCompany: false,
    isKOTCTrading: false,

    acquisitionDate: new Date("2022-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 100,
    totalIssuedShares: 1_000_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,    // 양도가 5,000,000

    acquisitionMode: "actual",
    perShareAcquisitionPrice: 40_000, // 취득가 4,000,000 → 소득 1,000,000

    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    expenseMode: "actual",
    actualExpenses: 0,

    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,

    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

// 기타자산 입력 팩토리
function otherAssetInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    ...stockInput(),
    marketType: "other_asset",
    isQualifyingBlockShareholder: true,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    perShareTransferPrice: 100_000,   // 양도가 10,000,000
    perShareAcquisitionPrice: 80_000, // 취득가 8,000,000 → 소득 2,000,000

    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

// ============================================================
// MA-01: 주식 2종목 — 기본공제 aggregate 1회
// ============================================================

describe("MA-01: 주식 2종목 합산 (aggregate 모드 — §103②2호 기본공제 1회)", () => {
  /*
   * 종목A: 양도가 5,000,000 / 취득가 4,000,000 → 소득 1,000,000
   * 종목B: 양도가 5,000,000 / 취득가 4,000,000 → 소득 1,000,000
   * 합계 소득: 2,000,000
   * §103②2호 기본공제 250만원 > 합계 소득 → 기본공제 = min(2,000,000, 2,500,000) = 2,000,000
   * 과세표준 = 0 → 납세의무 없음
   */

  const stockA = stockInput();
  const stockB = stockInput();
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "aggregate");

  it("MA-01-01: items 배열 길이 = 2", () => {
    expect(result.items.length).toBe(2);
  });

  it("MA-01-02: totalTransferIncome = 2,000,000", () => {
    expect(result.totalTransferIncome).toBe(2_000_000);
  });

  it("MA-01-03: 주식 그룹 기본공제 = 2,000,000 (소득금액 한도)", () => {
    expect(result.basicDeductionByGroup.stock).toBe(2_000_000);
  });

  it("MA-01-04: 기타자산 그룹 기본공제 = 0 (종목 없음)", () => {
    expect(result.basicDeductionByGroup.real_estate_and_other_asset).toBe(0);
  });

  it("MA-01-05: totalTaxBase = 0 (기본공제 후 과세표준 0)", () => {
    expect(result.totalTaxBase).toBe(0);
  });

  it("MA-01-06: totalCalculatedTax = 0", () => {
    expect(result.totalCalculatedTax).toBe(0);
  });

  it("MA-01-07: totalFinalTax = 0", () => {
    expect(result.totalFinalTax).toBe(0);
  });
});

// ============================================================
// MA-02: 주식 + 기타자산 — 그룹별 기본공제 각 1회
// ============================================================

describe("MA-02: 주식 1종목 + 기타자산 1종목 (그룹별 기본공제 각 1회)", () => {
  /*
   * 주식(A): 소득 1,000,000 → §103②2호 기본공제 min(1,000,000, 2,500,000)=1,000,000 → 과표 0
   * 기타자산(B): 소득 2,000,000 → §103②1호 기본공제 min(2,000,000, 2,500,000)=2,000,000 → 과표 0
   * 양 그룹 모두 과세표준 0 → 납부세액 0
   */

  const stockA = stockInput();
  const otherB = otherAssetInput();
  const result = calculateStockTransferTaxAggregate([stockA, otherB], "aggregate");

  it("MA-02-01: items 길이 = 2", () => {
    expect(result.items.length).toBe(2);
  });

  it("MA-02-02: 주식 그룹 기본공제 = 1,000,000 (소득 한도)", () => {
    expect(result.basicDeductionByGroup.stock).toBe(1_000_000);
  });

  it("MA-02-03: 기타자산 그룹 기본공제 = 2,000,000 (소득 한도)", () => {
    expect(result.basicDeductionByGroup.real_estate_and_other_asset).toBe(2_000_000);
  });

  it("MA-02-04: totalCalculatedTax = 0 (양 그룹 과세표준 0)", () => {
    expect(result.totalCalculatedTax).toBe(0);
  });
});

// ============================================================
// MA-03: each_item 모드 — 종목별 개별 기본공제
// ============================================================

describe("MA-03: each_item 모드 — 기본공제 종목별 개별 적용", () => {
  /*
   * each_item 모드: 단건 계산 그대로 합산
   * 종목A: 소득 1,000,000 → 기본공제 1,000,000 → 과표 0 → 세액 0
   * 종목B: 소득 1,000,000 → 기본공제 1,000,000 → 과표 0 → 세액 0
   * 합계: 0
   */

  const stockA = stockInput();
  const stockB = stockInput();
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "each_item");

  it("MA-03-01: each_item 모드 totalFinalTax = 0 (소득 1M × 2, 기본공제 각 1M)", () => {
    expect(result.totalFinalTax).toBe(0);
  });
});

// ============================================================
// MA-04: 주식 2종목 (고액 소득 — 기본공제 초과 → 과세 발생)
// ============================================================

describe("MA-04: 주식 2종목 고액 — 합산 과세 (§103②2호 250만 1회)", () => {
  /*
   * 종목A: 양도가 60,000,000 / 취득가 10,000,000 → 소득 50,000,000
   *   기본공제(그룹2 첫 종목): min(50M, 250만) = 2,500,000
   *   과표: 47,500,000 → 20% → 9,500,000
   *
   * 종목B: 소득 50,000,000
   *   기본공제: 이미 소진(250만) → 0
   *   과표: 50,000,000 → 20% → 10,000,000
   *
   * 합계:
   *   totalTransferIncome = 100,000,000
   *   주식 그룹 기본공제 = 2,500,000 (한도 소진)
   *   totalCalculatedTax = 9,500,000 + 10,000,000 = 19,500,000
   *   totalFinalTax = 19,500,000
   *   totalLocalIncomeTax = (9,500,000 + 10,000,000) × 10% = 1,950,000
   */

  const stockA = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000,   // 60,000,000
    perShareAcquisitionPrice: 10_000, // 10,000,000
  });
  const stockB = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000,
    perShareAcquisitionPrice: 10_000,
  });
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "aggregate");

  it("MA-04-01: totalTransferIncome = 100,000,000", () => {
    expect(result.totalTransferIncome).toBe(100_000_000);
  });

  it("MA-04-02: 주식 그룹 기본공제 = 2,500,000 (250만원 한도)", () => {
    expect(result.basicDeductionByGroup.stock).toBe(2_500_000);
  });

  it("MA-04-03: totalCalculatedTax = 19,500,000 (종목A 9,500,000 + 종목B 10,000,000)", () => {
    // 종목A: 47,500,000 × 20% = 9,500,000
    // 종목B(기본공제 0): 50,000,000 × 20% = 10,000,000
    expect(result.totalCalculatedTax).toBe(19_500_000);
  });

  it("MA-04-04: totalFinalTax = 21,450,000 (산출세액 + 가산세 10%)", () => {
    // 19,500,000 + 19,500,000 × 10% = 19,500,000 + 1,950,000 = 21,450,000
    expect(result.totalFinalTax).toBe(21_450_000);
  });

  it("MA-04-05: totalLocalIncomeTax = 1,950,000 (합산 산출세액 × 10%)", () => {
    // 합산 산출세액 19,500,000 × 10% = 1,950,000
    expect(result.totalLocalIncomeTax).toBe(1_950_000);
  });
});

// ============================================================
// MA-05: 단건 aggregate (inputs.length === 1) — 단건과 동일
// ============================================================

describe("MA-05: 단건 inputs (항등성 — 단건 calculateStockTransferTax와 동일)", () => {
  /*
   * 단건 aggregate는 each_item 분기를 탐 (inputs.length === 1)
   * 소득: 60M - 10M = 50M
   * 기본공제: min(50M, 250만) = 2,500,000
   * 과표: 47,500,000 → 20% → 9,500,000
   * 가산세(일반 과소신고 10%): 9,500,000 × 10% = 950,000
   * finalTax: 9,500,000 + 950,000 = 10,450,000
   */

  const singleInput = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000,
    perShareAcquisitionPrice: 10_000,
  });

  const aggregateResult = calculateStockTransferTaxAggregate([singleInput], "aggregate");

  it("MA-05-01: 단건 aggregate calculatedTax = 9,500,000", () => {
    expect(aggregateResult.totalCalculatedTax).toBe(9_500_000);
  });

  it("MA-05-02: 단건 aggregate items[0].calculatedTax = 9,500,000", () => {
    // 47,500,000 × 20% = 9,500,000 → 10원 절사
    expect(aggregateResult.items[0].calculatedTax).toBe(9_500_000);
  });
});
