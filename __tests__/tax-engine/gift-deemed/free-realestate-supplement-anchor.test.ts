import { describe, it, expect } from "vitest";
import { calcFreeRealEstateGift } from "@/lib/tax-engine/gift-deemed/free-realestate-use";

// §37 보완: 경정청구(§79②1호·시행령§81⑨) + 다기간(시행령§27③⑤후단)
// 단일계산 정수경로: 연이익=floor(부동산가액×2/100), 현가합=Σ floor(연이익×10^n/11^n)

describe("부동산 무상사용 §37 — 경정청구 (G1)", () => {
  // image4: 모 토지 50억, 2020-03-15 무상사용 개시 → 2023-07-20 모 사망
  // 산출세액 55,815,740 × 잔여 20개월(2023-07-20~2025-03-15)/60개월 = 18,605,246
  it("[RECT-1] image4 — free_use 산출세액 55,815,740 · 잔여 20/60 → 18,605,246", () => {
    const r = calcFreeRealEstateGift({
      subType: "free_use",
      propertyValue: 5_000_000_000,
      isRelatedParty: true,
      rectification: {
        giftTaxCalculated: 55_815_740,
        giftDate: "2020-03-15",
        terminationDate: "2023-07-20",
      },
    });
    expect(r.rectification?.remainingMonths).toBe(20);
    expect(r.rectification?.totalMonths).toBe(60);
    expect(r.rectification?.refundableTax).toBe(18_605_246);
    expect(r.rectification?.expiryDate).toBe("2025-03-15");
  });

  it("[RECT-2] 중단일(2025-04-01) ≥ 만료일(2025-03-15) → 잔여 0 · 경정세액 0", () => {
    const r = calcFreeRealEstateGift({
      subType: "free_use",
      propertyValue: 5_000_000_000,
      isRelatedParty: true,
      rectification: { giftTaxCalculated: 55_815_740, giftDate: "2020-03-15", terminationDate: "2025-04-01" },
    });
    expect(r.rectification?.remainingMonths).toBe(0);
    expect(r.rectification?.refundableTax).toBe(0);
  });

  it("[RECT-3] 증여일 2020-01-10 · 중단 2024-06-05 → 만료 2025-01-10 · 잔여 8개월(1개월미만 일수→1)", () => {
    const r = calcFreeRealEstateGift({
      subType: "free_use",
      propertyValue: 5_000_000_000,
      isRelatedParty: true,
      rectification: { giftTaxCalculated: 55_815_740, giftDate: "2020-01-10", terminationDate: "2024-06-05" },
    });
    expect(r.rectification?.remainingMonths).toBe(8);
    expect(r.rectification?.refundableTax).toBe(Math.floor((55_815_740 * 8) / 60));
  });
});

describe("부동산 무상사용 §37① — 다기간 (G2)", () => {
  // 50억 × 2 window(동일 평가액): 각 window 현가합 379,078,675
  // ⚠️ 합산 금지 — deemedGiftValue = 첫 window만(현재 증여)
  it("[FRE-MULTI-1] 50억 2 window → breakdown 각 379,078,675 · deemedGiftValue=첫 window만", () => {
    const r = calcFreeRealEstateGift({
      subType: "free_use",
      isRelatedParty: true,
      periods: [
        { startDate: "2020-03-15", propertyValue: 5_000_000_000 },
        { startDate: "2025-03-16", propertyValue: 5_000_000_000 },
      ],
    });
    expect(r.periodBreakdown?.length).toBe(2);
    expect(r.periodBreakdown?.[0].benefit).toBe(379_078_675);
    expect(r.periodBreakdown?.[1].benefit).toBe(379_078_675);
    expect(r.deemedGiftValue).toBe(379_078_675); // 첫 window만 (합산 758,157,350 아님)
  });

  it("[FRE-MULTI-2] window2 부동산 1.2억 → 현가합 9,097,887 < 1억 → window2 미적용", () => {
    const r = calcFreeRealEstateGift({
      subType: "free_use",
      isRelatedParty: true,
      periods: [
        { startDate: "2020-03-15", propertyValue: 5_000_000_000 },
        { startDate: "2025-03-16", propertyValue: 120_000_000 },
      ],
    });
    expect(r.periodBreakdown?.[0].applied).toBe(true);
    expect(r.periodBreakdown?.[1].benefit).toBe(9_097_887);
    expect(r.periodBreakdown?.[1].applied).toBe(false);
    expect(r.deemedGiftValue).toBe(379_078_675); // 첫 window
  });
});

describe("부동산 무상담보 §37② — 다기간 (G3)", () => {
  // 차입금 10억 무이자 × 2 window(1년 단위): 각 10억×4.6% = 4,600만 (≥1천만 적용)
  it("[COL-MULTI-1] 차입 10억 2 window → 각 46,000,000 적용 · deemedGiftValue=첫 window", () => {
    const r = calcFreeRealEstateGift({
      subType: "collateral",
      isRelatedParty: true,
      periods: [
        { startDate: "2023-01-01", loanAmount: 1_000_000_000, actualInterestPaid: 0 },
        { startDate: "2024-01-02", loanAmount: 1_000_000_000, actualInterestPaid: 0 },
      ],
    });
    expect(r.periodBreakdown?.length).toBe(2);
    expect(r.periodBreakdown?.[0].benefit).toBe(46_000_000);
    expect(r.periodBreakdown?.[1].benefit).toBe(46_000_000);
    expect(r.deemedGiftValue).toBe(46_000_000);
  });
});

describe("부동산 무상담보 §37② — 경정청구 (담보 분모 12월, §81⑤·§27⑤후단)", () => {
  it("[COL-RECT-1] 산출 5천만 / 2023-01-01 담보개시 / 2023-07-01 사망 → 잔여 6/12 → 25,000,000", () => {
    const r = calcFreeRealEstateGift({
      subType: "collateral",
      loanAmount: 500_000_000,
      actualInterestPaid: 0,
      isRelatedParty: true,
      rectification: { giftTaxCalculated: 50_000_000, giftDate: "2023-01-01", terminationDate: "2023-07-01" },
    });
    expect(r.rectification?.totalMonths).toBe(12);
    expect(r.rectification?.expiryDate).toBe("2024-01-01");
    expect(r.rectification?.remainingMonths).toBe(6);
    expect(r.rectification?.refundableTax).toBe(25_000_000);
  });

  it("[COL-RECT-2] 중단일(2024-02-01) ≥ 만료일(2024-01-01) → 잔여 0 · 경정세액 0", () => {
    const r = calcFreeRealEstateGift({
      subType: "collateral",
      loanAmount: 500_000_000,
      actualInterestPaid: 0,
      isRelatedParty: true,
      rectification: { giftTaxCalculated: 50_000_000, giftDate: "2023-01-01", terminationDate: "2024-02-01" },
    });
    expect(r.rectification?.remainingMonths).toBe(0);
    expect(r.rectification?.refundableTax).toBe(0);
  });

  it("[COL-RECT-3] 부분월 2023-06-15 중단 → 잔여 7/12 → 29,166,666 (1개월 미만 일수→1)", () => {
    const r = calcFreeRealEstateGift({
      subType: "collateral",
      loanAmount: 500_000_000,
      actualInterestPaid: 0,
      isRelatedParty: true,
      rectification: { giftTaxCalculated: 50_000_000, giftDate: "2023-01-01", terminationDate: "2023-06-15" },
    });
    expect(r.rectification?.remainingMonths).toBe(7);
    expect(r.rectification?.refundableTax).toBe(29_166_666);
  });
});
