import { describe, it, expect } from "vitest";
import { computeExcessDividendAmount } from "@/lib/tax-engine/gift-deemed/excess-dividend";
import type { ShareholderDividend } from "@/lib/tax-engine/gift-deemed/types";

/**
 * §41의2 초과배당 특수관계인 비례배당 정수연산 (리뷰 확정 #10 회귀).
 *
 * 버그: relatedNumer = Σ numer×(100/denom) 부동소수 백분율 후 floor(total×relatedNumer/100).
 *   denom=10000(실제 API 관행)에서 100/10000=0.01 이진 비정확값 → 1원 오차.
 * 정정: Σ floor(total × numer/denom) 정수 분수 경로 (개별주주 과소배당 경로와 일치).
 */
describe("§41의2 초과배당 비례배당 정수연산 (리뷰 #10)", () => {
  it("[XDIV-INT] total 352,994,000 · 특수관계인 205/10000 → 비례배당 7,236,377 (float 7,236,376)", () => {
    const shareholders: ShareholderDividend[] = [
      // 특수관계인 2.05% (numer=205, denom=10000) — 실제 API가 생성하는 분모
      {
        id: "rp",
        role: "related_party",
        ownershipRatio: { numer: 205, denom: 10000 },
        actualDividend: 100_000_000,
      },
      // 최대주주 — 나머지 배당(총 352,994,000 맞춤)
      {
        id: "major",
        role: "major_shareholder",
        ownershipRatio: { numer: 9795, denom: 10000 },
        actualDividend: 252_994_000,
      },
    ];
    const r = computeExcessDividendAmount(shareholders);
    expect(r.totalDividend).toBe(352_994_000);
    // floor(352,994,000 × 205 / 10000) = 7,236,377 (정수), float 경로는 7,236,376
    expect(r.proportionalDividend).toBe(7_236_377);
  });
});
