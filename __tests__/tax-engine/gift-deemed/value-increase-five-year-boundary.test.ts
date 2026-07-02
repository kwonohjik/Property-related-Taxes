import { describe, it, expect } from "vitest";
import { calcValueIncreaseGift } from "@/lib/tax-engine/gift-deemed/value-increase";

/**
 * §42의3 "5년 이내" 요건 echo 일수 기준 (리뷰 확정 #11 회귀).
 *
 * withinFiveYears가 differenceInYears(절사)로 5년10개월을 '5년 이내'로 오표시하던 것을
 * 일수 기준(eventDate ≤ acquisitionDate + 5년)으로 정정. 순수 echo(세액 불변).
 */
describe("§42의3 5년 이내 echo 일수 기준 (리뷰 #11)", () => {
  const baseInput = {
    currentValue: 2_000_000_000,
    acquisitionCost: 100_000_000,
    normalIncrease: 0,
    contribution: 0,
  };

  it("[VI-5Y-OVER] 취득 2020-01-01·사유 2025-11-01 (5년10개월) → withinFiveYears=false (버그 시 true)", () => {
    const r = calcValueIncreaseGift({
      ...baseInput,
      acquisitionDate: "2020-01-01",
      eventDate: "2025-11-01",
    });
    expect(r.valueIncreaseDetail?.withinFiveYears).toBe(false);
    // 세액(deemedGiftValue)은 echo와 무관하게 불변
    expect(r.applied).toBe(true);
  });

  it("[VI-5Y-EXACT] 취득 2020-01-01·사유 2025-01-01 (정확히 5년) → withinFiveYears=true (경계 포함)", () => {
    const r = calcValueIncreaseGift({
      ...baseInput,
      acquisitionDate: "2020-01-01",
      eventDate: "2025-01-01",
    });
    expect(r.valueIncreaseDetail?.withinFiveYears).toBe(true);
  });
});
