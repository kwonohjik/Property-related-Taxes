import { describe, it, expect } from "vitest";
import { calcDebtForgivenessGift } from "@/lib/tax-engine/gift-deemed/debt-forgiveness";

describe("채무면제 등 §36", () => {
  it("[DEBT-1] 면제 1억 · 보상 0 → 1억", () => {
    const r = calcDebtForgivenessGift({ forgivenDebt: 100_000_000, compensation: 0, occurType: "creditor_waiver" });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(100_000_000);
  });

  it("[DEBT-2] 면제 1억 · 보상 3천만 → 7천만", () => {
    const r = calcDebtForgivenessGift({ forgivenDebt: 100_000_000, compensation: 30_000_000, occurType: "third_party_assumption" });
    expect(r.deemedGiftValue).toBe(70_000_000);
  });

  it("[DEBT-3] 보상 ≥ 면제 → 0 (미적용)", () => {
    const r = calcDebtForgivenessGift({ forgivenDebt: 50_000_000, compensation: 50_000_000, occurType: "creditor_waiver" });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
