/**
 * 공익법인등 **의결권 행사** 증여세 추징 — 상속세 및 증여세법 §48②6호
 *
 * ## 법령 (2026-08-10 실측 · 법 MST 276123 · 령 MST 283637)
 *
 * · **법 §48②6호** — 「**제16조제2항제2호가목**에 따른 요건을 **모두 충족**하는 공익법인등
 *   (같은 호 **나목 및 다목**에 해당하는 공익법인등은 **제외**한다)이 **같은 목 1)을 위반**하여
 *   출연받은 주식등의 **의결권을 행사한 경우**」
 * · **법 §16②2호가목** — 「다음의 요건을 모두 갖춘 공익법인등(나목 또는 다목에 해당하는
 *   공익법인등은 제외한다)에 출연하는 경우: **100분의 20**
 *     1) **출연받은 주식등의 의결권을 행사하지 아니할 것**
 *     2) **자선ㆍ장학 또는 사회복지를 목적으로 할 것**」
 * · **법 §16②2호 나목** — 상호출자제한기업집단과 특수관계에 있는 공익법인등: 100분의 5
 * · **법 §16②2호 다목** — §48⑪ 각 호의 요건을 충족하지 못하는 공익법인등: 100분의 5
 * · **상증령 §40①3의2호** — 과세가액: 「해당 공익법인 등이 출연받은 주식등의 **의결권을 행사한
 *   날**에 발행주식총수등의 **100분의 10을 초과**하여 보유하고 있는 **주식등의 가액**」
 *
 * ## ⭐ 한도는 20%인데 과세 기준선은 **10%**다 (VR-1)
 *
 * 가목 요건을 갖추면 **20%까지** 출연받아도 과세가액에 산입되지 않는다. 그런데 1)을 위반해
 * 의결권을 행사하면 시행령이 정한 과세가액은 「**10%를 초과**하여 보유하는 주식등의 가액」이다
 * — 「20% 초과분」이 아니다. 15%를 보유한 법인은 5%p가 통째로 과세된다.
 *
 * ## ⭐ 나목·다목 법인은 6호 대상이 **아니다** (VR-2)
 *
 * 이들은 애초에 5% 한도라 가목이 적용되지 않는다. §48②6호가 괄호로 명시적으로 뺐다.
 * 「의결권을 행사했으니 추징」으로 뭉뚱그리면 대상이 아닌 법인에 과세하게 된다.
 */

import { describe, it, expect } from "vitest";
import { calcPublicInterestVotingRights } from "@/lib/tax-engine/deductions/public-interest-voting-rights";
import { calcInheritanceGiftTax } from "@/lib/tax-engine/inheritance-gift-common";
import type { PublicInterestVotingRightsInput } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";

/** 발행 100만주 · 보유 15만주(15%) · 주당 1만원 · 가목 요건 충족 법인이 의결권 행사 */
function mk(over: Partial<PublicInterestVotingRightsInput> = {}): PublicInterestVotingRightsInput {
  return {
    exerciseDate: "2025-03-28",
    totalShares: 1_000_000,
    heldShares: 150_000,
    pricePerShare: 10_000,
    exercisedVotingRights: true,
    isCharityPurpose: true,
    isNaDaMokCorp: false,
    ...over,
  };
}

describe("VR-1 — 상증령 §40①3의2호: 과세가액은 **10% 초과** 보유분", () => {
  it("15% 보유 → 10% 초과분 5%p(5만주)가 과세가액", () => {
    const r = calcPublicInterestVotingRights(mk());
    expect(r.applies).toBe(true);
    expect(r.excessShares).toBe(50_000);
    expect(r.clawbackBase).toBe(500_000_000); // 5만주 × 1만원
    expect(r.giftTax).toBe(calcInheritanceGiftTax(500_000_000));
    expect(r.giftTax).toBe(90_000_000); // 5억 × 20% − 누진공제 1천만
  });

  it("🔑 한도(20%) 초과분이 아니다 — 20% 보유해도 10% 초과분 전부가 과세된다", () => {
    const r = calcPublicInterestVotingRights(mk({ heldShares: 200_000 }));
    expect(r.excessShares).toBe(100_000); // ❌ 20% 초과분 0이 아니다
    expect(r.clawbackBase).toBe(1_000_000_000);
    expect(r.giftTax).toBe(240_000_000); // 10억 × 30% − 6천만
  });

  it("경계 — 정확히 10%는 「초과」가 아니므로 과세가액 0", () => {
    const r = calcPublicInterestVotingRights(mk({ heldShares: 100_000 }));
    expect(r.excessShares).toBe(0);
    expect(r.clawbackBase).toBe(0);
    expect(r.isClawback).toBe(false);
  });

  it("10% 미만 보유면 과세가액 0", () => {
    const r = calcPublicInterestVotingRights(mk({ heldShares: 90_000 }));
    expect(r.clawbackBase).toBe(0);
  });

  it("10% 기준선을 주식 수로 반올림하지 않는다 (발행주식수가 10의 배수가 아닐 때)", () => {
    // 발행 1,000,001주의 10% = 100,000.1주 → 100,000주 보유는 「초과」가 아니다.
    const r = calcPublicInterestVotingRights(mk({ totalShares: 1_000_001, heldShares: 100_000 }));
    expect(r.clawbackBase).toBe(0);
  });

  it("발행주식총수가 0이면 판정하지 않는다 (0으로 나누지 않는다)", () => {
    const r = calcPublicInterestVotingRights(mk({ totalShares: 0 }));
    expect(r.clawbackBase).toBe(0);
    expect(r.warnings.some((w) => w.includes("발행주식총수"))).toBe(true);
  });
});

describe("VR-2 — §48②6호 적용 대상 판정", () => {
  it("의결권을 행사하지 않았으면 6호에 해당하지 않는다 (양성 대조군)", () => {
    const r = calcPublicInterestVotingRights(mk({ exercisedVotingRights: false }));
    expect(r.applies).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.giftTax).toBe(0);
    expect(r.nonApplicableReason).toMatch(/의결권/);
  });

  it("자선·장학·사회복지 목적이 아니면 가목 요건(2)을 못 갖춰 6호 대상이 아니다", () => {
    const r = calcPublicInterestVotingRights(mk({ isCharityPurpose: false }));
    expect(r.applies).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.nonApplicableReason).toMatch(/자선|장학|사회복지/);
  });

  it("⭐ 나목·다목 공익법인등은 §48②6호가 명시적으로 제외한다", () => {
    const r = calcPublicInterestVotingRights(mk({ isNaDaMokCorp: true }));
    expect(r.applies).toBe(false);
    expect(r.clawbackBase).toBe(0);
    expect(r.nonApplicableReason).toMatch(/나목|다목/);
  });

  it("🔑 미적용이어도 세 사유를 구분해 알려준다 (같은 0이라도 이유가 다르다)", () => {
    const noVote = calcPublicInterestVotingRights(mk({ exercisedVotingRights: false }));
    const noCharity = calcPublicInterestVotingRights(mk({ isCharityPurpose: false }));
    const naDa = calcPublicInterestVotingRights(mk({ isNaDaMokCorp: true }));
    expect(new Set([noVote.nonApplicableReason, noCharity.nonApplicableReason, naDa.nonApplicableReason]).size).toBe(3);
  });
});

describe("VR-3 — 평가 기준일은 「의결권을 행사한 날」", () => {
  it("결과·산식에 행사일이 그대로 남는다", () => {
    const r = calcPublicInterestVotingRights(mk({ exerciseDate: "2024-03-15" }));
    expect(r.exerciseDate).toBe("2024-03-15");
    expect(r.steps.some((s) => s.formula.includes("2024-03-15"))).toBe(true);
  });
});

describe("VR-4 — 증여세 공통 규칙", () => {
  it("§55② 과세최저한(50만원)이 적용된다", () => {
    // 초과 40주 × 1만원 = 40만원 < 50만원
    const r = calcPublicInterestVotingRights(
      mk({ totalShares: 1_000_000, heldShares: 100_040, pricePerShare: 10_000 }),
    );
    expect(r.clawbackBase).toBe(400_000);
    expect(r.belowMinimumTaxBase).toBe(true);
    expect(r.giftTax).toBe(0);
  });

  it("이자상당액을 가산하지 않는다", () => {
    const r = calcPublicInterestVotingRights(mk());
    expect(r.giftTax).toBe(calcInheritanceGiftTax(r.taxBase));
  });
});

describe("VR-5 — 산출 근거에 조문이 남는다", () => {
  it("§48②6호·§16②2호가목·§40①3의2호가 표시된다", () => {
    const r = calcPublicInterestVotingRights(mk());
    const bases = r.steps.map((s) => s.legalBasis).join(" ");
    expect(bases).toMatch(/§48②6호/);
    expect(bases).toMatch(/§40①3의2호/);
    const all = r.steps.map((s) => s.formula).join(" ") + bases;
    expect(all).toMatch(/§16②2호가목|16②2호 가목/);
  });
});
