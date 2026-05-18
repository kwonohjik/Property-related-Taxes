/**
 * TI — 양도일 직전 1개월 종가 입력 방식 (direct vs daily) 검증
 *
 * 본 PR 핵심:
 *   - Engine Input에 transferStdInputMode optional (메타·산식 영향 없음)
 *   - daily 모드는 UI mirror 패턴으로 transferDatePriceAvg1Month 자동 산정 → 엔진은 동일 산식
 *   - Result.valuationDetail에 transferDailyModeUsed·transferDailyAverage echo
 *
 * 사용자 PDF 사례: 양도가 44,750,000 / 1주당 양도기준 8,659 / 1주당 취득기준 5,824 / 주식수 5,000
 *   → §163⑨ 환산취득가 = 44,750,000 × 5,824 / 8,659 = 30,098,625
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(overrides: Partial<StockTransferInput> = {}): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 0,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    isOnMarketTransaction: false,
    priorYearEndDate: new Date("2023-12-31"),
    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,
    isSmallMediumEnterprise: false,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,
    acquisitionDate: new Date("2005-01-01"),
    transferDate: new Date("2024-06-01"),
    shareCount: 5_000,
    totalIssuedShares: 10_000_000,
    acquisitionCause: "purchase",
    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 8_659,
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,
    listingDate: new Date("2009-08-21"),
    listingDatePriceAvg1Month: 8_001,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    bookLost: false,
    expenseMode: "estimated",
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

describe("TI — 양도일 직전 1개월 종가 입력 방식 (direct vs daily)", () => {
  // ──────────────────────────────────────────────────────────
  // TI-14 — direct 모드 회귀 보호 (기존 PL-1 동일 결과)
  // ──────────────────────────────────────────────────────────
  it("TI-14: direct 모드 → §163⑨ → 30,098,625 (PL-1 동일)", () => {
    const r = calculateStockTransferTax(
      baseInput({ transferStdInputMode: "direct" })
    );
    expect(r.acquisitionPrice).toBe(30_098_625);
    expect(r.valuationDetail?.transferDailyModeUsed).toBe(false);
    expect(r.valuationDetail?.transferDailyAverage).toBeUndefined();
  });

  // ──────────────────────────────────────────────────────────
  // TI-14b — undefined → direct fallback (기존 동작 보존)
  // ──────────────────────────────────────────────────────────
  it("TI-14b: transferStdInputMode 미지정 → direct 동작 (기존 회귀 보호)", () => {
    const input = baseInput();
    delete (input as Partial<StockTransferInput>).transferStdInputMode;
    const r = calculateStockTransferTax(input);
    expect(r.acquisitionPrice).toBe(30_098_625);
    expect(r.valuationDetail?.transferDailyModeUsed).toBe(false);
  });

  // ──────────────────────────────────────────────────────────
  // TI-13 — daily 모드 (UI mirror된 transferDatePriceAvg1Month=8,659 가정)
  //   엔진 자체는 direct·daily 산식 동일. 단순히 echo 메타만 다름.
  // ──────────────────────────────────────────────────────────
  it("TI-13: daily 모드 + mirror 8,659 → §163⑨ → 30,098,625 + daily echo", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferStdInputMode: "daily",
        transferDatePriceAvg1Month: 8_659, // UI mirror된 평균값
      })
    );
    expect(r.acquisitionPrice).toBe(30_098_625);
    expect(r.valuationDetail?.transferDailyModeUsed).toBe(true);
    expect(r.valuationDetail?.transferDailyAverage).toBe(8_659);
  });

  // ──────────────────────────────────────────────────────────
  // TI-15 — echo 일관성 (valuationDetail.conversionTransferStd === transferDatePriceAvg1Month)
  // ──────────────────────────────────────────────────────────
  it("TI-15: daily 모드 echo 일관성 — conversionTransferStd === transferDatePriceAvg1Month", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferStdInputMode: "daily",
        transferDatePriceAvg1Month: 8_659,
      })
    );
    expect(r.valuationDetail?.conversionTransferStd).toBe(8_659);
    expect(r.valuationDetail?.transferDailyAverage).toBe(8_659);
    expect(r.valuationDetail?.transferDailyAverage).toBe(r.valuationDetail?.conversionTransferStd);
  });
});
