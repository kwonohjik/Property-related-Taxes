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
    filingViolation: "none",
    isFraudulent: false,
    isInternationalTransaction: false,
    realEstateGroupBasicDeductionUsed: 0,
  };
}

// ============================================================
// A-MA — 소칙 §81④ 1호 월할 보정 (PR-2 Pre-Do anchor)
// 설계: docs/02-design/features/stock-transfer-monthly-accrual-81-4.engine.design.md §5
// 공통: listingAvg 8,001 · 직전(취득=상장) NI 50,000/NA 5,000 → 가중평균 32,000
// ============================================================

describe("A-MA — 소칙 §81④ 1호 월할 보정 (§165⑤ 후단 준용)", () => {
  function accrualInput(): StockTransferInput {
    return {
      ...baseInput(),
      acquisitionDate: new Date("2024-03-15"),
      listingDate: new Date("2024-10-20"), // 7개월 + 끝수 5일 → m=8 (1개월 미만 절상)
      listingYearNetIncomePerShare: 50_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetIncomePerShare: 50_000,
      acquisitionYearNetAssetPerShare: 5_000,
      prePriorYearNetIncomePerShare: 40_000, // 전전 가중평균 = 24,000 + 1,600 = 25,600
      prePriorYearNetAssetPerShare: 4_000,
      postListingDetail: { unlistedDetailMode: "simple", monthlyAccrualToggle: true },
    };
  }

  it("A-MA-1: 1호 보정 기본 — adjusted 36,266 · m 8 · final 7,059 · 총 35,295,000", () => {
    const result = calcPostListingConversion(accrualInput());
    expect(result.monthlyAccrualApplied).toBe(true);
    // adjusted = floor((32,000×12 + (32,000−25,600)×8) / 12) = floor(435,200/12) = 36,266
    expect(result.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(25_600);
    expect(result.monthlyAccrualDetail?.holdingMonths).toBe(8);
    expect(result.monthlyAccrualDetail?.adjustedListingYearPerShareValue).toBe(36_266);
    // final = floor(8,001 × 32,000 / 36,266) = 7,059
    expect(result.finalPerShareValue).toBe(7_059);
    expect(result.totalAcquisitionPrice).toBe(35_295_000);
  });

  it("A-MA-2(=C-2): 평가 동일 + 토글 OFF → 2호 보정 없음 (PL-MONTHLY-1로 갈음 — 중복 회피)", () => {
    // 2호 동작은 PL-MONTHLY-1에서 검증. 여기서는 accrualInput에서 토글만 끄면 final이 8,001로 복귀함을 확인.
    const result = calcPostListingConversion({
      ...accrualInput(),
      postListingDetail: { unlistedDetailMode: "simple", monthlyAccrualToggle: false },
    });
    expect(result.monthlyAccrualApplied).toBe(false);
    expect(result.finalPerShareValue).toBe(8_001); // ratio 1
  });

  it("A-MA-3: 1개월 미만 절상 — 취득 06-01 → 상장 06-20 → m=1 · adjusted 32,533 · final 7,869", () => {
    const result = calcPostListingConversion({
      ...accrualInput(),
      acquisitionDate: new Date("2024-06-01"),
      listingDate: new Date("2024-06-20"), // 0개월 + 끝수 19일 → m=1
    });
    expect(result.monthlyAccrualApplied).toBe(true);
    expect(result.monthlyAccrualDetail?.holdingMonths).toBe(1);
    // adjusted = floor((32,000×12 + 6,400×1) / 12) = floor(390,400/12) = 32,533
    expect(result.monthlyAccrualDetail?.adjustedListingYearPerShareValue).toBe(32_533);
    // final = floor(8,001 × 32,000 / 32,533) = 7,869
    expect(result.finalPerShareValue).toBe(7_869);
  });

  it("A-MA-4: C-5 하락(전전>직전) — adjusted 26,666 · final 9,601 (>8,001, 법문 그대로)", () => {
    const result = calcPostListingConversion({
      ...accrualInput(),
      prePriorYearNetIncomePerShare: 62_500, // 전전 가중평균 = 37,500 + 2,500 = 40,000 (> 직전 32,000)
      prePriorYearNetAssetPerShare: 6_250,
    });
    expect(result.monthlyAccrualApplied).toBe(true);
    expect(result.monthlyAccrualDetail?.prePriorYearPerShareValue).toBe(40_000);
    // adjusted = floor((32,000×12 + (32,000−40,000)×8) / 12) = floor(320,000/12) = 26,666
    expect(result.monthlyAccrualDetail?.adjustedListingYearPerShareValue).toBe(26_666);
    // final = floor(8,001 × 32,000 / 26,666) = 9,601
    expect(result.finalPerShareValue).toBe(9_601);
  });

  it("A-MA-5: C-6 보정 평가액 ≤ 0 → 환산 불가 (applied=false, final 0)", () => {
    const result = calcPostListingConversion({
      ...accrualInput(),
      // 전전 극단 상승 → (직전−전전) 큰 음수 → adjusted ≤ 0
      // 직전 32,000, m=8, d=12 → adjusted = floor((384,000 + (32,000−prePrior)×8)/12)
      // adjusted ≤ 0 위해 prePrior ≥ 32,000 + 384,000/8 = 80,000 → NI 125,000(가중 75,000)+NA... 80,000 만들기
      prePriorYearNetIncomePerShare: 133_333, // 가중 ≈ 80,000 (79,999.8 floor 79,999) — 경계 위로
      prePriorYearNetAssetPerShare: 5_000,
    });
    // prePrior = floor(133,333×3/5 + 5,000×2/5) = floor(79,999.8 + 2,000) = 81,999
    // adjusted = floor((384,000 + (32,000−81,999)×8)/12) = floor((384,000−399,992)/12) = floor(−1332.6) = −1333 ≤ 0
    expect(result.monthlyAccrualApplied).toBe(false);
    expect(result.finalPerShareValue).toBe(0);
    expect(result.warnings.some((w) => w.includes("0 이하"))).toBe(true);
  });

  it("A-MA-6: C-7 평가 상이 + 토글 ON → 본칙 환산 불변 + warning", () => {
    const result = calcPostListingConversion({
      ...accrualInput(),
      acquisitionYearNetIncomePerShare: 44_520, // 평가액을 상장연도와 다르게
      acquisitionYearNetAssetPerShare: 4_348,
    });
    expect(result.monthlyAccrualApplied).toBe(false);
    // 본칙: acq 가중 = floor(44,520×3/5 + 4,348×2/5) = floor(26,712 + 1,739.2) = 28,451
    //       listing 가중 = 32,000 → final = floor(8,001 × 28,451 / 32,000) = 7,113
    expect(result.finalPerShareValue).toBe(7_113);
    expect(result.warnings.some((w) => w.includes("달라") && w.includes("§81④"))).toBe(true);
  });

  it("A-MA-7: C-4 토글 ON + 전전 미입력 → 보정 미적용 + warning (applied=false)", () => {
    const result = calcPostListingConversion({
      ...accrualInput(),
      prePriorYearNetIncomePerShare: undefined,
      prePriorYearNetAssetPerShare: undefined,
    });
    expect(result.monthlyAccrualApplied).toBe(false);
    expect(result.finalPerShareValue).toBe(8_001); // 보정 미적용 → ratio 1
    expect(result.warnings.some((w) => w.includes("입력되지 않아"))).toBe(true);
  });
});

// ============================================================
// PL-MONTHLY (3건) — §81④ 월할 가산 발동
// ============================================================

describe("PL-MONTHLY — 시행규칙 §81④ 2호 (토글 OFF — 보정 없음)", () => {
  // PR-2 재산정 (의미 재정의): monthlyAccrualApplied = "1호 보정 발동"(토글 필요).
  // 토글 미설정 → §81④ 2호 → applied=false, 단 2호 안내 warning("§81④") 포함.
  it("PL-MONTHLY-1 — 평가액 동일 + 토글 OFF → 2호 적용(applied=false), ratio 1·final 8,001 유지", () => {
    const result = calcPostListingConversion({
      ...baseInput(),
      listingYearNetIncomePerShare: 50_000,
      listingYearNetAssetPerShare: 5_000,
      acquisitionYearNetIncomePerShare: 50_000,
      acquisitionYearNetAssetPerShare: 5_000,
    });
    expect(result.monthlyAccrualApplied).toBe(false); // 토글 OFF → 1호 보정 미발동
    // 2호: 상장일 평가액 그대로 → ratio = 1 → finalPerShareValue = listingAvg
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

  it("PL-MONTHLY-3 — 평가액 동일 + 토글 OFF → 2호 안내 warning(§81④) 포함", () => {
    const result = calcPostListingConversion({
      ...baseInput(),
      listingYearNetIncomePerShare: 10_000,
      listingYearNetAssetPerShare: 10_000,
      acquisitionYearNetIncomePerShare: 10_000,
      acquisitionYearNetAssetPerShare: 10_000,
    });
    expect(result.monthlyAccrualApplied).toBe(false); // 토글 OFF
    const hasMonthlyHint = result.warnings.some((w) => w.includes("§81④") || w.includes("월할"));
    expect(hasMonthlyHint).toBe(true); // 2호 안내 메시지에 "§81④" 포함
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
    // §163⑨ 환산 적용: 44,750,000 × 5,824 / 8,659 = 30,098,625
    expect(fullModeResult.acquisitionPrice).toBe(30_098_625);
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
    // 🔴 2026-08-10 정정 — 이 픽스처는 **하한 발동 케이스**였다.
    //    순자산가치 200 × 80% = 160인데 일반 가중평균은 140이라 §165④1 **단서**가 걸린다
    //    (「그 가중평균한 가액이 … 100분의 80을 곱한 금액보다 적은 경우에는 … 평가액으로 한다」).
    //    종전 구현이 분자·분모에서 단서를 빼고 있어 140이 나왔던 것이고, **160이 맞다**.
    //    ⇒ 하한이 걸리면 일반(3:2)과 반전(2:3)이 **같은 값으로 수렴한다** — 하한은 가중치와 무관하다.
    expect(normal.listingYearPerShareValue).toBe(160); // 가중평균 140 → 하한 160
    expect(heavy.listingYearPerShareValue).toBe(160);  // 가중평균 160 (하한과 동값, 미발동)
    expect(normal.detail?.floor80Applied.listing).toBe(true);
    expect(heavy.detail?.floor80Applied.listing).toBe(false);
  });

  it("PL-HEAVY-RE-1b — 하한이 걸리지 않는 입력에서는 반전이 그대로 드러난다", () => {
    // ⚠️ RE-1이 하한 때문에 수렴하므로, **가중치 반전 자체**를 지키는 대조군이 따로 필요하다.
    //    순손익 300 / 순자산 100 → 하한은 80이라 어느 가중치로도 발동하지 않는다.
    const normal = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: false,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 300,
      listingYearNetAssetPerShare: 100,
      acquisitionYearNetIncomePerShare: 300,
      acquisitionYearNetAssetPerShare: 100,
    });
    const heavy = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: true,
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 300,
      listingYearNetAssetPerShare: 100,
      acquisitionYearNetIncomePerShare: 300,
      acquisitionYearNetAssetPerShare: 100,
    });
    expect(normal.listingYearPerShareValue).toBe(220); // 300×3/5 + 100×2/5
    expect(heavy.listingYearPerShareValue).toBe(180);  // 300×2/5 + 100×3/5
    expect(normal.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
    expect(heavy.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
  });

  it("PL-HEAVY-RE-2 — 부동산과다 ratio 변화: 비대칭 입력 시 결과 다름", () => {
    // 🔴 2026-08-10 정정 — 종전 픽스처(상장 순손익 100/순자산 200)는 **하한 발동 케이스**라
    //    일반 쪽 분모가 140이 아니라 160으로 올라가 두 비율이 1.0으로 수렴했다.
    //    이 테스트의 목적은 「가중치 반전이 비율을 바꾼다」이므로 **하한이 걸리지 않는 입력**으로 옮긴다.
    //    (하한 발동 자체의 검증은 `post-listing-165-5-floor80.anchor.test.ts` PLF-1~PLF-6이 담당.)
    //
    // 상장: 순손익 200, 순자산 100 → 일반 160 / 반전 140  (하한 80 — 미발동)
    // 취득: 순손익 300, 순자산 100 → 일반 220 / 반전 180  (하한 80 — 미발동)
    const asym = {
      listingDatePriceAvg1Month: 1_000,
      listingYearNetIncomePerShare: 200,
      listingYearNetAssetPerShare: 100,
      acquisitionYearNetIncomePerShare: 300,
      acquisitionYearNetAssetPerShare: 100,
    };
    const normal = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: false,
      ...asym,
    });
    const heavy = calcPostListingConversion({
      ...baseInput(),
      isHeavyRealEstateForValuation: true,
      ...asym,
    });
    // 일반: ratio = 220/160 = 1.375
    // 반전: ratio = 180/140 ≈ 1.2857
    expect(normal.conversionRatio).toBeCloseTo(220 / 160, 4);
    expect(heavy.conversionRatio).toBeCloseTo(180 / 140, 4);
    expect(normal.finalPerShareValue).not.toBe(heavy.finalPerShareValue);
    // 하한이 이 픽스처를 건드리지 않았음을 명시 — 걸리면 위 비율이 수렴해 검증이 무의미해진다.
    expect(normal.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
    expect(heavy.detail?.floor80Applied).toEqual({ listing: false, acquisition: false });
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
