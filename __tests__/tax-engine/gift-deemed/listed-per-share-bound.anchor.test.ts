/**
 * anchor: **주권상장법인등 1주당 가액 단서** — 「상증령」§29②1가 단서(Min) · §29②3나 단서(Max)
 *
 * 계획서: docs/00-pm/gift-inkind-contribution-39-3-phase-d.plan.md v1.1 (Phase D)
 *
 * ── 법문 (KoreanLaw MCP 실측 2026-08-02) ──────────────────────────────────
 * §29②1가: 「… 다만, **주권상장법인등**의 경우로서 증자후의 1주당 평가가액이 다음 산식에 의하여
 *           계산한 1주당 가액보다 **적은** 경우에는 당해 가액」          ⇒ **Min**
 * §29②3나: 「… 다만, 주권상장법인등의 경우로서 … 산식 가액보다 **큰** 경우에는 당해 가액」 ⇒ **Max**
 *
 * 방향이 비대칭인 이유는 그 값이 놓인 자리가 다르기 때문이다:
 *   저가 = **가목**(평가) − 나목(인수가)  → 평가가 **피감수** → 적은 쪽이 이익 ↓
 *   고가 = 가목(인수가) − **나목**(평가)  → 평가가 **감수**   → 큰 쪽이  이익 ↓
 * ⇒ **두 방향 모두 이익을 줄인다.** 뒤집으면 과다과세이므로 양방향을 동결한다.
 *
 * §29의3①: 「제29조제2항제1호가목을 **준용**」 + 「"증자"는 "현물출자"로 본다」
 *           ⇒ 단서가 준용에 포함되고, 「증자후 평가」 = 「현물출자 후 평가」.
 * §29의3②: 고가 30% 게이트 분모 = 「같은 호 **나목을 준용하여 계산한 가액**」
 *           ⇒ **Max 적용 후 값** ⇒ 과세 여부 판정 자체가 뒤집힐 수 있다 (D-5).
 *
 * 교재 계산사례 3건이 전부 비상장이라 기대값은 법문 산식으로 유도했다(계획서 부록 A 수기 검산).
 */
import { describe, it, expect } from "vitest";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import type {
  ContributionInput,
  CapitalIncreaseInput,
} from "@/lib/tax-engine/gift-deemed/types";

// ── 현물출자 픽스처 ────────────────────────────────────────────────────────
/** 저가: 이론 = (20,000×100,000 + 10,000×100,000) ÷ 200,000 = **15,000** */
function conLow(over: Partial<ContributionInput> = {}): ContributionInput {
  return {
    caseType: "low",
    preContribPrice: 20_000,
    preContribShares: 100_000,
    newSharePrice: 10_000,
    contributedShares: 100_000,
    allocatedShares: 100_000,
    ...over,
  };
}
/** 고가: 이론 = (5,000×100,000 + 20,000×50,000) ÷ 150,000 = **10,000** · roster B 35% · C 10% */
function conHigh(over: Partial<ContributionInput> = {}): ContributionInput {
  return {
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
    ...over,
  };
}

describe("§29②1가 단서 준용 — 현물출자 저가 Min", () => {
  it("D-1: 상장 평가 13,000 < 이론 15,000 ⇒ 13,000 채택 · gross 300,000,000", () => {
    const r = calcContributionGift(conLow({ isListed: true, listedMarketAvg: 13_000 }));
    expect(r.grossDeemedGiftValue).toBe(300_000_000); // (13,000−10,000)×100,000
    expect(r.deemedGiftValue).toBe(300_000_000); // roster 無 ⇒ gross
  });

  it("D-2: 상장 평가 17,000 > 이론 15,000 ⇒ 단서 미발동 · gross 500,000,000", () => {
    const r = calcContributionGift(conLow({ isListed: true, listedMarketAvg: 17_000 }));
    expect(r.grossDeemedGiftValue).toBe(500_000_000); // 방향 반전 시 700,000,000이 된다
  });
});

describe("§29②3나 단서 준용 — 현물출자 고가 Max", () => {
  it("D-3: 상장 평가 12,000 > 이론 10,000 ⇒ 12,000 채택 · B 140,000,000 · C 40,000,000", () => {
    const r = calcContributionGift(conHigh({ isListed: true, listedMarketAvg: 12_000 }));
    expect(r.grossDeemedGiftValue).toBe(400_000_000); // (20,000−12,000)×50,000
    expect(r.contributionBreakdown?.[0]).toMatchObject({ party: "B", value: 140_000_000 });
    expect(r.contributionBreakdown?.[1]).toMatchObject({ party: "C", value: 40_000_000 });
    expect(r.deemedGiftValue).toBe(180_000_000);
  });

  it("D-4: 상장 평가 8,000 < 이론 10,000 ⇒ 단서 미발동 · TBC-2와 동일 225,000,000", () => {
    const r = calcContributionGift(conHigh({ isListed: true, listedMarketAvg: 8_000 }));
    expect(r.grossDeemedGiftValue).toBe(500_000_000);
    expect(r.deemedGiftValue).toBe(225_000_000);
  });

  it("D-5 ⭐: Max가 30% 게이트를 뒤집는다 (§29의3② 분모 연쇄) — 전원 비과세", () => {
    // 평가 16,000 채택 ⇒ 차액 4,000 < 16,000×30% = 4,800 ⇒ 30% 게이트 ✗
    // base = 4,000×50,000 = 200,000,000 ⇒ B raw 70,000,000 · C raw 20,000,000 둘 다 3억 미만 ✗
    const r = calcContributionGift(conHigh({ isListed: true, listedMarketAvg: 16_000 }));
    expect(r.grossDeemedGiftValue).toBe(200_000_000);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
});

describe("단서 발동 게이트 — 3-state 규약", () => {
  it("D-6: 상장 ON이지만 평균액 미입력 ⇒ 이론값 유지 (자동 추정 금지)", () => {
    const r = calcContributionGift(conLow({ isListed: true }));
    expect(r.grossDeemedGiftValue).toBe(500_000_000);
  });

  it("D-7: 비상장은 평균액이 있어도 무시", () => {
    const r = calcContributionGift(conLow({ isListed: false, listedMarketAvg: 13_000 }));
    expect(r.grossDeemedGiftValue).toBe(500_000_000);
  });
});

describe("자본시장법 §165의6①3 일반공모 배정분 제외 (§29의3①1·2호 괄호)", () => {
  it("D-8: 상장 + 공모 40,000 ⇒ 곱셈 인자 60,000 · gross 180,000,000", () => {
    const r = calcContributionGift(
      conLow({ isListed: true, listedMarketAvg: 13_000, publicOfferingShares: 40_000 }),
    );
    expect(r.grossDeemedGiftValue).toBe(180_000_000); // 3,000 × 60,000
  });

  it("D-9: **비상장**에는 적용되지 않는다 — 조문이 「주권상장법인이 … 배정하는 경우」 한정", () => {
    const r = calcContributionGift(conLow({ isListed: false, publicOfferingShares: 40_000 }));
    expect(r.grossDeemedGiftValue).toBe(500_000_000); // 이론 15,000 × 인자 100,000
  });
});

// ── 본칙 §39 증자 ─────────────────────────────────────────────────────────
/** 저가발행 가목(실권주 재배정 — 기준금액 없음). 이론 15,000 */
function ciLow(over: Partial<CapitalIncreaseInput> = {}): CapitalIncreaseInput {
  return {
    direction: "low",
    preIssuePrice: 20_000,
    preIssueShares: 100_000,
    newSharePrice: 10_000,
    issuedShares: 100_000,
    forfeitedShares: 100_000,
    ...over,
  };
}

describe("본칙 §39 증자 — 같은 단서 (준용만 고치면 본칙이 빠진 역전 상태가 된다)", () => {
  it("D-10: 저가 Min — 평가 13,000 ⇒ 300,000,000", () => {
    const r = calcCapitalIncreaseGift(ciLow({ isListed: true, listedMarketAvg: 13_000 }));
    expect(r.deemedGiftValue).toBe(300_000_000);
  });

  it("D-11: 고가 Max — 이론 10,000 · 평가 12,000 ⇒ 400,000,000", () => {
    const r = calcCapitalIncreaseGift({
      direction: "high",
      preIssuePrice: 5_000,
      preIssueShares: 100_000,
      newSharePrice: 20_000,
      issuedShares: 50_000,
      forfeitedShares: 50_000,
      isListed: true,
      listedMarketAvg: 12_000,
    });
    expect(r.deemedGiftValue).toBe(400_000_000); // (20,000−12,000)×50,000
  });

  it("D-12: 전환주식 §39①3호는 위임으로 자동 커버된다 (§29②6 = 전환 − 발행)", () => {
    // 전환 시점 = D-10(상장) ⇒ 단서 도달 시 300,000,000 · 미도달 시 500,000,000
    // 발행 시점 = 비상장·인수가 14,000 ⇒ 이론 17,000 · (17,000−14,000)×100,000 = 300,000,000
    // ⇒ 도달 0 / 미도달 200,000,000 — 두 시점 이익을 **다르게** 둬야 판별력이 생긴다.
    const r = calcConvertibleStockGift({
      atConversion: ciLow({ isListed: true, listedMarketAvg: 13_000 }),
      atIssuance: ciLow({ newSharePrice: 14_000 }),
    });
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
});

describe("D-13 회귀 — 단서 미사용 경로 불변", () => {
  it("현물출자 저가·고가 기존 입력(상장 플래그 없음)이 그대로", () => {
    expect(calcContributionGift(conLow()).grossDeemedGiftValue).toBe(500_000_000);
    expect(calcContributionGift(conHigh()).deemedGiftValue).toBe(225_000_000);
  });

  it("증자 저가·전환주식(둘 다 비상장)이 그대로", () => {
    expect(calcCapitalIncreaseGift(ciLow()).deemedGiftValue).toBe(500_000_000);
    const r = calcConvertibleStockGift({
      atConversion: ciLow(),
      atIssuance: ciLow({ newSharePrice: 14_000 }),
    });
    expect(r.deemedGiftValue).toBe(200_000_000); // 500,000,000 − 300,000,000
  });
});
