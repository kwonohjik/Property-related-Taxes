/**
 * PL-* 추가 anchor (P1 G-01 보강 — 16건).
 *
 * - PL-MONTHLY 3: §81④ 월할 가산 발동 검증 (acquisitionYearValue === listingYearValue)
 * - PL-LISTING-ONLY 4: listing_only adapter 분기 (취득연도 직접 입력 유지)
 * - PL-HEAVY-RE 2: calcPostListingConversion isHeavyRE 가중치 반전 분기
 * - PL-CLOSE-EXTRA 3: 종가 휴일·주말 처리 보강
 * - PL-BUILD-EXTRA 4: adapter API body 분기 정확성
 */

import { describe, it, expect } from "vitest";
import { calculateStockTransferTax } from "@/lib/tax-engine/stock-transfer/stock-transfer-tax";
import { calcPostListingConversion, calcMonthlyClosingAverage } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import {
  adaptFlatToPostListingDetail,
  adaptFlatToApiBody,
} from "@/lib/tax-engine/stock-transfer/post-listing-flat-adapter";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

function baseInput(): StockTransferInput {
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
    bookLost: false,
    listingYearNetIncomePerShare: 61_570,
    listingYearNetAssetPerShare: 5_352,
    acquisitionYearNetIncomePerShare: 44_520,
    acquisitionYearNetAssetPerShare: 4_348,
    expenseMode: "estimated",
    filingType: "preliminary",
    filingDate: new Date("2023-08-31"),
    isElectronicFiling: false,
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
  };
}

// ============================================================
// PL-MONTHLY (3건) — §81④ 월할 가산 발동
// ============================================================

describe("PL-MONTHLY — 시행규칙 §81④ 월할 가산 (Case 5)", () => {
  it("PL-MONTHLY-1 — 취득연도 평가 = 상장연도 평가인 동일값 입력 시 monthlyAccrualApplied=true", () => {
    // 양 연도 가중평균이 같으면 monthlyAccrualApplied = true
    const result = calcPostListingConversion({
      ...baseInput(),
      listingYearNetIncomePerShare: 50_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetIncomePerShare: 50_000,
      acquisitionYearNetAssetPerShare: 5_000,
    });
    expect(result.monthlyAccrualApplied).toBe(true);
    // 가중평균 같음 → ratio = 1 → finalPerShareValue = listingAvg
    expect(result.conversionRatio).toBe(1);
    expect(result.finalPerShareValue).toBe(8_001);
  });

  it("PL-MONTHLY-2 — 양 연도 다른 값일 때 monthlyAccrualApplied=false (사례 EXAMPLE)", () => {
    const result = calcPostListingConversion({
      ...baseInput(),
      listingYearNetIncomePerShare: 61_570,
      listingYearNetAssetPerShare: 5_352,
      acquisitionYearNetIncomePerShare: 44_520,
      acquisitionYearNetAssetPerShare: 4_348,
    });
    expect(result.monthlyAccrualApplied).toBe(false);
  });

  it("PL-MONTHLY-3 — warnings에 §81④ 안내 메시지 포함", () => {
    const result = calcPostListingConversion({
      ...baseInput(),
      listingYearNetIncomePerShare: 10_000,
      listingYearNetAssetPerShare: 10_000,
      acquisitionYearNetIncomePerShare: 10_000,
      acquisitionYearNetAssetPerShare: 10_000,
    });
    expect(result.monthlyAccrualApplied).toBe(true);
    const hasMonthlyHint = result.warnings.some((w) => w.includes("§81④") || w.includes("월할"));
    expect(hasMonthlyHint).toBe(true);
  });
});

// ============================================================
// PL-LISTING-ONLY (4건) — listing_only adapter 분기
// ============================================================

describe("PL-LISTING-ONLY — listing_only 모드 adapter 분기", () => {
  it("PL-LISTING-ONLY-1 — adaptFlatToApiBody listing_only: 상장 합성 + 취득 직접 입력 그대로", () => {
    const body = adaptFlatToApiBody(
      {
        unlistedDetailMode: "listing_only",
        listingPriceDates: ["2018-07-01", "2018-07-02"],
        listingPriceClosing: ["8000", "8002"],
        niAddRow1Listing: "1000000000",
        niShareCountListing: "100000",
        niDiscountRateListing: "10",
        naAssetTotalRow1Listing: "500000000",
        naLiabTotalRow8Listing: "200000000",
        naShareCountListing: "100000",
        // 취득연도는 직접 4 필드
        acquisitionYearNetIncomePerShare: 44_520,
        acquisitionYearNetAssetPerShare: 4_348,
      },
      true,
    );
    expect(body.acquiredBeforeListing).toBe(true);
    expect(body.postListingDetail?.unlistedDetailMode).toBe("listing_only");
    // 종가 합성
    expect(body.listingDatePriceAvg1Month).toBe(8_001);
    // 상장 합성 (1,000M / 100,000 / 0.10 = 100,000)
    expect(body.listingYearNetIncomePerShare).toBe(100_000);
    // 취득연도 직접 입력 유지
    expect(body.acquisitionYearNetIncomePerShare).toBe(44_520);
    expect(body.acquisitionYearNetAssetPerShare).toBe(4_348);
  });

  it("PL-LISTING-ONLY-2 — listing_only adapter는 nested netIncome.acquisition을 비어있는 객체로 채움", () => {
    const detail = adaptFlatToPostListingDetail({
      unlistedDetailMode: "listing_only",
      monthlyAccrualToggle: false,
      niAddRow1Listing: "1000000",
      niShareCountListing: "100",
    });
    expect(detail.unlistedDetailMode).toBe("listing_only");
    expect(detail.netIncome?.listing).toBeDefined();
    expect(detail.netIncome?.acquisition).toBeDefined();
    expect(detail.netIncome?.acquisition.shareCount).toBe(0);
  });

  it("PL-LISTING-ONLY-3 — 엔진 통합: listing_only 모드 + 취득 4필드 직접 입력 → simple 동일 결과", () => {
    // listing_only로 상장연도 결산서를 직접 80필드 입력하면 simple 모드와 동일 결과
    const fullModeResult = calculateStockTransferTax({
      ...baseInput(),
      postListingDetail: {
        unlistedDetailMode: "listing_only",
        monthlyAccrualToggle: false,
        closing: {
          dates: ["2018-07-01"], closes: [8001], basisDate: "2018-07-01", hasIncrease: false,
        },
        // 상장연도 결산서 합성값이 simple 모드의 61570/5352와 일치하도록 입력
        netIncome: {
          listing: { addA: [7_718_545_543], subB: [], shareCount: 1_253_600, discountRate: 0.10 },
          acquisition: { addA: [], subB: [], shareCount: 0, discountRate: 0.10 },
        },
        netAsset: {
          listing: { assetTotalRow1: 6_709_201_310, assetAdd: [], assetSub: [], liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: 0, shareCount: 1_253_600 },
          acquisition: { assetTotalRow1: 0, assetAdd: [], assetSub: [], liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: 0, shareCount: 0 },
        },
      },
    });
    // synthesizePostListingInput이 listing_only 분기로 상장 측만 덮어쓰기 → 취득연도는 baseInput 그대로(44_520/4_348)
    expect(fullModeResult.acquisitionPrice).toBe(29_120_000);
    expect(fullModeResult.postListingDetail?.detail?.mode).toBe("listing_only");
  });

  it("PL-LISTING-ONLY-4 — listing_only detail에 acquisition undefined echo (Round 4 H-04)", () => {
    const result = calculateStockTransferTax({
      ...baseInput(),
      postListingDetail: {
        unlistedDetailMode: "listing_only",
        monthlyAccrualToggle: false,
        closing: { dates: ["2018-07-01"], closes: [8001], basisDate: "2018-07-01", hasIncrease: false },
        netIncome: {
          listing: { addA: [7_718_545_543], subB: [], shareCount: 1_253_600, discountRate: 0.10 },
          acquisition: { addA: [], subB: [], shareCount: 0, discountRate: 0.10 },
        },
        netAsset: {
          listing: { assetTotalRow1: 6_709_201_310, assetAdd: [], assetSub: [], liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: 0, shareCount: 1_253_600 },
          acquisition: { assetTotalRow1: 0, assetAdd: [], assetSub: [], liabTotalRow8: 0, liabAdd: [], liabSub: [], goodwillRow19: 0, shareCount: 0 },
        },
      },
    });
    expect(result.postListingDetail?.detail?.mode).toBe("listing_only");
    expect(result.postListingDetail?.detail?.netIncome?.acquisition).toBeUndefined();
    expect(result.postListingDetail?.detail?.netAsset?.acquisition).toBeUndefined();
  });
});

// ============================================================
// PL-HEAVY-RE (2건) — 부동산과다 calcPostListingConversion 분기
// ============================================================

describe("PL-HEAVY-RE — isHeavyRealEstateForValuation 가중치 반전 (Case 4)", () => {
  it("PL-HEAVY-RE-1 — 일반(3:2) vs 반전(2:3) 결과 차이", () => {
    // 일반: 100×3/5 + 200×2/5 = 60+80 = 140
    // 반전: 100×2/5 + 200×3/5 = 40+120 = 160
    const normal = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: false,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 200,
    });
    const heavy = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: true,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 100,
      acquisitionYearNetAssetPerShare: 200,
    });
    // 양 연도 동일값이므로 ratio = 1 → 둘 다 finalPerShareValue = 1000
    expect(normal.listingYearPerShareValue).toBe(140);
    expect(heavy.listingYearPerShareValue).toBe(160);
  });

  it("PL-HEAVY-RE-2 — 부동산과다 ratio 변화: 비대칭 입력 시 결과 다름", () => {
    // 상장: 순손익 100, 순자산 200 → 일반 140 / 반전 160
    // 취득: 순손익 200, 순자산 100 → 일반 160 / 반전 140
    const normal = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: false,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 200,
      acquisitionYearNetAssetPerShare: 100,
    });
    const heavy = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: true,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 100,
      listingYearNetAssetPerShare: 200,
      acquisitionYearNetIncomePerShare: 200,
      acquisitionYearNetAssetPerShare: 100,
    });
    // 일반: ratio = 160/140 ≈ 1.143
    // 반전: ratio = 140/160 = 0.875
    expect(normal.conversionRatio).toBeCloseTo(160 / 140, 4);
    expect(heavy.conversionRatio).toBeCloseTo(140 / 160, 4);
    expect(normal.finalPerShareValue).not.toBe(heavy.finalPerShareValue);
  });
});

// ============================================================
// PL-CLOSE-EXTRA (3건) — 종가 휴일·주말 처리 보강
// ============================================================

describe("PL-CLOSE-EXTRA — 종가 1개월 평균 휴일 처리 (H-01)", () => {
  it("PL-CLOSE-EXTRA-1 — 32 슬롯 중 21 거래일만 활성 (사례 EXAMPLE 패턴)", () => {
    // 32 슬롯, 21 비공휴일 거래일
    const closes = Array(32).fill(0);
    for (let i = 0; i < 21; i++) closes[i] = 8000 + i * 10;
    const dates = Array.from({ length: 32 }, (_, i) => `2018-07-${String(i + 1).padStart(2, "0")}`);
    const result = calcMonthlyClosingAverage(dates, closes);
    expect(result.tradingDays).toBe(21);
    // sum = 21항 합 = 8000×21 + (0+1+...+20)×10 = 168000 + 2100 = 170100
    expect(result.sum).toBe(170_100);
    expect(result.avg).toBe(Math.floor(170_100 / 21));
  });

  it("PL-CLOSE-EXTRA-2 — 모든 셀이 0(공휴일)인 경우 avg = 0 + tradingDays = 0", () => {
    const closes = Array(32).fill(0);
    const dates = Array(32).fill("");
    const result = calcMonthlyClosingAverage(dates, closes);
    expect(result.tradingDays).toBe(0);
    expect(result.avg).toBe(0);
  });

  it("PL-CLOSE-EXTRA-3 — 단일 거래일도 평균 산출 (방어 패스)", () => {
    const result = calcMonthlyClosingAverage(["2018-07-01"], [12345]);
    expect(result.tradingDays).toBe(1);
    expect(result.sum).toBe(12_345);
    expect(result.avg).toBe(12_345);
  });
});

// ============================================================
// PL-BUILD-EXTRA (4건) — adapter API body 분기 정확성
// ============================================================

describe("PL-BUILD-EXTRA — adapter 3 분기 정확성", () => {
  it("PL-BUILD-EXTRA-1 — acquiredBeforeListing=false 시 모드 무관 simple body", () => {
    const body = adaptFlatToApiBody(
      {
        unlistedDetailMode: "full",   // 모드 무관
        listingDatePriceAvg1Month: 8001,
      },
      false,
    );
    expect(body.acquiredBeforeListing).toBe(false);
    expect(body.postListingDetail).toBeUndefined();
    expect(body.listingDatePriceAvg1Month).toBe(8_001);
  });

  it("PL-BUILD-EXTRA-2 — full 분기: 80필드 모두 합성", () => {
    const body = adaptFlatToApiBody(
      {
        unlistedDetailMode: "full",
        listingPriceDates: ["2018-07-01"], listingPriceClosing: ["8001"],
        niAddRow1Listing: "1000000000", niShareCountListing: "100000",
        niAddRow1Acq: "500000000", niShareCountAcq: "100000",
        naAssetTotalRow1Listing: "500000000", naLiabTotalRow8Listing: "200000000", naShareCountListing: "100000",
        naAssetTotalRow1Acq: "300000000", naLiabTotalRow8Acq: "100000000", naShareCountAcq: "100000",
      },
      true,
    );
    expect(body.postListingDetail?.unlistedDetailMode).toBe("full");
    expect(body.listingDatePriceAvg1Month).toBe(8_001);
    // 상장 + 취득 모두 합성 (1,000M/100,000/0.10 = 100,000 / 500M/100,000/0.10 = 50,000)
    expect(body.listingYearNetIncomePerShare).toBe(100_000);
    expect(body.acquisitionYearNetIncomePerShare).toBe(50_000);
    // 순자산 (500M-200M)/100,000 = 3,000 / (300M-100M)/100,000 = 2,000
    expect(body.listingYearNetAssetPerShare).toBe(3_000);
    expect(body.acquisitionYearNetAssetPerShare).toBe(2_000);
  });

  it("PL-BUILD-EXTRA-3 — 환원율 0.10 (decimal) 사용자 입력도 정상 처리", () => {
    const body = adaptFlatToApiBody(
      {
        unlistedDetailMode: "full",
        listingPriceDates: ["2018-07-01"], listingPriceClosing: ["8001"],
        niAddRow1Listing: "1000000",
        niShareCountListing: "100",
        niDiscountRateListing: "0.10",   // decimal 직접 입력
        niAddRow1Acq: "500000", niShareCountAcq: "100", niDiscountRateAcq: "0.10",
        naAssetTotalRow1Listing: "100000", naLiabTotalRow8Listing: "0", naShareCountListing: "100",
        naAssetTotalRow1Acq: "50000", naLiabTotalRow8Acq: "0", naShareCountAcq: "100",
      },
      true,
    );
    // 1,000,000 / 100 / 0.10 = 100,000
    expect(body.listingYearNetIncomePerShare).toBe(100_000);
    expect(body.acquisitionYearNetIncomePerShare).toBe(50_000);
  });

  it("PL-BUILD-EXTRA-4 — full 모드 + 빈 nested 입력 시 0 합성 + postListingDetail echo", () => {
    const body = adaptFlatToApiBody(
      { unlistedDetailMode: "full" },
      true,
    );
    expect(body.postListingDetail?.unlistedDetailMode).toBe("full");
    expect(body.listingDatePriceAvg1Month).toBe(0);
    expect(body.listingYearNetIncomePerShare).toBe(0);
  });
});
