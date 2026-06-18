import { describe, it, expect } from "vitest";
import { calcMergerGift } from "@/lib/tax-engine/gift-deemed/merger";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalDecreaseGift } from "@/lib/tax-engine/gift-deemed/capital-decrease";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";
import { calcConvertibleBondGift } from "@/lib/tax-engine/gift-deemed/convertible-bond";

// Phase 2 자본거래 — 시행령 §28·§29·§29의2·§29의3·§30 산식 anchor (핵심 케이스)
describe("§38 합병", () => {
  it("[MRG-1] ㉮15000·㉯10000(비율1)·대주주 5만주 → (5000)×50000 = 2.5억 (기준 2.25억 충족)", () => {
    const r = calcMergerGift({
      mergedSharePrice: 15_000,
      overvaluedSharePrice: 10_000,
      preMergerShares: 100,
      exchangedShares: 100,
      majorShares: 50_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(250_000_000);
  });
});

describe("§39 증자 — 저가발행·실권주 재배정", () => {
  it("[CI-1] 증자후 8333 − 인수 5000 = 3333 × 실권주 1만 = 33,330,000", () => {
    const r = calcCapitalIncreaseGift({
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(33_330_000);
  });
});

describe("§39의2 감자 — 저가소각", () => {
  it("[CD-1] 차액4000 × 관련감자 5천 × 지분30% = 6,000,000 (차액 30%↑ → 기준 0)", () => {
    const r = calcCapitalDecreaseGift({
      sharePrice: 10_000,
      redemptionPrice: 6_000,
      totalRedeemedShares: 10_000,
      majorPostRatio: { numer: 30, denom: 100 },
      relatedRedeemedShares: 5_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(6_000_000);
  });
});

describe("§39의3 현물출자 — 저가인수", () => {
  it("[CON-1] 출자후 8333 − 인수 5000 = 3333 × 배정 3만 = 99,990,000", () => {
    const r = calcContributionGift({
      preContribPrice: 10_000,
      preContribShares: 100_000,
      newSharePrice: 5_000,
      contributedShares: 50_000,
      allocatedShares: 30_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(99_990_000);
  });
});

describe("§40 전환사채 — 저가 인수·취득", () => {
  it("[CB-1] 시가 10억 − 인수 6억 = 4억 (기준 MIN(3억,1억)=1억 충족)", () => {
    const r = calcConvertibleBondGift({ bondMarketValue: 1_000_000_000, acquisitionPrice: 600_000_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(400_000_000);
  });

  it("[CB-2] 시가 1억 − 인수 9,500만 = 500만 < 기준 3,000만 → 미적용", () => {
    const r = calcConvertibleBondGift({ bondMarketValue: 100_000_000, acquisitionPrice: 95_000_000 });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});
