import { describe, it, expect } from "vitest";
import { calcFreeRealEstateGift } from "@/lib/tax-engine/gift-deemed/free-realestate-use";

// 현가합 정수경로: Σ floor(연이익 × 10^n / 11^n), 연이익 = floor(부동산가액 × 2/100)
describe("부동산 무상사용 §37", () => {
  it("[FRE-1] 무상사용 부동산가액 20억 → 연이익 4천만 · 5년 현가합 151,631,469 (≥1억 적용)", () => {
    const r = calcFreeRealEstateGift({ subType: "free_use", propertyValue: 2_000_000_000, isRelatedParty: true });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(151_631_469);
  });

  it("[FRE-2] 무상사용 부동산가액 13억 → 현가합 98,560,453 < 1억 → 미적용", () => {
    const r = calcFreeRealEstateGift({ subType: "free_use", propertyValue: 1_300_000_000, isRelatedParty: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.thresholdEcho?.pvSum).toBe(98_560_453);
  });

  it("[FRE-3] 무상담보 차입 5억 · 무이자 → 5억×4.6% = 2,300만 (≥1천만 적용)", () => {
    const r = calcFreeRealEstateGift({ subType: "collateral", loanAmount: 500_000_000, actualInterestPaid: 0, isRelatedParty: true });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(23_000_000);
  });

  it("[FRE-4] 무상담보 차입 1억 · 무이자 → 460만 < 1천만 → 미적용", () => {
    const r = calcFreeRealEstateGift({ subType: "collateral", loanAmount: 100_000_000, actualInterestPaid: 0, isRelatedParty: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[FRE-5] 비특수관계인 · 정당한 사유 → 미적용 (§37③)", () => {
    const r = calcFreeRealEstateGift({ subType: "free_use", propertyValue: 2_000_000_000, isRelatedParty: false, hasJustifiableReason: true });
    expect(r.applied).toBe(false);
  });
});
