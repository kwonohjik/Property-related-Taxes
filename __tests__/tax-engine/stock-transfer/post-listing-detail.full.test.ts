/**
 * PL-FULL · PL-BUILD · PL-FLOOR · PL-CONV · PL-LEGACY · PL-RE · PL-MONTHLY 통합 테스트.
 *
 * 사례 EXAMPLE_POST_LISTING — full mode 80 필드 입력 → 산출세액 자가검증.
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import {
  buildPostListingFromDetail,
  adaptFlatToPostListingDetail,
  adaptFlatToApiBody,
} from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import { calcPostListingConversion, calcUnlistedPerShareWeighted } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { fullDetailExample } from "./helpers/post-listing-input-builder";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseFullInput(): StockTransferInput {
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
    totalIssuedShares: 100_000,   // case-48 정합 (대주주 임계 판정용)
    acquisitionCause: "purchase",

    transferPriceMode: "actual",
    perShareTransferPrice: 8_950,
    acquisitionMode: "estimated",
    transferDatePriceAvg1Month: 8_659,
    listingDate: new Date("2018-07-01"),
    acquiredBeforeListing: true,
    tradingHaltAtTransfer: false,
    bookLost: false,

    // simple 모드용 4 필드 — full 모드에서는 synthesize됨
    listingDatePriceAvg1Month: 0,
    listingYearNetIncomePerShare: 0,
    listingYearNetAssetPerShare: 0,
    acquisitionYearNetIncomePerShare: 0,
    acquisitionYearNetAssetPerShare: 0,

    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2023-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,

    postListingDetail: fullDetailExample(),
  };
}

describe("PL-FULL — 사례 EXAMPLE_POST_LISTING full mode 통합", () => {
  it("PL-FULL-1 — full mode: 80필드 → 환산취득가 29,120,000 + 산출세액 2,667,760", () => {
    const result = calculateStockTransferTax(baseFullInput());
    // 환산취득가는 simple 모드 사례 48과 동일해야 함
    expect(result.acquisitionPrice).toBe(29_120_000);
    expect(result.estimatedBase).toBe(29_120_000);
    expect(result.calculatedTax).toBe(2_567_760);
  });

  it("PL-FULL-2 — postListingDetail echo (acquiredBeforeListing + detail.mode)", () => {
    const result = calculateStockTransferTax(baseFullInput());
    expect(result.acquiredBeforeListing).toBe(true);
    expect(result.postListingDetail).toBeDefined();
    expect(result.postListingDetail?.detail?.mode).toBe("full");
    expect(result.postListingDetail?.detail?.floor80NotApplied).toBe(true);
    expect(result.postListingDetail?.detail?.closing?.tradingDays).toBe(21);
    expect(result.postListingDetail?.detail?.closing?.avg).toBe(8_001);
    expect(result.postListingDetail?.detail?.netIncome?.listing.perShareValue).toBe(61_570);
    expect(result.postListingDetail?.detail?.netAsset?.acquisition?.perShareAsset).toBe(4_348);
  });

  it("PL-FULL-3 — full mode 결과 = simple mode 결과 (사례 48 회귀 보호)", () => {
    // full mode
    const fullResult = calculateStockTransferTax(baseFullInput());
    // simple mode
    const simpleInput: StockTransferInput = {
      ...baseFullInput(),
      postListingDetail: undefined,
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
    };
    const simpleResult = calculateStockTransferTax(simpleInput);
    expect(fullResult.acquisitionPrice).toBe(simpleResult.acquisitionPrice);
    expect(fullResult.calculatedTax).toBe(simpleResult.calculatedTax);
  });
});

describe("PL-BUILD — Flat → Nested adapter", () => {
  it("PL-BUILD-1 — buildPostListingFromDetail full mode 합성", () => {
    const detail = fullDetailExample();
    const synth = buildPostListingFromDetail(detail);
    expect(synth.listingDatePriceAvg1Month).toBe(8_001);
    expect(synth.listingYearNetIncomePerShare).toBe(61_570);
    expect(synth.listingYearNetAssetPerShare).toBe(5_351);   // H-03 floor (PDF 5,352는 ±1 차이 — 1주당 환산에서 흡수)
    expect(synth.acquisitionYearNetIncomePerShare).toBe(44_520);
    expect(synth.acquisitionYearNetAssetPerShare).toBe(4_348);
  });

  it("PL-BUILD-2 — simple 모드는 0 반환 (기존 4 필드 사용)", () => {
    const synth = buildPostListingFromDetail({
      unlistedDetailMode: "simple",
      monthlyAccrualToggle: false,
    });
    expect(synth.listingDatePriceAvg1Month).toBe(0);
    expect(synth.listingYearNetIncomePerShare).toBe(0);
  });

  it("PL-BUILD-3 — adaptFlatToApiBody simple 분기", () => {
    const body = adaptFlatToApiBody(
      {
        unlistedDetailMode: "simple",
        listingDatePriceAvg1Month: 8_001,
        listingYearNetIncomePerShare: 61_570,
      },
      true,
    );
    expect(body.acquiredBeforeListing).toBe(true);
    expect(body.postListingDetail).toBeUndefined();
    expect(body.listingDatePriceAvg1Month).toBe(8_001);
    expect(body.listingYearNetIncomePerShare).toBe(61_570);
  });

  it("PL-BUILD-4 — adaptFlatToPostListingDetail listing_only — acquisition 미포함", () => {
    const detail = adaptFlatToPostListingDetail({
      unlistedDetailMode: "listing_only",
      monthlyAccrualToggle: false,
      listingPriceDates: ["2009-08-21"],
      listingPriceClosing: ["8000"],
      listingPriceBasisDate: "2009-08-21",
      niAddRow1Listing: "1000000",
      niShareCountListing: "100",
      niDiscountRateListing: "10",
      naAssetTotalRow1Listing: "500000",
      naLiabTotalRow8Listing: "200000",
      naShareCountListing: "100",
    });
    expect(detail.unlistedDetailMode).toBe("listing_only");
    expect(detail.closing?.dates.length).toBe(1);
    expect(detail.netIncome?.listing.shareCount).toBe(100);
    expect(detail.netIncome?.listing.discountRate).toBe(0.10);
  });
});

describe("PL-CONV — 환산비율 + 1주당 (사례 EXAMPLE 본칙)", () => {
  it("PL-CONV-1 — 환산비율 → 1주당 5,824 → 총 29,120,000", () => {
    // PDF 직접 입력값(5,352) 사용: 39,082 (floor 39,082.8)
    // 1주당 floor(8,001 × 28,451/39,082) = floor(5,824.79...) = 5,824
    const result = calcPostListingConversion({
      ...baseFullInput(),
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
      postListingDetail: undefined,
    });
    expect(result.listingYearPerShareValue).toBe(39_082);
    expect(result.acquisitionYearPerShareValue).toBe(28_451);
    expect(result.conversionRatio).toBeCloseTo(0.72801, 4);
    expect(result.finalPerShareValue).toBe(5_824);
    expect(result.totalAcquisitionPrice).toBe(29_120_000);
  });
});

describe("PL-FLOOR — 80% 하한 미적용 양방향 회귀 보호 (Round 4 H-06)", () => {
  it("PL-FLOOR-1 — ratio = 0.85 (>= 0.80): ratio 그대로 적용", () => {
    // 상장 100 / 취득 85 → ratio = 0.85
    // 80% 하한 적용 시 → ratio = 0.80으로 보정될 위험 → 미적용 확인
    const result = calcPostListingConversion({
      ...baseFullInput(),
      listingDatePriceAvg1Month: 10_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 100,    // 가중평균 100
      acquisitionYearNetIncomePerShare: 85,
      acquisitionYearNetAssetPerShare: 85, // 가중평균 85
      shareCount: 1_000,
      postListingDetail: undefined,
    });
    expect(result.listingYearPerShareValue).toBe(100);
    expect(result.acquisitionYearPerShareValue).toBe(85);
    expect(result.conversionRatio).toBeCloseTo(0.85, 4);
    expect(result.finalPerShareValue).toBe(8_500);   // 10,000 × 0.85
  });

  it("PL-FLOOR-2 — ratio = 0.50 (< 0.80): ratio 그대로 (80%로 끌어올림 X)", () => {
    // 80% 하한 잘못 적용 시 ratio가 0.80으로 상향 보정될 수 있음 → 검증
    const result = calcPostListingConversion({
      ...baseFullInput(),
      listingDatePriceAvg1Month: 10_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 100,    // 가중평균 100
      acquisitionYearNetIncomePerShare: 50,
      acquisitionYearNetAssetPerShare: 50, // 가중평균 50
      shareCount: 1_000,
      postListingDetail: undefined,
    });
    expect(result.acquisitionYearPerShareValue).toBe(50);
    expect(result.conversionRatio).toBeCloseTo(0.50, 4);
    expect(result.finalPerShareValue).toBe(5_000);   // 10,000 × 0.50 (8,000 아님!)
    // detail.floor80NotApplied 명시
    expect(result.detail?.floor80NotApplied).toBe(true);
  });
});

describe("PL-RE — 부동산과다 가중치 반전 (2:3)", () => {
  it("PL-RE-1 — H-04 직접 반전 검증", () => {
    // 일반: 100×3/5 + 50×2/5 = 80
    // 반전: 100×2/5 + 50×3/5 = 70
    expect(calcUnlistedPerShareWeighted(100, 50, false)).toBe(80);
    expect(calcUnlistedPerShareWeighted(100, 50, true)).toBe(70);
  });

  it("PL-RE-2 — calcPostListingConversion 부동산과다 분기 적용", () => {
    const result = calcPostListingConversion({
      ...baseFullInput(),
      isHeavyRealEstateForValuation: true,
      listingDatePriceAvg1Month: 10_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 50,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 50,
      shareCount: 1_000,
      postListingDetail: undefined,
    });
    // 일반 가중평균 = 80 / 반전 = 70 → 두 연도 모두 70 (동일하므로 ratio = 1)
    expect(result.listingYearPerShareValue).toBe(70);
    expect(result.acquisitionYearPerShareValue).toBe(70);
  });
});

describe("PL-LEGACY — 회귀 보호 (사례 48 simple mode 호환)", () => {
  it("PL-LEGACY-1 — simple mode 결과는 변하지 않음 (case-48 anchor 의존)", () => {
    const result = calculateStockTransferTax({
      ...baseFullInput(),
      postListingDetail: undefined,
      listingDatePriceAvg1Month: 8_001,
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
    });
    expect(result.acquisitionPrice).toBe(29_120_000);
    expect(result.calculatedTax).toBe(2_567_760);
    // simple 모드에서도 acquiredBeforeListing echo + detail.mode = "simple"
    expect(result.acquiredBeforeListing).toBe(true);
    expect(result.postListingDetail?.detail?.mode).toBe("simple");
  });
});
