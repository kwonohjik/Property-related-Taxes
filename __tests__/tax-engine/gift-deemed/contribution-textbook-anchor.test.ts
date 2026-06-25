/**
 * 현물출자 §39의3 — 세무교재 계산사례 1·2·3 anchor (원단위 toBe — feedback_pdf_example_test_anchoring).
 * 설계: docs/02-design/features/gift-inkind-contribution-39-3.engine.design.md (케이스 인벤토리)
 * 저가 2단계(gross + 증여자별 안분 자기지분 제외, 조심2010서3741)·고가 per-donee·floor 잔액흡수.
 */
import { describe, it, expect } from "vitest";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";

describe("§39의3 현물출자 — 교재 계산사례 anchor", () => {
  // ── TBC-1: 계산사례 1 저가·다수 증여자 안분 ──
  it("[TBC-1] CASE-1 저가인수 — gross 500M, A 275M, B 175M, 과세 450M", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 20_000,
      preContribShares: 100_000,
      newSharePrice: 10_000,
      contributedShares: 100_000,
      allocatedShares: 100_000,
      parties: [
        { name: "A", preShares: 55_000 },
        { name: "B", preShares: 35_000 },
      ],
    });
    expect(r.caseType).toBe("low");
    expect(r.grossDeemedGiftValue).toBe(500_000_000);
    expect(r.contributionBreakdown?.[0]).toMatchObject({ party: "A", value: 275_000_000 });
    expect(r.contributionBreakdown?.[1]).toMatchObject({ party: "B", value: 175_000_000 });
    expect(r.deemedGiftValue).toBe(450_000_000);
    expect(r.applied).toBe(true);
  });

  // ── TBC-2: 계산사례 2 고가·다수 수증자 per-donee ──
  it("[TBC-2] CASE-2 고가인수 — B 175M, C 50M, 합계 225M", () => {
    const r = calcContributionGift({
      caseType: "high",
      preContribPrice: 5_000,
      preContribShares: 100_000,
      newSharePrice: 20_000,
      contributedShares: 50_000,
      allocatedShares: 50_000,
      parties: [
        { name: "B", preShares: 35_000 },
        { name: "C", preShares: 10_000 },
      ],
    });
    expect(r.caseType).toBe("high");
    expect(r.grossDeemedGiftValue).toBe(500_000_000); // base (ratio 前)
    expect(r.contributionBreakdown?.[0]).toMatchObject({ party: "B", value: 175_000_000 });
    expect(r.contributionBreakdown?.[1]).toMatchObject({ party: "C", value: 50_000_000 });
    expect(r.deemedGiftValue).toBe(225_000_000);
  });

  // ── TBC-3L: 계산사례 3 저가 — gross(roster無) vs 과세(roster有, 갑 자기지분 50% 제외) ──
  it("[TBC-3L gross] CASE-3L 저가 roster無 — gross 4,000,000", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 1_000,
      preContribShares: 20_000,
      newSharePrice: 600,
      contributedShares: 20_000,
      allocatedShares: 20_000,
    });
    expect(r.deemedGiftValue).toBe(4_000_000);
    expect(r.grossDeemedGiftValue).toBe(4_000_000);
    expect(r.contributionBreakdown).toBeUndefined();
  });

  it("[TBC-3L 과세] CASE-3L 저가 roster有(을 10,000) — 과세 2,000,000, gross echo 4,000,000", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 1_000,
      preContribShares: 20_000,
      newSharePrice: 600,
      contributedShares: 20_000,
      allocatedShares: 20_000,
      parties: [{ name: "을", preShares: 10_000 }], // 갑(현물출자자) 자기지분 10,000 명부 미포함 → 제외
    });
    expect(r.grossDeemedGiftValue).toBe(4_000_000);
    expect(r.deemedGiftValue).toBe(2_000_000);
    expect(r.contributionBreakdown?.[0]).toMatchObject({ party: "을", value: 2_000_000 });
  });

  // ── TBC-3H: 계산사례 3 고가 ──
  it("[TBC-3H] CASE-3H 고가 roster有(을 10,000) — 5,000,000", () => {
    const r = calcContributionGift({
      caseType: "high",
      preContribPrice: 1_000,
      preContribShares: 20_000,
      newSharePrice: 2_000,
      contributedShares: 20_000,
      allocatedShares: 20_000,
      parties: [{ name: "을", preShares: 10_000 }],
    });
    expect(r.deemedGiftValue).toBe(5_000_000);
    expect(r.contributionBreakdown?.[0]).toMatchObject({ party: "을", value: 5_000_000 });
  });

  // ── TBC-RES: floor 잔액흡수 (taxableTotal 기준, gross 아님) ──
  it("[TBC-RES] 저가 floor 잔액흡수 — gross 20,000 → A 6,666 · B 6,667 · 과세 13,333", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 7_500,
      preContribShares: 3,
      newSharePrice: 2_500,
      contributedShares: 3,
      allocatedShares: 8, // synthetic — floor 잔액흡수 단위검증
      parties: [
        { name: "A", preShares: 1 },
        { name: "B", preShares: 1 }, // 현물출자자 자기지분 1 (명부 미포함)
      ],
    });
    expect(r.grossDeemedGiftValue).toBe(20_000);
    expect(r.contributionBreakdown?.[0].value).toBe(6_666); // floor(20000×1/3)
    expect(r.contributionBreakdown?.[1].value).toBe(6_667); // 잔액흡수 taxableTotal−6666
    expect(r.deemedGiftValue).toBe(13_333); // floor(20000×2/3)
  });

  // ── TBC-NOTE: 결과 breakdown note에 4대 법령효과 키워드 ──
  it("[TBC-NOTE] CASE-1 결과 breakdown note에 §53⑧3호·§4의2⑥·§43①·현물출자 납입일 포함", () => {
    const r = calcContributionGift({
      caseType: "low",
      preContribPrice: 20_000,
      preContribShares: 100_000,
      newSharePrice: 10_000,
      contributedShares: 100_000,
      allocatedShares: 100_000,
      parties: [{ name: "A", preShares: 55_000 }, { name: "B", preShares: 35_000 }],
    });
    const notes = r.breakdown.map((s) => s.note ?? "").join(" ");
    expect(notes).toContain("§53⑧3호");
    expect(notes).toContain("§4의2⑥");
    expect(notes).toContain("§43①");
    expect(notes).toContain("현물출자 납입일");
  });
});
