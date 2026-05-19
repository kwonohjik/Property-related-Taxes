/**
 * 케이스 3~8 — 상장 비대주주/대주주 기본 세율 분기
 *
 * 케이스 3: 코스피 비대주주 장내 → 비과세
 * 케이스 4: 코스피 비대주주 장외(K-OTC) → 비중소 20%
 * 케이스 5: 코스피 대주주 1년 미만 + 비중소 → 30%
 * 케이스 6: 대주주 1년 이상 + 과세표준 4억 → 누진 (4억 × 25% - 1,500만 = 8,500만)
 * 케이스 7: 코스닥 대주주 시총 50억 임계 (2024.1.1.~)
 * 케이스 8: 코넥스 대주주 (4% 지분 또는 50억 시총) → §104①11 가목 통합
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// ============================================================
// 공용 기본 입력 팩토리
// ============================================================

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kospi",
    isMajorShareholder: false,
    selfShareRatio: 0,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2023-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,

    acquisitionDate: new Date("2020-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 50_000,

    acquisitionMode: "actual",
    perShareAcquisitionPrice: 30_000,
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
// 케이스 3: 코스피 비대주주 장내 → 비과세
// ============================================================

describe("케이스 3 — 코스피 비대주주 장내거래 비과세", () => {
  it("C3-1: 비과세 (finalTax = 0, isExempt = true) — 산출세액은 정보용 echo", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: false,
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
    expect(result.exemptReason).toBe("non_major_in_market");
    expect(result.finalTax).toBe(0);
    // 신규 정책 (PR §94①3 가목 1) 단서 silent 비과세 차단):
    // 비과세 분기에서도 산출세액·과세표준은 사용자 입력 데이터로 echo. 최종 finalTax만 0.
    expect(result.calculatedTax).toBeGreaterThanOrEqual(0);
    expect(result.taxCategory).toBe("listed_non_major_in_market");
  });

  it("C3-2: 코스닥 비대주주 장내도 비과세", () => {
    const input = baseInput({
      marketType: "kosdaq",
      isMajorShareholder: false,
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
    expect(result.finalTax).toBe(0);
  });
});

// ============================================================
// 케이스 4: 코스피 비대주주 장외(K-OTC) → 비중소 20%
// ============================================================

describe("케이스 4 — 코스피 비대주주 장외거래 과세", () => {
  it("C4-1: taxCategory = listed_otc_non_major, 세율 20%", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: false,
      isKOTCTrading: true,  // 장외거래
      isSmallMediumEnterprise: false,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
      actualExpenses: 0,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_otc_non_major");
    expect(result.appliedSection94).toBe("①3가2)");
    // 양도소득금액 = 50,000 × 1,000 - 30,000 × 1,000 = 20,000,000
    // 기본공제 2,500,000 → 과세표준 17,500,000
    // 세율 20% → 산출세액 = floor(17,500,000 × 0.20) = 3,500,000
    // 10원 미만 절사 → 3,500,000
    expect(result.transferIncome).toBe(20_000_000);
    expect(result.taxBase).toBe(17_500_000);
    expect(result.appliedRate).toBe(0.20);
    expect(result.calculatedTax).toBe(3_500_000);
    expect(result.localIncomeTax).toBe(350_000);
  });

  it("C4-2: 비대주주 장외 중소기업 → 10%", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: false,
      isKOTCTrading: true,
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.appliedRate).toBe(0.10);
    // taxBase = 17,500,000 × 10% = 1,750,000
    expect(result.calculatedTax).toBe(1_750_000);
  });
});

// ============================================================
// 케이스 5: 대주주 1년 미만 + 비중소기업 → 단기 30%
// ============================================================

describe("케이스 5 — 대주주 1년 미만 + 비중소기업 단기 30%", () => {
  it("C5-1: 보유 11개월 → 30% 단기세율 적용", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,          // 3% (코스피 1% 초과 → 대주주)
      selfMarketCap: 0,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2023-07-01"),
      transferDate: new Date("2024-06-01"),  // 11개월 → 1년 미만
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(true);
    expect(result.appliedRate).toBe(0.30);
    // 양도소득금액 = 20,000,000
    // 기본공제 2,500,000 → 과세표준 17,500,000
    // 30% → floor(17,500,000 × 0.30) = 5,250,000 → 10원 절사 → 5,250,000
    expect(result.calculatedTax).toBe(5_250_000);
    expect(result.appliedRules).toContain("단기30%");
  });

  it("C5-2: 중소기업 대주주 1년 미만 → 30% 미적용 (누진)", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.03,
      isSmallMediumEnterprise: true,  // 중소기업 → 30% 적용 안 함
      acquisitionDate: new Date("2023-07-01"),
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isShortTermHolding).toBe(false);
    expect(result.appliedRate).toBe(0.20);  // 누진 3억 이하 20%
  });
});

// ============================================================
// 케이스 6: 대주주 1년 이상 + 과세표준 4억 → 누진세율
// ============================================================

describe("케이스 6 — 대주주 1년 이상 누진세율", () => {
  it("C6-1: 과세표준 4억 → 4억×25% − 1,500만 = 85,000,000", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.02,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),  // 4년 이상 보유
      // 과세표준이 4억이 되도록:
      // 양도가 - 취득가 - 경비 - 기본공제 = 400,000,000
      // transferIncome = 402,500,000 → taxBase = 400,000,000
      perShareTransferPrice: 100_000,
      perShareAcquisitionPrice: 55_000,
      shareCount: 9_000,
      // 양도가 = 900,000,000, 취득가 = 495,000,000
      // transferIncome = 405,000,000
      // 기본공제 = 2,500,000 → taxBase = 402,500,000
      actualExpenses: 0,
    });
    const result = calculateStockTransferTax(input);
    // transferIncome = 900M - 495M = 405,000,000
    // taxBase = 405,000,000 - 2,500,000 = 402,500,000
    // 누진: floor(402,500,000 × 0.25) - 15,000,000 = 100,625,000 - 15,000,000 = 85,625,000
    // 10원 절사 → 85,625,000
    expect(result.transferIncome).toBe(405_000_000);
    expect(result.taxBase).toBe(402_500_000);
    expect(result.appliedRate).toBe(0.25);
    expect(result.progressiveDeduction).toBe(15_000_000);
    expect(result.calculatedTax).toBe(85_625_000);
  });

  it("C6-2: 과세표준 정확히 3억 → 20% 구간 (경계값)", () => {
    const input = baseInput({
      marketType: "kospi",
      isMajorShareholder: true,
      selfShareRatio: 0.02,
      isSmallMediumEnterprise: false,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 100_000,
      perShareAcquisitionPrice: 65_000,
      shareCount: 8_750,  // 양도가 875M - 취득가 568,750M = 306,250,000
      actualExpenses: 3_750_000,  // 비용 → transferIncome = 302,500,000 → taxBase = 300,000,000
    });
    const result = calculateStockTransferTax(input);
    // transferIncome = 875,000,000 - 568,750,000 - 3,750,000 = 302,500,000
    // taxBase = 302,500,000 - 2,500,000 = 300,000,000
    // 3억 이하 20% → floor(300,000,000 × 0.20) - 0 = 60,000,000
    expect(result.taxBase).toBe(300_000_000);
    expect(result.appliedRate).toBe(0.20);
    expect(result.calculatedTax).toBe(60_000_000);
  });
});

// ============================================================
// 케이스 7: 코스닥 대주주 시총 50억 임계 (2024.1.1.~)
// ============================================================

describe("케이스 7 — 코스닥 시총 50억 임계 (2024.1.1.~)", () => {
  it("C7-1: 시총 50억 미만 → 비대주주 (지분 2% 미만) — 2024.1.1. 이후 기준", () => {
    const input = baseInput({
      marketType: "kosdaq",
      isMajorShareholder: false,
      selfShareRatio: 0.01,            // 1% (코스닥 2% 미만)
      selfMarketCap: 4_900_000_000,    // 49억 (2024 기준 50억 미만 → 비대주주)
      priorYearEndDate: new Date("2024-12-31"),  // 2025년 양도 → 2024.1.1. 이후 기준
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    // 2024년 기준: 지분 2% 미만 AND 시총 49억(50억 미만) → 비대주주 → 장내 비과세
    expect(result.isExempt).toBe(true);
    expect(result.finalTax).toBe(0);
  });

  it("C7-2: 시총 정확히 50억 → 대주주", () => {
    const input = baseInput({
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.005,           // 0.5% (지분 미달)
      selfMarketCap: 5_000_000_000,    // 정확히 50억 → 대주주
      priorYearEndDate: new Date("2023-12-31"),
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
  });

  it("C7-3: 2020년 기준 시총 10억 이상 → 대주주 (이력 임계)", () => {
    // 양도일 2021년, 직전 사업연도 종료일 2020-12-31 → 당시 임계 10억
    const input = baseInput({
      marketType: "kosdaq",
      isMajorShareholder: true,
      selfShareRatio: 0.005,
      selfMarketCap: 1_500_000_000,   // 15억 (2020 임계 10억 초과)
      priorYearEndDate: new Date("2020-12-31"),  // 2020년 말 기준
      isSmallMediumEnterprise: true,
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
  });
});

// ============================================================
// 케이스 8: 코넥스 대주주 → §104①11 가목 통합 적용
// ============================================================

describe("케이스 8 — 코넥스 대주주 §104①11 가목 통합", () => {
  it("C8-1: 코넥스 4% 지분 → 대주주, 중소기업 1년 이상 → 누진 20%", () => {
    const input = baseInput({
      marketType: "konex",
      isMajorShareholder: true,
      selfShareRatio: 0.04,            // 코넥스 4% → 대주주
      selfMarketCap: 0,
      priorYearEndDate: new Date("2023-12-31"),
      isSmallMediumEnterprise: true,
      acquisitionDate: new Date("2020-01-01"),
      transferDate: new Date("2024-06-01"),
      perShareTransferPrice: 50_000,
      perShareAcquisitionPrice: 30_000,
      shareCount: 1_000,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(false);
    expect(result.taxCategory).toBe("listed_major");
    expect(result.appliedSection94).toBe("①3가1)");
    expect(result.appliedRate).toBe(0.20);
    // taxBase = 17,500,000 → 3억 이하 20% → floor(17,500,000 × 0.20) = 3,500,000
    expect(result.calculatedTax).toBe(3_500_000);
  });

  it("C8-2: 코넥스 비대주주 장내 → 비과세 (2024.1.1. 이후 기준 50억 미만)", () => {
    const input = baseInput({
      marketType: "konex",
      isMajorShareholder: false,
      selfShareRatio: 0.01,           // 1% (코넥스 4% 미만)
      selfMarketCap: 1_000_000_000,   // 10억 (2024 기준 50억 미만 → 비대주주)
      priorYearEndDate: new Date("2024-12-31"),  // 2024.1.1. 이후 기준
      isKOTCTrading: false,
    });
    const result = calculateStockTransferTax(input);
    expect(result.isExempt).toBe(true);
    expect(result.finalTax).toBe(0);
  });
});
