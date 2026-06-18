import { describe, it, expect } from "vitest";
import { calcFreeLoanGift } from "@/lib/tax-engine/gift-deemed/free-loan";
import { resolveFreeLoanRate } from "@/lib/tax-engine/data/gift-deemed-rates";

const RATE_4_6 = { numer: 46, denom: 1000 };

describe("금전 무상대출 §41의4", () => {
  it("[LOAN-1] 무상 3억 → 3억×4.6% = 1,380만 (≥1천만 적용)", () => {
    const r = calcFreeLoanGift({ loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: RATE_4_6, isRelatedParty: true });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(13_800_000);
  });

  it("[LOAN-2] 저리 5억 · 이자 500만 → 2,300만 − 500만 = 1,800만", () => {
    const r = calcFreeLoanGift({ loanAmount: 500_000_000, actualInterestPaid: 5_000_000, appropriateRate: RATE_4_6, isRelatedParty: true });
    expect(r.deemedGiftValue).toBe(18_000_000);
  });

  it("[LOAN-3] 무상 2억 → 920만 < 1천만 → 미적용", () => {
    const r = calcFreeLoanGift({ loanAmount: 200_000_000, actualInterestPaid: 0, appropriateRate: RATE_4_6, isRelatedParty: true });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[RATE] 적정이자율 룩업 — 2020년 = 4.6%, 2015년 = 8.5%", () => {
    expect(resolveFreeLoanRate("2020-01-01")).toEqual({ numer: 46, denom: 1000 });
    expect(resolveFreeLoanRate("2015-06-01")).toEqual({ numer: 85, denom: 1000 });
  });
});
