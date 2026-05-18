/**
 * 취득 후 상장(§165⑤) + 시행령 §163⑨ 환산 합성 산식 검증 (PL-1 ~ PL-5)
 *
 * 사용자 보고 버그: PostListing 분기에서 1주당 취득기준시가를 그대로 취득가로 사용 (§163⑨ 미적용).
 *
 * 올바른 산식:
 *   1. §165⑤ — 1주당 취득기준시가 = 상장 1개월 종가평균 × (취득연도 가중평균 / 상장연도 가중평균)
 *   2. §163⑨ — 환산취득가 = 양도가 × (취득시 기준시가 / 양도시 기준시가)
 *
 * PDF 사례:
 *   양도가 44,750,000 / 1주당 양도기준 8,659 / 1주당 취득기준 5,824 / 주식수 5,000
 *   환산취득가 = 44,750,000 × 5,824 / 8,659 = 30,098,625
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
    isOnMarketTransaction: true,
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

describe("PL — 취득 후 상장 §165⑤ + §163⑨ 환산 합성 산식", () => {
  // PL-1 ★ Pre-Do — PDF 사례 직접 검증
  it("PL-1: PDF 사례 — 환산취득가 30,098,625 / 산출세액 2,372,030", () => {
    const r = calculateStockTransferTax(baseInput());
    expect(r.transferPrice).toBe(44_750_000);
    expect(r.valuationDetail?.finalPerShareValue).toBe(5_824);
    expect(r.acquisitionPrice).toBe(30_098_625);  // §163⑨ 환산 (44,750,000 × 5,824 / 8,659)
    expect(r.estimatedBase).toBe(29_120_000);     // §163⑥4 base = 5,824 × 5,000
    expect(r.expenses).toBe(291_200);              // 개산공제 = 29,120,000 × 1%
    expect(r.transferIncome).toBe(14_360_175);
    expect(r.taxBase).toBe(11_860_175);
    expect(r.calculatedTax).toBe(2_372_030);
    expect(r.localIncomeTax).toBe(237_200);
  });

  // PL-2 — 양도기준=10K, 취득기준=5K → 환산비율 0.5
  it("PL-2: 환산비율 0.5 단순 케이스", () => {
    const r = calculateStockTransferTax(
      baseInput({
        perShareTransferPrice: 10_000,
        transferDatePriceAvg1Month: 10_000,
        // 1주당 취득기준시가 = listingDatePriceAvg1Month × ratio
        // ratio를 0.5로 만들기 위해 ni·na를 임의 조정
        listingDatePriceAvg1Month: 10_000,
        listingYearNetIncomePerShare: 60_000,
        listingYearNetAssetPerShare: 5_000,    // (60K*3/5 + 5K*2/5) = 38,000
        acquisitionYearNetIncomePerShare: 30_000,
        acquisitionYearNetAssetPerShare: 2_500, // (30K*3/5 + 2.5K*2/5) = 19,000 → ratio 0.5
      })
    );
    // 1주당 취득기준 = 10,000 × 0.5 = 5,000
    // 환산취득가 = 50,000,000 × 5,000 / 10,000 = 25,000,000
    expect(r.acquisitionPrice).toBe(25_000_000);
  });

  // PL-3 — transferStd 미입력 → fallback (validate에서 차단해야 하지만 방어 처리)
  it("PL-3: transferStd 미입력 → fallback (기존 동작)", () => {
    const r = calculateStockTransferTax(
      baseInput({ transferDatePriceAvg1Month: 0 })
    );
    // fallback = postListingResult.totalAcquisitionPrice = 5,824 × 5,000 = 29,120,000
    expect(r.acquisitionPrice).toBe(29_120_000);
  });

  // PL-4 — 환산비율 1.0 (양도기준 = 취득기준) → 양도차익 음수 처리
  it("PL-4: 환산비율 1.0 → 양도차익 음수 max(0,·) 처리", () => {
    const r = calculateStockTransferTax(
      baseInput({
        transferDatePriceAvg1Month: 5_824, // 양도기준 = 취득기준
      })
    );
    // 환산취득가 = 44,750,000 × 5,824 / 5,824 = 44,750,000
    expect(r.acquisitionPrice).toBe(44_750_000);
    expect(r.expenses).toBe(291_200);
    // 양도차익 = 44.75M − 44.75M − 291K = -291,200 → max(0,·) = 0
    expect(r.transferIncome).toBeLessThanOrEqual(0);
    expect(r.taxBase).toBe(0);
    expect(r.calculatedTax).toBe(0);
  });

  // PL-5 — 비과세 분기 (장내 비대주주) + §163⑨ 환산 정보용 echo
  it("PL-5: 비과세 분기에서도 §163⑨ 환산 적용 + finalTax=0", () => {
    const r = calculateStockTransferTax(
      baseInput({
        isMajorShareholder: false,
        selfShareRatio: 0,
        isOnMarketTransaction: true, // 장내 → 비과세
      })
    );
    expect(r.isExempt).toBe(true);
    expect(r.acquisitionPrice).toBe(30_098_625); // §163⑨ 환산 정보용 echo
    expect(r.calculatedTax).toBeGreaterThanOrEqual(0); // 정보용 산식 echo
    expect(r.finalTax).toBe(0);
  });
});
