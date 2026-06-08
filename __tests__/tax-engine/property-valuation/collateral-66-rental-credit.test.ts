import { describe, it, expect } from "vitest";
import { evaluateLand, convertLeaseToValue } from "@/lib/tax-engine/property-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * §66 저당권 설정 재산 평가 특례 — ㉱ 임대료환산가액 + ㉲ 신용보증 차감 anchor.
 * 설계: docs/02-design/features/inheritance-collateral-66-rental-credit-guarantee.{plan,engine.design}.md
 * 법령: §61⑤·시행령 §50⑦·시행규칙 §15의2(율12%) / 시행령 §63②(신용보증 차감).
 */

const land = (p: Partial<EstateItem>): EstateItem => ({
  id: "c1",
  name: "테스트 토지",
  category: "real_estate_land",
  ...p,
});

describe("§66 임대료환산(㉱) + 신용보증 차감(㉲)", () => {
  it("[CR-C1] 보충 1억 + 월세 100만 + 보증금 5천만 → 임대료환산 1.5억", () => {
    // 월세 100만×12=1,200만 ÷0.12 = 1억 + 보증금 5천만 = 1.5억
    const r = evaluateLand(land({ standardPrice: 100_000_000, monthlyRent: 1_000_000, leaseDeposit: 50_000_000 }));
    expect(r.valuatedAmount).toBe(150_000_000);
  });

  it("[CR-C2] 시가 2억 + 월세 100만 → 임대료환산 미적용(보충평가 아님), 2억", () => {
    const r = evaluateLand(land({ marketValue: 200_000_000, monthlyRent: 1_000_000, leaseDeposit: 50_000_000 }));
    expect(r.valuatedAmount).toBe(200_000_000);
    expect(r.method).toBe("market_value");
  });

  it("[CR-C3] 보충 3억 + 저당 2억 + 신용보증 1.2억 → mortgageNet 8천만, 3억", () => {
    const r = evaluateLand(land({ standardPrice: 300_000_000, mortgageAmount: 200_000_000, creditGuaranteeAmount: 120_000_000 }));
    expect(r.valuatedAmount).toBe(300_000_000);
  });

  it("[CR-C4] 보충 1억 + 저당 2억 + 신용보증 1.2억 → mortgageNet 8천만, max(1억,8천만)=1억", () => {
    const r = evaluateLand(land({ standardPrice: 100_000_000, mortgageAmount: 200_000_000, creditGuaranteeAmount: 120_000_000 }));
    expect(r.valuatedAmount).toBe(100_000_000);
  });

  it("[CR-C5] 신용보증 1.5억 > 저당 1억 → mortgageNet 음수 가드 0, 1억", () => {
    const r = evaluateLand(land({ standardPrice: 100_000_000, mortgageAmount: 100_000_000, creditGuaranteeAmount: 150_000_000 }));
    expect(r.valuatedAmount).toBe(100_000_000);
  });

  it("[CR-C6] 전부 — 임대료환산 1.5억 vs 담보채권액 1.3억 → 1.5억", () => {
    // 임대료환산 1.5억, mortgageNet=2억−1.2억=8천만, securedClaim=8천만+보증금5천만=1.3억, max=1.5억
    const r = evaluateLand(land({
      standardPrice: 100_000_000,
      monthlyRent: 1_000_000,
      leaseDeposit: 50_000_000,
      mortgageAmount: 200_000_000,
      creditGuaranteeAmount: 120_000_000,
    }));
    expect(r.valuatedAmount).toBe(150_000_000);
  });

  it("[CR-C7] 신규 필드 미입력 → 기존 §66 동작 불변 max(평가, 저당+임대보증금)", () => {
    const r = evaluateLand(land({ standardPrice: 100_000_000, mortgageAmount: 200_000_000 }));
    expect(r.valuatedAmount).toBe(200_000_000);
  });

  it("[CR-C8] 시가 2억 + 저당 2억 + 신용보증 1.2억 → securedClaim 8천만 < 시가, 2억", () => {
    const r = evaluateLand(land({ marketValue: 200_000_000, mortgageAmount: 200_000_000, creditGuaranteeAmount: 120_000_000 }));
    expect(r.valuatedAmount).toBe(200_000_000);
  });

  it("[CR-T8-PRESERVE] convertLeaseToValue(자본환원 별도 함수) 불변 — 1억÷0.12=8.33억", () => {
    expect(convertLeaseToValue(100_000_000)).toBe(Math.floor(100_000_000 / 0.12));
  });
});
