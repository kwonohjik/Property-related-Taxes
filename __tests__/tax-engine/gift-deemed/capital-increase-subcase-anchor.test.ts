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

/**
 * [CI-S39-NR-3E-BOUNDARY] — 「상증령」§29②2호의 **3억원 arm** 경계.
 *
 * 법문 verbatim: "…차감한 가액이 가목의 규정에 의하여 계산한 가액의 100분의 30 이상**이거나**
 *  그 가액에 다목의 규정에 의한 실권주수를 곱하여 계산한 가액이 **3억원 이상**인 경우의 당해 금액"
 *  ⇒ 30%·3억은 독립 OR 2항이므로, 비율이 미달해도 금액이 3억을 넘으면 과세된다.
 *
 * ⚠️ 이 anchor 이전에는 3억 arm의 구별력이 **0**이었다(2026-09-21 리뷰 뮤테이션 실측):
 *    · [CI-LOW-NR]     — 차액 3,333 ≥ 30%(2,499) 충족이라 **비율 arm**으로 통과 → 3억 arm 무관
 *    · [CI-LOW-NR-FAIL] — 이익 13,330,000이라 3억 arm이 있으나 없으나 미적용
 *    ⇒ `base >= ABSOLUTE_THRESHOLD` 항을 통째로 지우거나 상수를 10억으로 바꿔도 전건 초록이었고,
 *       회귀 시 증여재산가액이 통째로 0이 된다.
 *
 * 두 케이스 모두 차액 133,333 < 30%(279,999)로 **비율 arm은 미충족** — 3억 arm만이 분기점이다.
 * 실권주 1주 차이로 과세/미과세가 갈린다.
 *
 * 📌 2단계(§29②2호 «다목» 3항곱 가중 적용) 착수 시 base 산식이 바뀌므로 이 경계값은 **재산정 대상**이다.
 *    그때 값이 바뀌는 것은 회귀가 아니라 의도된 변경이다.
 */
describe("[CI-S39-NR-3E-BOUNDARY] §39①1호 나목 — 3억원 arm 경계 (비율 arm 미충족)", () => {
  const mk = (forfeitedShares: number) =>
    calcCapitalIncreaseGift({
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 1_000_000,
      preIssueShares: 100_000,
      newSharePrice: 800_000,
      issuedShares: 50_000,
      forfeitedShares,
    });

  it("실권주 2,251주 → 300,132,583 ≥ 3억 → 과세 (3억 arm이 «유일한» 통과 사유)", () => {
    const r = mk(2_251);
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(300_132_583);
  });

  it("실권주 2,250주 → 299,999,250 < 3억 → 미과세 (경계 짝, 1주 차이)", () => {
    const r = mk(2_250);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toContain("기준금액");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2-A — 「상증령」§29②2호 다목 · §29②3호 다목 **가중 적용** (리뷰 J-1·J-2, 1-A 입력 축 동반)
//
// 종전에는 두 호의 **다목이 통째로 빠져** 이익 귀속 주식수로 `forfeitedShares`(원시 실권주수)를
// 그대로 썼다. 다목은 곱셈 인자이고 그 값은 항상 실권주수 이하이므로 **과다과세** 방향이며,
// §29②2호의 3억 게이트도 「그 가액에 **다목의 규정에 의한 실권주수**를 곱하여 계산한 가액」이라
// 가중 후 금액으로 판정해야 한다 ⇒ 미과세 건이 과세로 뒤집히기도 했다.
//
// ⚠️ 두 인자가 **모두 입력된 경우에만** 가중한다. 미입력은 종전 동작(`forfeitedShares`)을 유지해
//    기존 anchor·API 호출자를 보존한다(계획서 `gift-capital-increase-section39.plan.md:171`).
//    입력 필수화는 ⑧ `gift-deemed-validate.ts`가 UI 경로에서 담당한다.
// ─────────────────────────────────────────────────────────────────────────────

describe("§29②2호 다목 — 저가 나목 3항 곱 (실권주총수 × 증자후 지분비율 × 특수관계인실권주수÷실권주총수)", () => {
  // 실권주 총수가 약분되어 **증자후 지분비율 × 특수관계인 실권주수**로 축약된다.
  const BASE = {
    direction: "low",
    subType: "no_realloc",
    preIssuePrice: 10_000,
    preIssueShares: 100_000,
    newSharePrice: 5_000,
    issuedShares: 50_000,
    forfeitedShares: 30_000,
  } as const;

  it("[CI-S39-2NA-DANMOK] 지분비율 1/2 · 특수관계인 실권주 3만 → 귀속 1.5만 → 49,995,000 (종전 99,990,000의 1/2)", () => {
    // ㉯ = (10,000×100,000 + 5,000×50,000) ÷ 150,000 = 8,333 · 차액 3,333
    // 다목 = 30,000 × 1/2 × (30,000÷30,000) = 15,000 ⇒ 3,333 × 15,000
    const weighted = calcCapitalIncreaseGift({
      ...BASE,
      relatedAcquiredShares: 30_000,
      postIssueSubscriberRatio: { numer: 1, denom: 2 },
    });
    expect(weighted.applied).toBe(true);
    expect(weighted.deemedGiftValue).toBe(49_995_000);

    // 같은 사실관계에서 두 인자를 빼면 종전 동작 — 정확히 2.0배
    const legacy = calcCapitalIncreaseGift(BASE);
    expect(legacy.deemedGiftValue).toBe(99_990_000);
    expect(legacy.deemedGiftValue).toBe(weighted.deemedGiftValue * 2);
  });

  it("[CI-S39-2NA-GATE] 3억 게이트가 **가중 후** 금액으로 판정된다 — 1,499,940,000 → 0원 반전", () => {
    // ㉯ = (100,000×1,000,000 + 90,000×200,000) ÷ 1,200,000 = 98,333 · 차액 8,333
    // 30% 기준선 = 29,499 > 8,333 ⇒ 비율 arm 미충족. 3억 arm만 남는다.
    const GATE = {
      direction: "low",
      subType: "no_realloc",
      preIssuePrice: 100_000,
      preIssueShares: 1_000_000,
      newSharePrice: 90_000,
      issuedShares: 200_000,
      forfeitedShares: 180_000,
    } as const;

    // 종전: 8,333 × 180,000 = 1,499,940,000 ≥ 3억 → 과세
    const legacy = calcCapitalIncreaseGift(GATE);
    expect(legacy.applied).toBe(true);
    expect(legacy.deemedGiftValue).toBe(1_499_940_000);

    // 법정: 다목 = 180,000 × 1/10 = 18,000 ⇒ 8,333 × 18,000 = 149,994,000 < 3억 → **미과세**
    const weighted = calcCapitalIncreaseGift({
      ...GATE,
      relatedAcquiredShares: 180_000,
      postIssueSubscriberRatio: { numer: 1, denom: 10 },
    });
    expect(weighted.applied).toBe(false);
    expect(weighted.deemedGiftValue).toBe(0);
  });
});

describe("§29②3호 다목 — 고가 가목 비율 가중 (포기주주 실권주수 × 특수관계인 인수실권주수÷실권주총수)", () => {
  const BASE = {
    direction: "high",
    subType: "forfeited_realloc",
    preIssuePrice: 10_000,
    preIssueShares: 100_000,
    newSharePrice: 20_000,
    issuedShares: 50_000,
    forfeitedShares: 30_000,
  } as const;

  it("[CI-S39-3GA-DANMOK] 특수관계인 인수 1만 ÷ 실권주총수 3만 → 200,010,000 × 1/3 = 66,670,000", () => {
    // ㉯ = (10,000×100,000 + 20,000×50,000) ÷ 150,000 = 13,333 · 차액 6,667
    const weighted = calcCapitalIncreaseGift({
      ...BASE,
      relatedAcquiredShares: 10_000,
      ratioDenomShares: 30_000,
    });
    expect(weighted.applied).toBe(true);
    expect(weighted.deemedGiftValue).toBe(66_670_000);

    // 두 인자를 빼면 [CI-HIGH-A]와 같은 종전 동작(가중 1.0)
    expect(calcCapitalIncreaseGift(BASE).deemedGiftValue).toBe(200_010_000);
  });

  it("[CI-S39-3GA-NOGATE] §29②3호엔 기준금액이 없다 — 가중 후 3억 미만이어도 과세된다", () => {
    const weighted = calcCapitalIncreaseGift({
      ...BASE,
      relatedAcquiredShares: 1_000,
      ratioDenomShares: 30_000,
    });
    // 6,667 × 30,000 × (1,000÷30,000) = 6,667,000 — 3억에 한참 못 미쳐도 applied
    expect(weighted.deemedGiftValue).toBe(6_667_000);
    expect(weighted.applied).toBe(true);
  });
});
