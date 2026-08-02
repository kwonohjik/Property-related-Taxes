/**
 * anchor: §39 증자 — **주권상장법인 공모 모집 배정 적용제외** (§39① 괄호 · 「상증령」§29③)
 *
 * 계획서: docs/00-pm/capital-increase-public-offering-exclusion.plan.md v1.0
 *
 * ── 법문 4단 위임체인 (KoreanLaw MCP 실측 2026-08-02) ──────────────────────
 * 「상증법」§39①1가: 「…실권주를 **배정**(**주권상장법인**이 「자본시장과 금융투자업에 관한 법률」
 *   **§9⑦ 유가증권의 모집방법**(대통령령으로 정하는 경우를 **제외**한다)으로 배정하는 경우는
 *   **제외**한다. **이하 이 항에서 같다**)하는 경우에는 …」
 * 「자본시장법」§9⑦   : 「"모집" = **50인 이상**에게 새로 발행되는 증권 취득의 청약을 권유」
 * 「상증령」§29③      : 「"대통령령으로 정하는 경우" = 자본시장법 **시행령 §11③**에 따라 모집하는 경우」
 * 「자시령」§11③      : 「50인 미만이라 모집이 아니어도 전매기준 해당 시 **모집으로 본다**」= **간주모집**
 *
 * ⇒ **이중부정**:
 *     배정이 모집방법이면            → §39① **적용 제외**(과세 없음)
 *       단, 그 모집이 §11③ 간주모집이면 → 제외 취소(**과세**)
 *   형식적 간주모집을 통한 회피를 막는 구조다.
 *
 * ⚠️ **적용 범위는 §39① 전체**다 — 「이하 이 항에서 같다」이므로 1호 가·나·다·라목과
 *    **2호(고가)** 전부에 걸린다. 「1호 가목만」이 아니다(PO-4가 지킨다).
 *
 * ⚠️ **§39의3(현물출자)에는 적용되지 않는다** — 그쪽은 자본시장법 **§165의6①3**(일반공모 **방식**)로
 *    별도 규율하며 효과도 「신주수 차감」이라 다르다. 옮겨 붙이면 오적용(PO-7이 차단).
 */
import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import { calcConvertibleStockGift } from "@/lib/tax-engine/gift-deemed/convertible-stock";
import { calcContributionGift } from "@/lib/tax-engine/gift-deemed/contribution-in-kind";
import type {
  CapitalIncreaseInput,
  ContributionInput,
} from "@/lib/tax-engine/gift-deemed/types";

/** 저가발행 가목(실권주 재배정) — 이론 ㉯ 15,000 · 이익 (15,000−10,000)×60,000 = 300,000,000 */
function low(over: Partial<CapitalIncreaseInput> = {}): CapitalIncreaseInput {
  return {
    direction: "low",
    subType: "forfeited_realloc",
    preIssuePrice: 20_000,
    preIssueShares: 100_000,
    newSharePrice: 10_000,
    issuedShares: 100_000,
    forfeitedShares: 60_000,
    ...over,
  };
}

/** 고가발행 가목 — 이론 ㉯ 10,000 · 이익 (20,000−10,000)×50,000 = 500,000,000 */
function high(over: Partial<CapitalIncreaseInput> = {}): CapitalIncreaseInput {
  return {
    direction: "high",
    subType: "forfeited_realloc",
    preIssuePrice: 5_000,
    preIssueShares: 100_000,
    newSharePrice: 20_000,
    issuedShares: 50_000,
    forfeitedShares: 50_000,
    ...over,
  };
}

describe("§39①1호 저가 — 공모 모집 배정 적용제외", () => {
  it("PO-1 ⭐: 진성 공모 배정이면 **과세 없음**", () => {
    const r = calcCapitalIncreaseGift(low({ allocationMethod: "public_offering" }));
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("모집방법");
    expect(r.exclusionReason).toContain("§39①");
  });

  it("PO-2: **간주모집**(자시령 §11③)이면 제외가 취소되어 과세된다", () => {
    const r = calcCapitalIncreaseGift(low({ allocationMethod: "deemed_public_offering" }));
    expect(r.deemedGiftValue).toBe(300_000_000); // normal과 같은 값
    expect(r.applied).toBe(true);
    // 세액은 같아도 「공모였으나 간주모집이라 과세」를 남긴다(감사 추적성)
    expect(JSON.stringify(r.breakdown)).toContain("간주모집");
  });

  it("PO-3: normal·미지정은 기존 동작 그대로 (회귀)", () => {
    expect(calcCapitalIncreaseGift(low()).deemedGiftValue).toBe(300_000_000);
    expect(calcCapitalIncreaseGift(low({ allocationMethod: "normal" })).deemedGiftValue).toBe(300_000_000);
  });
});

describe("§39①2호 고가 — 「이하 이 항에서 같다」로 **전체**에 걸린다", () => {
  it("PO-4 ⭐: 고가발행도 공모 배정이면 과세 없음 (「1호 가목만」이 아니다)", () => {
    expect(calcCapitalIncreaseGift(high()).deemedGiftValue).toBe(500_000_000); // 전제 고정
    const r = calcCapitalIncreaseGift(high({ allocationMethod: "public_offering" }));
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
  });
});

describe("전환주식 §39①3호 — 위임으로 자동 커버", () => {
  /**
   * §29②6 = 전환 시점 이익 − 발행 시점 이익. `calcCapitalIncreaseGift`에 위임하므로
   * 필드만 얹으면 자동 커버된다.
   * ⚠️ 두 시점 이익을 **다르게** 둬야 판별력이 생긴다(Phase D D-12 함정 — 같으면 0 == 0).
   *   전환 300,000,000 · 발행 60,000,000 ⇒ normal 240,000,000 / 전환분 공모 시 0
   */
  const conv = low();
  const issuance = low({ newSharePrice: 14_000, forfeitedShares: 20_000 }); // 이론 17,000 · 3,000×20,000

  it("PO-5 ⭐: 전환 시점만 공모 → 240,000,000 → 0", () => {
    expect(calcConvertibleStockGift({ atConversion: conv, atIssuance: issuance }).deemedGiftValue).toBe(
      240_000_000,
    );
    const r = calcConvertibleStockGift({
      atConversion: { ...conv, allocationMethod: "public_offering" },
      atIssuance: issuance,
    });
    expect(r.deemedGiftValue).toBe(0); // 0 − 60,000,000 < 0 ⇒ §29②6 단서로 0
  });
});

describe("cap-table — **행별** 적용 (한 증자에 공모·특정 배정이 섞인다)", () => {
  /**
   * A 전량 실권(60,000) · B 재배정 40,000 · C 재배정 20,000 · ㉯ 15,000
   *   B = 5,000 × 40,000 = 200,000,000 · C = 5,000 × 20,000 = 100,000,000
   */
  const shareholders = [
    { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B", "C"] },
    { id: "B", name: "B", preShares: 20_000, entitledShares: 20_000, subscribedShares: 60_000, reallocatedShares: 40_000, relatedTo: ["A"] },
    { id: "C", name: "C", preShares: 20_000, entitledShares: 20_000, subscribedShares: 40_000, reallocatedShares: 20_000, relatedTo: ["A"] },
  ];

  it("PO-6 ⭐: B만 공모 배정 → B 0 · C는 불변", () => {
    const base = calcCapitalIncreaseAllocation({ direction: "low", preIssuePrice: 20_000, newSharePrice: 10_000, shareholders });
    expect(base.perShareAfter).toBe(15_000);
    expect(base.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(200_000_000);
    expect(base.perBeneficiary.find((p) => p.beneficiaryId === "C")?.total).toBe(100_000_000);

    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 20_000,
      newSharePrice: 10_000,
      shareholders: shareholders.map((s) => (s.id === "B" ? { ...s, allocationMethod: "public_offering" as const } : s)),
    });
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "B")?.total).toBe(0);
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "C")?.total).toBe(100_000_000);
  });
});

describe("§39의3 오적용 차단", () => {
  it("PO-7 ⭐: 현물출자에 `allocationMethod`를 넣어도 **아무 영향이 없다**", () => {
    // §39의3은 자본시장법 §165의6①3(일반공모 **방식**)로 별도 규율하며 효과도 「신주수 차감」이다.
    // §39의 모집방법 제외를 옮겨 붙이면 오적용 — 필드가 조용히 먹히지 않음을 고정한다.
    const base: ContributionInput = {
      caseType: "low",
      preContribPrice: 20_000,
      preContribShares: 100_000,
      newSharePrice: 10_000,
      contributedShares: 100_000,
      allocatedShares: 100_000,
    };
    const withField = { ...base, allocationMethod: "public_offering" } as ContributionInput;
    expect(calcContributionGift(base).grossDeemedGiftValue).toBe(500_000_000);
    expect(calcContributionGift(withField).grossDeemedGiftValue).toBe(500_000_000);
  });
});

describe("PO-8 회귀 — 미사용 경로 불변", () => {
  it("증자 저가·고가 · cap-table 기본값이 그대로", () => {
    expect(calcCapitalIncreaseGift(low()).deemedGiftValue).toBe(300_000_000);
    expect(calcCapitalIncreaseGift(high()).deemedGiftValue).toBe(500_000_000);
    const r = calcCapitalIncreaseAllocation({
      direction: "low",
      preIssuePrice: 20_000,
      newSharePrice: 10_000,
      shareholders: [
        { id: "A", name: "A", preShares: 60_000, entitledShares: 60_000, subscribedShares: 0, relatedTo: ["B"] },
        { id: "B", name: "B", preShares: 40_000, entitledShares: 40_000, subscribedShares: 100_000, reallocatedShares: 60_000, relatedTo: ["A"] },
      ],
    });
    expect(r.perBeneficiary[0].total).toBe(300_000_000);
    expect(r.reconciliation.balanced).toBe(true);
  });
});
