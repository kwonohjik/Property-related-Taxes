import { describe, it, expect } from "vitest";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";

// ③ 전환주식 §39①3호 (시행령 §29②6) — 전환후 §29②1~5 이익 − 발행당시 §29②1~5 이익, 음수면 0
describe("§39①3호 전환주식 — 전환후 − 발행당시 (§29②6)", () => {
  it("[CS-1] 전환후 33,330,000 − 발행당시 20,000,000 = 13,330,000", () => {
    const r = calcConvertibleStockGift({
      // 전환 후: 증자후 8333 − 인수 5000 = 3333 × 1만 = 33,330,000
      atConversion: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 5_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
      // 발행 당시: 증자후 9000 − 인수 7000 = 2000 × 1만 = 20,000,000
      atIssuance: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 7_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[CS-2] 전환후 20,000,000 − 발행당시 33,330,000 = 음수 → 0 (미적용)", () => {
    const r = calcConvertibleStockGift({
      atConversion: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 7_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
      atIssuance: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 5_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
