import { describe, it, expect } from "vitest";
import { calcMergerGift } from "@/lib/tax-engine/gift-deemed/merger";
import { calcCapitalDecreaseGift } from "@/lib/tax-engine/gift-deemed/capital-decrease";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";

// ③ 1단계 sub-case — 합병 주식외(§28③2)·감자 고가(§29의2①2)·현물출자 고가(§29의3①2)
describe("§38 합병 — 주식 외 재산 교부 (§28③2)", () => {
  it("[MRG-NS] 액면 5000 − 평가 3000 = 2000 × 대주주 20만주 = 4억 (기준 3억 충족)", () => {
    const r = calcMergerGift({
      caseType: "non_stock",
      faceValue: 5_000,
      mergeConsideration: 5_000,
      overvaluedSharePrice: 3_000,
      majorShares: 200_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(400_000_000);
  });
});

describe("§39의2 감자 — 고가소각 (§29의2①2)", () => {
  it("[CD-H] 소각가 8000 − 평가 3000 = 5000 × 해당 10만주 = 5억 (차액 30%↑ → 기준 0)", () => {
    const r = calcCapitalDecreaseGift({
      caseType: "high",
      sharePrice: 3_000,
      redemptionPrice: 8_000,
      ownRedeemedShares: 100_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000);
  });
});

describe("§39의3 현물출자 — 고가인수 (§29의3①2)", () => {
  it("[CON-H] 출자후 13333 · 인수 20000 차액 6667 × 인수 3만 × 30% = 60,003,000 (차액 30%↑ 충족)", () => {
    const r = calcContributionGift({
      caseType: "high",
      preContribPrice: 10_000,
      preContribShares: 100_000,
      newSharePrice: 20_000,
      contributedShares: 50_000,
      allocatedShares: 30_000,
      relatedRatio: { numer: 30, denom: 100 },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(60_003_000);
  });
});

// 기존 저가/주식교부 케이스 회귀 (caseType 미지정 = 기본 stock/low)
describe("회귀 — 기본 케이스 보존", () => {
  it("합병 stock 기본", () => {
    const r = calcMergerGift({ mergedSharePrice: 15_000, overvaluedSharePrice: 10_000, preMergerShares: 100, exchangedShares: 100, majorShares: 50_000 });
    expect(r.deemedGiftValue).toBe(250_000_000);
  });
  it("감자 low 기본", () => {
    const r = calcCapitalDecreaseGift({ sharePrice: 10_000, redemptionPrice: 6_000, totalRedeemedShares: 10_000, majorPostRatio: { numer: 30, denom: 100 }, relatedRedeemedShares: 5_000 });
    expect(r.deemedGiftValue).toBe(6_000_000);
  });
});
