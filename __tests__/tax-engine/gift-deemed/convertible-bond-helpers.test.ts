/** §40 자동계산 헬퍼 단위 — 이자손실분(§10의2)·초과분 비율(②⑤)·적정이자율 시대표 */
import { describe, it, expect } from "vitest";
import {
  bondInterestLoss,
  computeExcessRatio,
  applyExcessRatio,
} from "@/lib/tax-engine/gift-deemed/convertible-bond-helpers";

describe("bondInterestLoss (§10의2) — 현가계수 input 정확 재현", () => {
  it("사례3: 10억·3%·n=4·적정8%(0.73502/3.31212) → 165,616,400", () => {
    const loss = bondInterestLoss({
      maturityAmount: 1_000_000_000,
      annualCoupon: 30_000_000,
      pvFactorAppropriate: 73_502, // 0.73502
      annuityFactorAppropriate: 331_212, // 3.31212
    });
    expect(loss).toBe(165_616_400);
  });

  it("사례4: 50억·3%·n=5·적정8%(0.68058/3.99271) full → 998,193,500", () => {
    const loss = bondInterestLoss({
      maturityAmount: 5_000_000_000,
      annualCoupon: 150_000_000,
      pvFactorAppropriate: 68_058, // 0.68058
      annuityFactorAppropriate: 399_271, // 3.99271
    });
    expect(loss).toBe(998_193_500);
  });
});

describe("computeExcessRatio / applyExcessRatio (②⑤ 균등초과)", () => {
  it("사례2·4: 총 1,000,000 · 본인 30% · 전량 1,000,000 인수 → 초과분 700,000(70%)", () => {
    const ratio = computeExcessRatio({
      subscribedShares: 1_000_000,
      totalSubscribableShares: 1_000_000,
      ownPreRatio: { numer: 30, denom: 100 },
    });
    expect(ratio).toEqual({ numer: 700_000, denom: 1_000_000 });
  });

  it("사례4: 이자손실분 full 998,193,500 × 70% → 698,735,450", () => {
    const ratio = computeExcessRatio({
      subscribedShares: 1_000_000,
      totalSubscribableShares: 1_000_000,
      ownPreRatio: { numer: 30, denom: 100 },
    });
    expect(applyExcessRatio(998_193_500, ratio)).toBe(698_735_450);
  });
});
