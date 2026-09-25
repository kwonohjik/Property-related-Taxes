import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 1-B·2-B — 「상증령」§29②2호 **가목**의 ㉯ 기준 수량 (리뷰 #16·#31·#54)
 *
 * §29②는 호마다 ㉯의 곱셈 수량이 다르다:
 *   · 1호 가목(저가 가·다·라목) — 「증자에 의하여 증가한 주식수」= **실제**
 *   · 2호 가목(저가 **나목**)   — 「증자전의 지분비율대로 **균등하게 증자하는 경우의 증가주식수**」
 *   · 3호 나목(고가)           — 「증자에 의하여 증가한 주식수」= **실제**
 *
 * 나목은 실권주를 배정하지 않아 소멸시키므로 두 수량이 갈린다. 종전에는 한 값만 만들어
 * 세 곳에 모두 썼고, 그 결과 **㉯가 실제보다 높게 잡혀** 차액·30% 기준선·증여재산가액이
 * 한 방향으로 치우쳤다.
 *
 * ⚠️ 고가는 **현행이 법령상 정확**하다 — §29②4호의 비율 요건은 「제3호 **나목의 가액**의
 *    100분의 30 이상」이고 그 나목 산식이 실제 증가주식수다. 저가 경로에만 적용한다.
 */

describe("§29②2호 가목 — 단건 저가 나목 ㉯를 균등증자 가정치로", () => {
  it("[CI-S39-2GA-GATE] 게이트 반전 — 333,280,000 과세 → 0원 미과세", () => {
    const BASE = {
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 12_000,
      preIssueShares: 100_000,
      newSharePrice: 7_000,
      issuedShares: 20_000, // 실제 증가 (8만주 실권·미배정으로 소멸)
      forfeitedShares: 80_000,
    } as const;

    // 종전: 실제 ㉯ 11,166 · 차액 4,166 ≥ 30% 기준 3,349 → 과세
    const legacy = calcCapitalIncreaseGift(BASE);
    expect(legacy.applied).toBe(true);
    expect(legacy.deemedGiftValue).toBe(333_280_000);

    // 법정: 균등 ㉯ 9,500 · 차액 2,500 < 기준 2,850 · 2,500×80,000 = 2억 < 3억 → 미과세
    const equal = calcCapitalIncreaseGift({ ...BASE, equalIssueShares: 100_000 });
    expect(equal.applied).toBe(false);
    expect(equal.deemedGiftValue).toBe(0);
  });

  it("[CI-S39-2GA-AMOUNT] 게이트가 양쪽 다 통과해도 **금액**이 달라진다 — 33,330,000 → 25,000,000", () => {
    // ㉯가 (가목 − 나목)의 가목이므로 게이트만이 아니라 증여재산가액 자체가 바뀐다.
    const BASE = {
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 10_000,
      preIssueShares: 100_000,
      newSharePrice: 5_000,
      issuedShares: 50_000,
      forfeitedShares: 10_000,
    } as const;

    expect(calcCapitalIncreaseGift(BASE).deemedGiftValue).toBe(33_330_000); // 실제 ㉯ 8,333
    const equal = calcCapitalIncreaseGift({ ...BASE, equalIssueShares: 100_000 });
    expect(equal.applied).toBe(true); // 균등 ㉯ 7,500 · 차액 2,500 ≥ 기준 2,250
    expect(equal.deemedGiftValue).toBe(25_000_000);
  });

  it("[CI-S39-2GA-SCOPE] 저가 **가목**과 **고가**는 실제 증가주식수 기준 그대로다", () => {
    const COMMON = { preIssuePrice: 10_000, preIssueShares: 100_000, issuedShares: 50_000, forfeitedShares: 10_000 } as const;
    // 저가 가목(§29②1호 가목) — 「증자에 의하여 증가한 주식수」
    const lowGa = { ...COMMON, direction: "low", subType: "forfeited_realloc", newSharePrice: 5_000 } as const;
    expect(calcCapitalIncreaseGift(lowGa).deemedGiftValue).toBe(
      calcCapitalIncreaseGift({ ...lowGa, equalIssueShares: 100_000 }).deemedGiftValue,
    );
    // 고가(§29②3호 나목) — 같은 이유로 불변
    const high = { ...COMMON, direction: "high", subType: "forfeited_realloc", newSharePrice: 20_000 } as const;
    expect(calcCapitalIncreaseGift(high).deemedGiftValue).toBe(
      calcCapitalIncreaseGift({ ...high, equalIssueShares: 100_000 }).deemedGiftValue,
    );
  });
});

describe("§29②2호 가목 — cap-table 30% 기준선을 균등증자 가정 ㉯로", () => {
  // cap-table은 `entitledShares`(균등 배정 신주수)를 이미 받는다 ⇒ 새 입력 없이 Σ로 구한다.
  const LOW_FORFEIT: CapitalIncreaseAllocationInput = {
    direction: "low",
    preIssuePrice: 12_000,
    newSharePrice: 7_000,
    shareholders: [
      { id: "a", name: "갑", preShares: 80_000, entitledShares: 80_000, subscribedShares: 0 },
      { id: "b", name: "을", preShares: 20_000, entitledShares: 20_000, subscribedShares: 20_000, relatedTo: ["a"] },
    ],
  };

  it("[CT-S39-2GA-GATE] 실제 ㉯ 11,166이면 통과하던 게이트가 균등 ㉯ 9,500에서는 막힌다 — 66,640,000 → 0", () => {
    const r = calcCapitalIncreaseAllocation(LOW_FORFEIT);
    // 금액 축(equity-delta)은 손대지 않는다 — 검증내역 ㉯는 실제 증가 기준 그대로다.
    expect(r.perShareAfter).toBe(11_166);
    expect(r.perBeneficiary.find((b) => b.beneficiaryId === "b")?.total ?? 0).toBe(0);
  });

  it("[CT-S39-2GA-HIGH] 고가는 실제 ㉯ 기준선을 유지한다 (§29②4호 ← 제3호 나목)", () => {
    // 고가는 포기자(갑)가 수증자다 ⇒ 특수관계를 **양방향**으로 둬야 §39①2호 요건이 선다.
    const high: CapitalIncreaseAllocationInput = {
      direction: "high",
      preIssuePrice: 7_000,
      newSharePrice: 12_000,
      shareholders: [
        { id: "a", name: "갑", preShares: 80_000, entitledShares: 80_000, subscribedShares: 0, relatedTo: ["b"] },
        { id: "b", name: "을", preShares: 20_000, entitledShares: 20_000, subscribedShares: 20_000, relatedTo: ["a"] },
      ],
    };
    // ⚠️ `perShareAfter`(검증내역 값)는 기준선 뮤테이션에 **반응하지 않는 대리 지표**다.
    //    게이트 **결과**를 단언해야 범위 한정이 실제로 고정된다.
    //    실제 ㉯ 7,833 · 차액 4,167 ≥ 30% 기준 2,349 → 과세
    //    균등 ㉯ 9,500 · 차액 2,500 <  30% 기준 2,850 → 만약 균등으로 바꾸면 0으로 뒤집힌다
    const r = calcCapitalIncreaseAllocation(high);
    expect(r.perShareAfter).toBe(7_833);
    // 고가에서는 포기자(갑)가 수증자다 — 80,000주×7,833 − 560,000,000 = 66,640,000
    expect(r.perBeneficiary.find((b) => b.beneficiaryId === "a")?.total ?? 0).toBe(66_640_000);
  });
});
