/**
 * B-2 — §97②2호 단서 swap (주식 환산취득가액)
 *
 * 계획: docs/00-pm/stock-transfer-97-2-swap-b2.plan.md
 * 설계: docs/02-design/features/stock-transfer-97-2-swap-b2.{engine,ui}.design.md
 * 법령: 소법 §97②2호 단서 + 소령 §163⑫ → §176의2②1호(주식 환산 명시) + §163⑤1호 가목(증권거래세 양도비)
 *
 * 단서: (환산취득가+개산공제) < (자본적지출+양도비) 시 후자를 필요경비 전체로 대체.
 *       swap 시 양도차익 = 양도가액 − 실제 필요경비 (환산취득가 차감 제외).
 *
 *   SW-1: 실비 미입력 → 본문 (LE-1 동치)
 *   SW-2: 실비 31,000,000 > 가목 30,300,000 → swap (transferIncome 19,000,000)
 *   SW-3: 실비 = 가목 동률 → 본문 (적은 경우 아님)
 *   SW-4: 실비 1,000,000 < 가목 → 본문 + "환산취득가 모드" warning (LE-7 호환)
 *   SW-5: sale_case + 실비 충분 → swap 비발동 (구조 배제)
 *   SW-6: face_value + 실비 > 가목 → swap
 *   SW-7: C-1 취득정지 환산 + 실비 > 가목 → swap
 *   SW-9: 장내 비대주주 비과세 + 실비 > 가목 → finalTax 0 + swap 정보 echo
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

// LE-1 기반: 양도 50,000,000 · 환산 30,000,000 · 개산공제 300,000 → 가목 30,300,000
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
    isOnMarketTransaction: false, // 장외 (과세)
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2018-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 1_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    transferActualInputMode: "per_share",
    perShareTransferPrice: 50_000,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 50_000,
    acquisitionDatePriceAvg1Month: 30_000,
    acquiredBeforeListing: false,
    tradingHaltAtTransfer: false,
    bookLost: false,
    expenseMode: "estimated",
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

describe("B-2: §97②2호 단서 swap", () => {
  it("SW-1: 실비 미입력 → 본문 (LE-1 동치·swapApplied false)", () => {
    const r = calculateStockTransferTax(baseInput({ actualExpenses: 0 }));
    expect(r.acquisitionPrice).toBe(30_000_000);
    expect(r.expenses).toBe(300_000);
    expect(r.transferIncome).toBe(19_700_000);
    expect(r.swapApplied).toBeFalsy();
    expect(r.swapComparison).toBeUndefined();
  });

  it("SW-2: 실비 31,000,000 > 가목 30,300,000 → swap (transferIncome 19,000,000)", () => {
    const r = calculateStockTransferTax(
      baseInput({ expenseMode: "actual", actualExpenses: 31_000_000 }),
    );
    expect(r.swapApplied).toBe(true);
    expect(r.expenses).toBe(31_000_000);
    expect(r.acquisitionPrice).toBe(30_000_000); // echo 유지
    expect(r.transferIncome).toBe(19_000_000); // 50,000,000 − 31,000,000 (취득가 차감 제외)
    expect(r.swapComparison).toEqual({
      estimatedSide: 30_300_000,
      directSide: 31_000_000,
      chosen: "direct",
    });
    expect(r.appliedRules).toContain("§97②단서swap");
  });

  it("SW-3: 실비 = 가목 동률 (30,300,000) → 본문 (적은 경우 아님)", () => {
    const r = calculateStockTransferTax(
      baseInput({ expenseMode: "actual", actualExpenses: 30_300_000 }),
    );
    expect(r.swapApplied).toBeFalsy();
    expect(r.expenses).toBe(300_000);
    expect(r.swapComparison?.chosen).toBe("estimated");
  });

  it("SW-4: 실비 1,000,000 < 가목 → 본문 + '환산취득가 모드' warning (LE-7 호환)", () => {
    const r = calculateStockTransferTax(
      baseInput({ expenseMode: "actual", actualExpenses: 1_000_000 }),
    );
    expect(r.swapApplied).toBeFalsy();
    expect(r.expenses).toBe(300_000);
    expect(r.warnings.some((w) => w.includes("환산취득가 모드"))).toBe(true);
  });

  it("SW-5: sale_case + 실비 충분 → swap 비발동 (구조 배제)", () => {
    // sale_case는 usedEstimatedAcquisition 미설정 → swap 게이트 미진입
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "unlisted",
        isMajorShareholder: true,
        selfShareRatio: 0.6,
        selfMarketCap: 2_000_000_000,
        acquisitionMode: "sale_case",
        acquisitionMarketSamplePrice: 30_000,
        expenseMode: "actual",
        actualExpenses: 31_000_000,
      }),
    );
    expect(r.swapApplied).toBeFalsy();
  });

  it("SW-6: face_value + 실비 > 가목 → swap", () => {
    // 장부분실 액면가 (§99①4): 비상장 + face_value 모드
    const r = calculateStockTransferTax(
      baseInput({
        marketType: "unlisted",
        isMajorShareholder: true,
        selfShareRatio: 0.6,
        selfMarketCap: 2_000_000_000,
        acquisitionMode: "face_value",
        bookLost: true,
        faceValuePerShare: 12_500,
        transferYearNetIncomePerShare: 30_000,
        transferYearNetAssetPerShare: 200_000,
        expenseMode: "actual",
        actualExpenses: 5_000_000_000, // 충분히 큰 값
      }),
    );
    expect(r.swapApplied).toBe(true);
    expect(r.expenses).toBe(5_000_000_000);
    expect(r.transferIncome).toBe(r.transferPrice - 5_000_000_000);
  });

  it("SW-7: C-1 취득정지 환산 + 실비 6,000,000 > 가목 5,656,000 → swap", () => {
    // 취득 NI 6,000/NA 5,000 → 분자 5,600 · 양도 10,000,000(1주 10,000) → 환산 5,600,000 · 개산 56,000
    const r = calculateStockTransferTax(
      baseInput({
        perShareTransferPrice: 10_000,
        transferDatePriceAvg1Month: 10_000,
        acquisitionDatePriceAvg1Month: undefined,
        tradingHaltAtAcquisition: true,
        acquisitionYearNetIncomePerShare: 6_000,
        acquisitionYearNetAssetPerShare: 5_000,
        expenseMode: "actual",
        actualExpenses: 6_000_000,
      }),
    );
    expect(r.acquisitionPrice).toBe(5_600_000);
    expect(r.swapApplied).toBe(true);
    expect(r.swapComparison?.estimatedSide).toBe(5_656_000); // 5,600,000 + 56,000
    expect(r.transferIncome).toBe(4_000_000); // 10,000,000 − 6,000,000
  });

  it("SW-9: 장내 비대주주 비과세 + 실비 > 가목 → finalTax 0 + swap 정보 echo", () => {
    const r = calculateStockTransferTax(
      baseInput({
        isOnMarketTransaction: true,
        expenseMode: "actual",
        actualExpenses: 31_000_000,
      }),
    );
    expect(r.isExempt).toBe(true);
    expect(r.finalTax).toBe(0);
    expect(r.swapApplied).toBe(true);
    expect(r.transferIncome).toBe(19_000_000);
  });
});
