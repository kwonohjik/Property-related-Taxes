import { describe, it, expect } from "vitest";
import { calcDeemedGift } from "@/lib/tax-engine/gift-deemed/router";

describe("증여로 보는 경우 router dispatch", () => {
  it("insurance → §34", () => {
    const r = calcDeemedGift({ type: "insurance", caseType: "non_payer", insuranceProceeds: 100_000_000, totalPremiumPaid: 10_000_000, relevantPremium: 6_000_000, isInheritanceInsurance: false });
    expect(r.type).toBe("insurance");
    expect(r.deemedGiftValue).toBe(60_000_000);
  });

  it("bargain_transfer → §35 (특수·저가 1억)", () => {
    const r = calcDeemedGift({ type: "bargain_transfer", transactionPrice: 600_000_000, marketValue: 1_000_000_000, isRelatedParty: true, transactionType: "purchase" });
    expect(r.type).toBe("bargain_transfer");
    expect(r.deemedGiftValue).toBe(100_000_000);
  });

  it("debt_forgiveness → §36", () => {
    const r = calcDeemedGift({ type: "debt_forgiveness", forgivenDebt: 100_000_000, compensation: 30_000_000, occurType: "creditor_waiver" });
    expect(r.deemedGiftValue).toBe(70_000_000);
  });

  it("free_realestate → §37 무상담보", () => {
    const r = calcDeemedGift({ type: "free_realestate", subType: "collateral", loanAmount: 500_000_000, actualInterestPaid: 0, isRelatedParty: true });
    expect(r.deemedGiftValue).toBe(23_000_000);
  });

  it("free_loan → §41의4", () => {
    const r = calcDeemedGift({ type: "free_loan", loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: { numer: 46, denom: 1000 }, isRelatedParty: true });
    expect(r.deemedGiftValue).toBe(13_800_000);
  });
});
