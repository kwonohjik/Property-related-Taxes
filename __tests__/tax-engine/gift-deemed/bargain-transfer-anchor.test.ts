import { describe, it, expect } from "vitest";
import { detectBargainTransfer } from "@/lib/tax-engine/bargain-transfer";

// 본칙 §35①·시행령 §26②③④ 정합 anchor (Pre-Do: 기존 버그 실증 → 정정 후 통과)
//  특수 §35①: 증여재산가액 = 차액 − MIN(시가30%, 3억)
//  비특수 §35②: 적용요건 차액 ≥ 시가30% → 증여재산가액 = 차액 − 3억(고정)
describe("§35 저가양수·고가양도 — 본칙 정합 (gift-deemed)", () => {
  it("[BARG-1] 특수·저가·시가10억·대가6억 → 4억 − MIN(3억,3억) = 1억", () => {
    const r = detectBargainTransfer({
      transactionPrice: 600_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: true,
      transactionType: "purchase",
    });
    expect(r.isSubjectToGiftTax).toBe(true);
    expect(r.deemedGiftAmount).toBe(100_000_000);
  });

  it("[BARG-시가7억] 특수·저가·시가7억·대가3억 → 4억 − MIN(2.1억,3억) = 1.9억", () => {
    const r = detectBargainTransfer({
      transactionPrice: 300_000_000,
      marketValue: 700_000_000,
      isRelatedParty: true,
      transactionType: "purchase",
    });
    expect(r.deemedGiftAmount).toBe(190_000_000);
  });

  it("[BARG-3] 특수·임계미달 시가10억·대가8억 차액2억 < 3억 → 미적용", () => {
    const r = detectBargainTransfer({
      transactionPrice: 800_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: true,
      transactionType: "purchase",
    });
    expect(r.isSubjectToGiftTax).toBe(false);
  });

  it("[BARG-4] 비특수·저가·시가10억·대가5억 → 5억 − 3억 = 2억", () => {
    const r = detectBargainTransfer({
      transactionPrice: 500_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: false,
      transactionType: "purchase",
    });
    expect(r.deemedGiftAmount).toBe(200_000_000);
  });

  it("[BARG-2] 비특수·고가·시가10억·대가14억 → 4억 − 3억 = 1억", () => {
    const r = detectBargainTransfer({
      transactionPrice: 1_400_000_000,
      marketValue: 1_000_000_000,
      isRelatedParty: false,
      transactionType: "sale",
    });
    expect(r.deemedGiftAmount).toBe(100_000_000);
  });
});
