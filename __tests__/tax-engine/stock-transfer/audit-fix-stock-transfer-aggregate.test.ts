/**
 * 감사 확정 결함 회귀 테스트 — stock-transfer-aggregate.ts:172
 *
 * findingRef: lib/tax-engine/stock-transfer/stock-transfer-aggregate.ts:172 (confirmed/high)
 *
 * 결함: aggregate 모드에서 첫 주식 종목이 §103②2호 250만원 기본공제를 "일부만" 소진한 경우,
 *   후속 주식 종목이 잔여분이 아닌 250만원 전액을 다시 공제받아 그룹 한도(250만원)를 초과하고
 *   과세표준·산출세액이 과소산출되던 문제.
 *
 * 원인: 분기 조건 `if (stockUsed - deductThis === 0 || deductThis > 0)`이 deductThis>0인 모든
 *   종목을 엔진 전량 재계산(calculateStockTransferTaxInternal)으로 보내고, 순수 엔진의
 *   calcBasicDeduction은 주식 그룹에 항상 min(income, 2,500,000)을 적용하므로 부분-잔여 종목이
 *   250만원 전액을 다시 공제받았다.
 *
 * 기대값은 법령에서 독립 도출:
 *   - §103②2호: 주식 그룹 양도소득 기본공제는 연간 그룹당 1회 2,500,000원 한도.
 *   - §104①11 가목2: 대주주(비단기·비중소) 3억 이하 과세표준 20% (누진공제 0).
 *   - 국고금 관리법 §47: 본세 10원 미만 절사, 지방소득세 = 산출세액 × 10% 후 10원 절사.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTaxAggregate } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// 기존 case-aggregate-multi-stock.test.ts 와 동일한 입력 팩토리
// (kospi 대주주 → listed_major, 보유 2022-01-01~2024-06-01 = 비단기, 비중소 → 20% 누진 1구간)
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
    perShareTransferPrice: 50_000,

    acquisitionMode: "actual",
    perShareAcquisitionPrice: 40_000,

    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,

    expenseMode: "actual",
    actualExpenses: 0,

    filingType: "preliminary",
    filingDate: new Date("2024-08-31"),
    isElectronicFiling: false,
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,

    realEstateGroupBasicDeductionUsed: 0,

    ...overrides,
  };
}

// ============================================================
// MA-06: 부분-잔여 주식 종목이 잔여분만 공제받아야 함 (핵심 재현)
// ============================================================
describe("MA-06: aggregate — 첫 종목 부분 소진 시 후속 종목은 잔여분만 공제 (§103②2호 250만 1회)", () => {
  /*
   * 종목A: 소득 1,000,000 → 기본공제 1,000,000 소진 → 과표 0
   * 종목B: 소득 50,000,000 → 잔여 1,500,000 만 공제 (전액 2,500,000 아님)
   *   과표 = 50,000,000 − 1,500,000 = 48,500,000
   *   산출세액 = floor(48,500,000 × 20%) = 9,700,000  (§104①11 가목2, 3억 이하)
   * 그룹 기본공제 실적용 합 = 1,000,000 + 1,500,000 = 2,500,000 (한도 정확 소진)
   */
  const stockA = stockInput(); // 소득 1,000,000
  const stockB = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000, // 60,000,000
    perShareAcquisitionPrice: 10_000, // 10,000,000 → 소득 50,000,000
  });
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "aggregate");

  it("MA-06-01: 종목A 소득 1,000,000 / 종목B 소득 50,000,000", () => {
    expect(result.items[0].transferIncome).toBe(1_000_000);
    expect(result.items[1].transferIncome).toBe(50_000_000);
    expect(result.items[0].basicDeductionGroup).toBe("stock");
    expect(result.items[1].basicDeductionGroup).toBe("stock");
  });

  it("MA-06-02: 종목A 기본공제 1,000,000, 과표 0", () => {
    expect(result.items[0].basicDeduction).toBe(1_000_000);
    expect(result.items[0].taxBase).toBe(0);
  });

  it("MA-06-03: 종목B 기본공제 = 잔여 1,500,000 (250만 전액 아님)", () => {
    expect(result.items[1].basicDeduction).toBe(1_500_000);
  });

  it("MA-06-04: 종목B 과표 = 48,500,000", () => {
    expect(result.items[1].taxBase).toBe(48_500_000);
  });

  it("MA-06-05: 종목B 산출세액 = 9,700,000 (48,500,000 × 20%)", () => {
    expect(result.items[1].calculatedTax).toBe(9_700_000);
  });

  it("MA-06-06: 자기일관성 — 요약 basicDeductionByGroup.stock == 종목별 기본공제 합 == 2,500,000", () => {
    const itemsSum = result.items
      .filter((r) => r.basicDeductionGroup === "stock")
      .reduce((s, r) => s + r.basicDeduction, 0);
    expect(result.basicDeductionByGroup.stock).toBe(2_500_000);
    expect(itemsSum).toBe(2_500_000);
    expect(itemsSum).toBe(result.basicDeductionByGroup.stock);
  });

  it("MA-06-07: totalTaxBase = 48,500,000", () => {
    expect(result.totalTaxBase).toBe(48_500_000);
  });

  it("MA-06-08: totalCalculatedTax = 9,700,000", () => {
    expect(result.totalCalculatedTax).toBe(9_700_000);
  });

  it("MA-06-09: totalFinalTax = 9,700,000 (정상신고·가산세/전자공제 없음)", () => {
    expect(result.totalFinalTax).toBe(9_700_000);
  });

  it("MA-06-10: totalLocalIncomeTax = 970,000 (산출세액 × 10%)", () => {
    expect(result.totalLocalIncomeTax).toBe(970_000);
  });
});

// ============================================================
// MA-07: 경계 — 후속 종목 소득 ≤ 잔여분이면 소득 전액 공제 (과다공제 아님)
// ============================================================
describe("MA-07: aggregate — 후속 종목 소득이 잔여분 이하면 소득 전액 공제 (회귀 방지)", () => {
  /*
   * 종목A: 소득 2,000,000 → 공제 2,000,000 → 과표 0
   * 종목B: 소득   400,000 → 잔여 500,000 ≥ 소득 → 공제 400,000 → 과표 0
   * 그룹 기본공제 실적용 합 = 2,400,000 (한도 미소진)
   */
  const stockA = stockInput({
    shareCount: 100,
    perShareTransferPrice: 60_000, // 6,000,000
    perShareAcquisitionPrice: 40_000, // 4,000,000 → 소득 2,000,000
  });
  const stockB = stockInput({
    shareCount: 100,
    perShareTransferPrice: 44_000, // 4,400,000
    perShareAcquisitionPrice: 40_000, // 4,000,000 → 소득 400,000
  });
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "aggregate");

  it("MA-07-01: 종목A 소득 2,000,000 / 종목B 소득 400,000", () => {
    expect(result.items[0].transferIncome).toBe(2_000_000);
    expect(result.items[1].transferIncome).toBe(400_000);
  });

  it("MA-07-02: 종목A 공제 2,000,000, 종목B 공제 400,000 (소득 전액)", () => {
    expect(result.items[0].basicDeduction).toBe(2_000_000);
    expect(result.items[1].basicDeduction).toBe(400_000);
  });

  it("MA-07-03: 두 종목 과표 0, 산출세액 0", () => {
    expect(result.totalTaxBase).toBe(0);
    expect(result.totalCalculatedTax).toBe(0);
  });

  it("MA-07-04: 자기일관성 — 요약 stock 공제 == 종목별 합 == 2,400,000", () => {
    const itemsSum = result.items.reduce((s, r) => s + r.basicDeduction, 0);
    expect(result.basicDeductionByGroup.stock).toBe(2_400_000);
    expect(itemsSum).toBe(2_400_000);
  });
});

// ============================================================
// MA-08: 회귀 방지 — 첫 종목이 250만 전액 소진하는 경로 불변
// ============================================================
describe("MA-08: aggregate — 첫 종목이 250만 전액 소진하는 기존 경로 불변 (MA-04 등가)", () => {
  /*
   * 종목A: 소득 50,000,000 → 공제 2,500,000 전액 소진 → 과표 47,500,000 → 9,500,000
   * 종목B: 소득 50,000,000 → 공제 0 → 과표 50,000,000 → 10,000,000
   * 합계 산출세액 = 19,500,000
   */
  const stockA = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000,
    perShareAcquisitionPrice: 10_000,
  });
  const stockB = stockInput({
    shareCount: 1_000,
    perShareTransferPrice: 60_000,
    perShareAcquisitionPrice: 10_000,
  });
  const result = calculateStockTransferTaxAggregate([stockA, stockB], "aggregate");

  it("MA-08-01: 종목A 공제 2,500,000 / 종목B 공제 0", () => {
    expect(result.items[0].basicDeduction).toBe(2_500_000);
    expect(result.items[1].basicDeduction).toBe(0);
  });

  it("MA-08-02: totalCalculatedTax = 19,500,000 (9,500,000 + 10,000,000)", () => {
    expect(result.totalCalculatedTax).toBe(19_500_000);
  });

  it("MA-08-03: 요약 stock 공제 2,500,000 == 종목별 합", () => {
    const itemsSum = result.items.reduce((s, r) => s + r.basicDeduction, 0);
    expect(result.basicDeductionByGroup.stock).toBe(2_500_000);
    expect(itemsSum).toBe(2_500_000);
  });
});
