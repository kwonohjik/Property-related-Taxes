import { describe, it, expect } from "vitest";
import { deemedGiftInputSchema } from "@/lib/validators/gift-deemed-input";

describe("deemedGiftInputSchema", () => {
  it("valid insurance 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "insurance", caseType: "non_payer",
      insuranceProceeds: 100_000_000, totalPremiumPaid: 10_000_000,
      relevantPremium: 6_000_000, isInheritanceInsurance: false,
    });
    expect(r.success).toBe(true);
  });

  it("관련보험료 > 총보험료 → 차단 (§34①)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "insurance", caseType: "non_payer",
      insuranceProceeds: 100_000_000, totalPremiumPaid: 5_000_000,
      relevantPremium: 6_000_000, isInheritanceInsurance: false,
    });
    expect(r.success).toBe(false);
  });

  it("free_use인데 부동산가액 없음 → 차단 (§37①)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_realestate", subType: "free_use", isRelatedParty: true,
    });
    expect(r.success).toBe(false);
  });

  it("collateral 차입금 입력 시 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_realestate", subType: "collateral",
      loanAmount: 500_000_000, actualInterestPaid: 0, isRelatedParty: true,
    });
    expect(r.success).toBe(true);
  });

  it("valid free_loan(분수 이자율) 통과", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "free_loan", loanAmount: 300_000_000, actualInterestPaid: 0,
      appropriateRate: { numer: 46, denom: 1000 }, isRelatedParty: true,
    });
    expect(r.success).toBe(true);
  });

  it("알 수 없는 type → 차단", () => {
    const r = deemedGiftInputSchema.safeParse({ type: "unknown_kind", foo: 1 });
    expect(r.success).toBe(false);
  });

  it("시가 0 → 차단 (bargain_transfer)", () => {
    const r = deemedGiftInputSchema.safeParse({
      type: "bargain_transfer", transactionPrice: 0, marketValue: 0,
      isRelatedParty: true, transactionType: "purchase",
    });
    expect(r.success).toBe(false);
  });
});
