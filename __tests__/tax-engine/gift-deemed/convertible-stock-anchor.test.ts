import { describe, it, expect } from "vitest";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";

// ③ 전환주식 §39①3호 (시행령 §29②6) — 전환후 §29②1~5 이익 − 발행당시 §29②1~5 이익, 음수면 0
describe("§39①3호 전환주식 — 전환후 − 발행당시 (§29②6)", () => {
  it("[CS-1] 전환후 33,330,000 − 발행당시 20,000,000 = 13,330,000", () => {
    const r = calcConvertibleStockGift({
      // 전환 후: 증자후 8333 − 인수 5000 = 3333 × 1만 = 33,330,000
      atConversion: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 5_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
      // 발행 당시: 증자후 9000 − 인수 7000 = 2000 × 1만 = 20,000,000
      atIssuance: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 7_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(13_330_000);
  });

  it("[CS-2] 전환후 20,000,000 − 발행당시 33,330,000 = 음수 → 0 (미적용)", () => {
    const r = calcConvertibleStockGift({
      atConversion: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 7_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
      atIssuance: {
        preIssuePrice: 10_000,
        preIssueShares: 100_000,
        newSharePrice: 5_000,
        issuedShares: 50_000,
        forfeitedShares: 10_000,
      },
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });
});

/**
 * 전환주식 조합 축 — 기존 [CS-1]·[CS-2]가 **저가 × 실권주 재배정** 한 조합만 덮어
 * 아래 세 축이 6건 중 0건을 죽였다(2026-09-21 리뷰 뮤테이션 실측).
 *
 * 「상증령」§29②6호: 가목(전환 후 교부주식을 신주로 보아 §29②1~5로 계산한 이익)
 *  − 나목(전환주식 «발행 당시» §29②1~5로 계산한 이익). 영 이하면 이익 없음.
 *  ⇒ **양 시점 모두** §29②1~5의 전 분기(기준금액 게이트·배정방법·저가/고가)를 경유한다.
 */
describe("§39①3호 전환주식 — 조합 축 (배정방법·기준금액·direction)", () => {
  const base = {
    direction: "low" as const,
    subType: "forfeited_realloc" as const,
    preIssuePrice: 20_000,
    preIssueShares: 100_000,
    newSharePrice: 10_000,
    issuedShares: 100_000,
    forfeitedShares: 100_000,
  };

  it("[CS-3-PO] 발행당시 leg에 §39① 공모 제외가 걸리면 차감항이 0이 되어 전환후 이익이 «전액» 남는다", () => {
    // 기준(양 시점 normal): 500,000,000 − 300,000,000 = 200,000,000
    const normal = calcConvertibleStockGift({
      atConversion: base,
      atIssuance: { ...base, newSharePrice: 14_000 },
    });
    expect(normal.deemedGiftValue).toBe(200_000_000);

    // 발행당시만 「주권상장법인 + 공모 배정」 → 나목이 0 ⇒ 차감 소멸
    const r = calcConvertibleStockGift({
      atConversion: base,
      atIssuance: { ...base, newSharePrice: 14_000, isListed: true, allocationMethod: "public_offering" },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(500_000_000); // +300,000,000
  });

  it("[CS-4-NR] 발행당시 leg이 §29②2호 기준금액 게이트에 걸리면 차감항이 0이 된다", () => {
    const nr = { ...base, subType: "no_realloc" as const, preIssuePrice: 10_000, issuedShares: 50_000, forfeitedShares: 10_000 };
    const r = calcConvertibleStockGift({
      atConversion: { ...nr, newSharePrice: 5_000 }, // 33,330,000 (30% 충족)
      atIssuance: { ...nr, newSharePrice: 8_000 },   // 13,330,000 < 3억·30% 미충족 → 게이트 0
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(33_330_000);
  });

  it("[CS-5-HIGH] direction=high — §39①3호 나목(고가 발행 전환주식) 경유값", () => {
    const r = calcConvertibleStockGift({
      atConversion: { ...base, direction: "high", newSharePrice: 30_000 },
      atIssuance: { ...base, direction: "high", newSharePrice: 25_000 },
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(250_000_000);
  });
});
