import { describe, it, expect } from "vitest";
import { calcInsuranceGift } from "@/lib/tax-engine/gift-deemed/insurance";

describe("보험금의 증여 §34", () => {
  it("[INS-1] §34①1호 수령인≠납부자 — 보험금1억×(타인600만/총1천만) = 6,000만", () => {
    const r = calcInsuranceGift({
      caseType: "non_payer",
      insuranceProceeds: 100_000_000,
      totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000,
      isInheritanceInsurance: false,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(60_000_000);
  });

  it("[INS-2] §34①2호 증여재산 납부 — 6,000만 − 600만 = 5,400만", () => {
    const r = calcInsuranceGift({
      caseType: "gifted_premium",
      insuranceProceeds: 100_000_000,
      totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000,
      isInheritanceInsurance: false,
    });
    expect(r.deemedGiftValue).toBe(54_000_000);
  });

  it("[INS-3] §34② §8 상속재산 → 미적용", () => {
    const r = calcInsuranceGift({
      caseType: "non_payer",
      insuranceProceeds: 100_000_000,
      totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000,
      isInheritanceInsurance: true,
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
