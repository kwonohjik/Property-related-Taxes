import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";

// ③ 2단계 증자 sub-case — 시행령 §29②1~5 (저가 가/다/라·나, 고가 가·나·다라)
// 공통 산식: 증자후 1주당 = [(평가×증자전주식)+(인수가×증자주식)] ÷ (증자전+증자주식)

describe("§39①1호 저가발행 — 다·라목 (제3자 직접배정·초과배정, §29②1 기준금액 없음)", () => {
  it("[CI-LOW-TP] 증자후 8333 − 인수 5000 = 3333 × 직접배정 2만 = 66,660,000", () => {
    const r = calcCapitalIncreaseGift({
      direction: "low",
      subType: "third_party",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 20_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(66_660_000);
  });
});

describe("§39①1호 나목 저가발행 — 실권주 미배정 (§29②2 기준 30%·3억)", () => {
  it("[CI-LOW-NR] 차액 3333 ≥ 증자후가 8333×30%=2499 충족 → 3333 × 실권주 1만 = 33,330,000", () => {
    const r = calcCapitalIncreaseGift({
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(33_330_000);
  });

  it("[CI-LOW-NR-FAIL] 차액 1333 < 증자후가 9333×30%=2799, 이익 13,330,000 < 3억 → 미적용", () => {
    const r = calcCapitalIncreaseGift({
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 8_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});

describe("§39①2호 가목 고가발행 — 실권주 재배정 (§29②3 기준금액 없음)", () => {
  it("[CI-HIGH-A] 인수 20000 − 증자후 13333 = 6667 × 실권주 3만 = 200,010,000", () => {
    const r = calcCapitalIncreaseGift({
      direction: "high",
      subType: "forfeited_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 50_000,
      forfeitedShares: 30_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(200_010_000);
  });
});

describe("§39①2호 나목 고가발행 — 실권주 미배정·비율가중 (§29②4 기준 30%·3억)", () => {
  it("[CI-HIGH-NR] 6667 × 실권주 3만 = 2.0001억 × (특수관계 15000/균등 50000) = 60,003,000 (차액 30%↑ 충족)", () => {
    const r = calcCapitalIncreaseGift({
      direction: "high",
      subType: "no_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 50_000,
      forfeitedShares: 30_000,
      relatedAcquiredShares: 15_000,
      ratioDenomShares: 50_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(60_003_000);
  });
});

describe("§39①2호 다·라목 고가발행 — 제3자·초과배정·비율가중 (§29②5 기준금액 없음)", () => {
  it("[CI-HIGH-TPE] 6667 × 미달분 3만 = 2.0001억 × (특수관계 20000/40000) = 100,005,000", () => {
    const r = calcCapitalIncreaseGift({
      direction: "high",
      subType: "excess",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 50_000,
      forfeitedShares: 30_000,
      relatedAcquiredShares: 20_000,
      ratioDenomShares: 40_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(100_005_000);
  });
});

describe("회귀 — 기본 케이스 보존 (direction·subType 미지정 = 저가 가목)", () => {
  it("[CI-DEFAULT] flat 입력 → 증자후 8333 − 인수 5000 = 3333 × 실권주 1만 = 33,330,000", () => {
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
