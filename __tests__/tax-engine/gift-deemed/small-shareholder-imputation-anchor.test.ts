import { describe, it, expect } from "vitest";
import { isSmallShareholder, appliesSmallShareholderImputation } from "@/lib/tax-engine/gift-deemed/capital-helpers";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";

// 소액주주 §29⑤ = 발행주식총수 100분의 1 미만 소유 AND 액면 합계 3억원 미만 (둘 다 strict, AND)
describe("§29⑤ 소액주주 판정 (1% 미만 AND 액면 3억 미만)", () => {
  it("[SS-1] 0.99%(990/100000) · 액면 2억 → 소액주주", () => {
    expect(isSmallShareholder({ ownedShares: 990, totalShares: 100_000, faceValueSum: 200_000_000 })).toBe(true);
  });
  it("[SS-2] 정확히 1%(1000/100000) → 미만 아님 → 소액주주 아님", () => {
    expect(isSmallShareholder({ ownedShares: 1_000, totalShares: 100_000, faceValueSum: 200_000_000 })).toBe(false);
  });
  it("[SS-3] 0.5%지만 액면 정확히 3억 → 미만 아님 → 소액주주 아님", () => {
    expect(isSmallShareholder({ ownedShares: 500, totalShares: 100_000, faceValueSum: 300_000_000 })).toBe(false);
  });
  it("[SS-4] 0.5% · 액면 2.99억 → 소액주주", () => {
    expect(isSmallShareholder({ ownedShares: 500, totalShares: 100_000, faceValueSum: 299_000_000 })).toBe(true);
  });
});

// §39②·§39의3②: 이익을 증여한 소액주주 2명 이상 → 1인 의제
describe("소액주주 1인 의제 판정 (2명 이상)", () => {
  it("[IMP-1] 소액주주 2명 → 의제 적용", () => {
    const donors = [
      { ownedShares: 500, faceValueSum: 100_000_000 },
      { ownedShares: 800, faceValueSum: 250_000_000 },
    ];
    expect(appliesSmallShareholderImputation(donors, 100_000)).toBe(true);
  });
  it("[IMP-2] 소액주주 1명뿐(나머지 대주주) → 의제 미적용", () => {
    const donors = [
      { ownedShares: 500, faceValueSum: 100_000_000 }, // 소액주주
      { ownedShares: 5_000, faceValueSum: 100_000_000 }, // 5% → 대주주
    ];
    expect(appliesSmallShareholderImputation(donors, 100_000)).toBe(false);
  });
});

// 엔진 echo — 저가발행/저가인수에서 의제 플래그가 thresholdEcho + note로 표시 (집계 이익 불변)
describe("엔진 의제 echo (증여재산가액 불변)", () => {
  it("[IMP-CI] 증자 저가 — 의제 플래그 → echo true, 이익 33,330,000 유지", () => {
    const r = calcCapitalIncreaseGift({
      direction: "low",
      subType: "forfeited_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
      smallShareholderImputation: true,
    });
    expect(r.deemedGiftValue).toBe(33_330_000);
    expect(r.thresholdEcho?.smallShareholderImputation).toBe(true);
    expect(r.breakdown.at(-1)?.note).toContain("§39② 소액주주 1인 의제");
  });

  it("[IMP-CON] 현물출자 저가 — 의제 플래그 → echo true, 이익 99,990,000 유지", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 10_000,
      preContribShares: 100_000,
      newSharePrice: 5_000,
      contributedShares: 50_000,
      allocatedShares: 30_000,
      smallShareholderImputation: true,
    });
    expect(r.deemedGiftValue).toBe(99_990_000);
    expect(r.thresholdEcho?.smallShareholderImputation).toBe(true);
    expect(r.breakdown.at(-1)?.note).toContain("§39의3② 소액주주 1인 의제");
  });

  it("[IMP-OFF] 플래그 미설정 → echo false, note 없음", () => {
    const r = calcCapitalIncreaseGift({
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
    });
    expect(r.thresholdEcho?.smallShareholderImputation).toBe(false);
    expect(r.breakdown.at(-1)?.note).not.toContain("의제");
  });
});
