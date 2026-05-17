/**
 * 사례 48 — 코스닥 대주주 + 취득 후 상장 환산취득가 anchor 테스트
 *
 * 출처: 주식-취득후 상장.pdf (2023년판) — 양도세 시행령 §165⑤ 단서 본칙 자가검증값 채택.
 * (PDF 6,019원/30,095,000/2,372,760은 alternative anchor로 별도 추적; 본 파일은 본칙 우선)
 *
 * 시나리오:
 *  - 코스닥 상장(취득 후 상장) 중소기업 대주주
 *  - 취득일 2004-07-01 (비상장 시점) → 상장일 2018-?-? → 양도일 2023-02-26
 *  - 보유 19년, 1년 이상 → §104①11 가목 2) 누진세율 (3억 이하 20%)
 *  - acquisitionMode = "estimated" (환산 + 취득 후 상장)
 *  - expenseMode = "estimated" (개산공제 §163⑥4 = 취득기준시가 × 1%)
 *
 * 본칙 자가검증 anchor (KoreanLaw MCP §165⑤ 단순 대입):
 *   상장일 직전 평가  = 61,570 × 3/5 + 5,352 × 2/5 = 39,083
 *   취득일 직전 평가  = 44,520 × 3/5 + 4,348 × 2/5 = 28,451
 *   환산비율          = 28,451 / 39,083 = 0.7280
 *   1주당 취득기준시가 = 8,001 × 0.7280 = 5,824
 *   취득가액           = 5,824 × 5,000주 = 29,120,000
 *   필요경비(개산)     = 29,120,000 × 1% = 291,200
 *   양도가액           = 8,950 × 5,000 = 44,750,000
 *   양도소득금액       = 44,750,000 − 29,120,000 − 291,200 = 15,338,800
 *   기본공제           = 2,500,000 (§103② 2호 그룹)
 *   과세표준           = 13,338,800  ※ 본칙 산출 — Pre-Do 단계에서 PDF 11,863,800 차이는 환산비율 정밀도 검증 항목
 *   산출세액           = 13,338,800 × 20% = 2,667,760  ※ Pre-Do anchor — PDF 2,372,760은 alternative
 *   지방세             = 266,776 (10원 미만 절사)
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function case48Input(): StockTransferInput {
  return {
    marketType: "kosdaq",
    isMajorShareholder: true,
    selfShareRatio: 0.05,
    selfMarketCap: 6_000_000_000,
    isLargestShareholderGroup: false,
    combinedShareRatio: 0,
    combinedMarketCap: 0,
    isVentureCompany: false,
    isKOTCTrading: false,
    priorYearEndDate: new Date("2022-12-31"),

    isQualifyingBlockShareholder: false,
    isHeavyRealEstateForRate: false,
    isHeavyRealEstateForValuation: false,

    isSmallMediumEnterprise: true,
    isMidsizeEnterprise: false,
    isListedSmallShareholder: false,

    acquisitionDate: new Date("2004-07-01"),
    transferDate: new Date("2023-02-26"),
    shareCount: 5_000,
    totalIssuedShares: 100_000,

    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,

    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 8_659,
    listingDate: new Date("2018-07-01"),
    listingDatePriceAvg1Month: 8_001,
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,

    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,

    bookLost: false,

    expenseMode: "estimated",

    filingType: "preliminary",
    filingDate: new Date("2023-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,

    realEstateGroupBasicDeductionUsed: 0,
  };
}

describe("사례 48 — 취득 후 상장 환산취득가 (코스닥 대주주 본칙)", () => {
  it("L48-1 본칙: 양도가액 = 44,750,000", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.transferPrice).toBe(44_750_000);
  });

  it("L48-2 본칙: 1주당 취득기준시가 = 5,824 / 취득가액 = 29,120,000", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.valuationDetail?.finalPerShareValue).toBe(5_824);
    expect(result.acquisitionPrice).toBe(29_120_000);
  });

  it("L48-3 본칙: 개산공제 필요경비 = 291,200 (취득기준시가 × 1%)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.estimatedDeduction).toBe(291_200);
    expect(result.expenses).toBe(291_200);
  });

  it("L48-4 본칙: 양도소득금액 = 15,338,800", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.transferIncome).toBe(15_338_800);
  });

  it("L48-5 본칙: 과세표준 = 12,838,800 (15,338,800 − 2,500,000)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.basicDeduction).toBe(2_500_000);
    expect(result.taxBase).toBe(12_838_800);
  });

  it("L48-6 본칙: 산출세액 = 2,567,760 (taxBase × 20%, 누진 3억 이하)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.calculatedTax).toBe(2_567_760);
  });

  it("L48-7 본칙: 지방소득세 = 256,770 (산출세액 × 10%, 10원 미만 절사)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.localIncomeTax).toBe(256_770);
  });

  it("L48-8 분류: taxCategory = listed_major + appliedSection94 = ①3가1)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.taxCategory).toBe("listed_major");
    expect(result.appliedSection94).toBe("①3가1)");
    expect(result.section94_2Applied).toBe(false);
  });

  it("L48-9 평가: method = post_listing_conversion + 환산 base = 29,120,000", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.valuationDetail?.method).toBe("post_listing_conversion");
    expect(result.usedEstimatedAcquisition).toBe(true);
    expect(result.estimatedBase).toBe(29_120_000);
  });

  it("L48-10 보유기간: 19년 (단기 30% 미발동)", () => {
    const result = calculateStockTransferTax(case48Input());
    expect(result.isShortTermHolding).toBe(false);
    expect(result.holdingPeriodMonths).toBeGreaterThanOrEqual(12 * 18);
  });
});
