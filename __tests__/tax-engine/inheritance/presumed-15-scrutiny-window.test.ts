import { describe, it, expect } from "vitest";
import { evaluatePresumedItem } from "@/lib/tax-engine/presumed-inheritance";
import type { PresumedInheritanceItem } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 추정상속재산 §15 소명대상 범위 (리뷰 확정 #1 회귀).
 *
 * §15①1호는 (1년 이내 처분 ≥ 2억) 과 (2년 이내 처분 ≥ 5억) 을 각각 독립 발동사유로 규정하고,
 * 시행령 §11①1호는 처분금액을 "1년 또는 2년 이내에 실제 수입한 금액"으로 정의한다.
 * → 1년 임계만 발동(1년≥2억, 2년 총액<5억) 시 소명대상은 '1년 이내 처분액'이어야 하고,
 *   1~2년 증분(amountWithin2Y)은 2년 5억 임계가 발동해야만 산입된다.
 * 버그: scrutinyAmount = total(1년+2년) 무조건 → 1년 임계만 발동한 케이스에서 과다과세.
 */
const base = (p: Partial<PresumedInheritanceItem>): PresumedInheritanceItem => ({
  id: "p-1",
  category: "real_estate",
  amountWithin1Y: 0,
  amountWithin2Y: 0,
  verifiedUseAmount: 0,
  ...p,
});

describe("추정상속재산 §15 소명대상 발동창 (리뷰 #1)", () => {
  it("[P15-1Y-ONLY] 1년만 발동(1년 3억≥2억, 2년총 4억<5억) → 소명대상=1년분 3억", () => {
    const r = evaluatePresumedItem(
      base({ amountWithin1Y: 300_000_000, amountWithin2Y: 100_000_000 }),
    );
    expect(r.thresholdTriggered).toBe(true);
    // 소명대상은 1년분만 (1~2년 증분 1억 제외)
    expect(r.scrutinyAmount).toBe(300_000_000);
    // 기준차감 = min(3억×20%, 2억) = 6천만
    expect(r.baseDeduction).toBe(60_000_000);
    // 가산액 = 3억 − 6천만 = 2.4억  (버그 시 3.2억)
    expect(r.addedAmount).toBe(240_000_000);
  });

  it("[P15-2Y-TRIG] 2년 발동(1년 1억<2억, 2년총 5.5억≥5억) → 소명대상=2년 전액 (회귀 방지)", () => {
    const r = evaluatePresumedItem(
      base({ amountWithin1Y: 100_000_000, amountWithin2Y: 450_000_000 }),
    );
    expect(r.thresholdTriggered).toBe(true);
    expect(r.scrutinyAmount).toBe(550_000_000);
    expect(r.baseDeduction).toBe(110_000_000);
    expect(r.addedAmount).toBe(440_000_000);
  });

  it("[P15-BOTH] 1년·2년 동시 발동(1년 3억, 2년총 7억) → 소명대상=2년 전액 7억", () => {
    const r = evaluatePresumedItem(
      base({ amountWithin1Y: 300_000_000, amountWithin2Y: 400_000_000 }),
    );
    expect(r.scrutinyAmount).toBe(700_000_000);
    // 기준차감 = min(7억×20%=1.4억, 2억) = 1.4억
    expect(r.baseDeduction).toBe(140_000_000);
    expect(r.addedAmount).toBe(560_000_000);
  });

  it("[P15-NONE] 미발동(1년 1억<2억, 2년총 3억<5억) → 가산액 0", () => {
    const r = evaluatePresumedItem(
      base({ amountWithin1Y: 100_000_000, amountWithin2Y: 200_000_000 }),
    );
    expect(r.thresholdTriggered).toBe(false);
    expect(r.addedAmount).toBe(0);
  });
});
