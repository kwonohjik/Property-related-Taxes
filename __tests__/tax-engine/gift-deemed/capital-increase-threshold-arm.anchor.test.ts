import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";

/**
 * 「상속세 및 증여세법」§39 리뷰 **6단계** — 기준금액 **3억원 arm**의 안전망.
 *
 * 「상증령」§29②4호 — 「… (그 금액이 **3억원 이상인 경우** 또는 제3호 가목의 가액에서 제3호
 * 나목의 가액을 차감한 금액이 제3호 나목의 가액의 100분의 30 이상인 경우에 한한다)」
 *
 * 게이트는 **OR**다. 두 arm 중 하나만 충족해도 과세인데, 저장소의 고가 픽스처가 전부
 * 「30% 충족」쪽이라 **3억 arm은 지워도 아무 테스트가 빨개지지 않았다**(6단계 감사에서
 * `applied = weighted > 0 && (ratioMet || weighted >= ABSOLUTE_THRESHOLD)`의 우항을 지운
 * 뮤테이션이 5,039건 전건 통과 — A10 SURVIVED). 저가·cap-table 쪽은 1~3단계 작업으로
 * 이미 죽고 있었고, **고가 나목 하나만** 구멍으로 남아 있었다.
 *
 * ⇒ 아래 짝은 **30%를 일부러 미충족**시켜 3억 arm **단독으로** 결론을 가르게 한다.
 *
 * 픽스처(법문 정합): ㉮ 10,000 · 증자전 10,000,000주 · 인수가 12,000 ·
 *   실제 증가 5,000,000주(균등 5,500,000 중 실권 500,000 미배정) · 분모 5,500,000
 *   ⇒ ㉯ 10,666 · 차액 1,334 · 30% 기준선 3,199.8 ⇒ **비율 미충족**
 */
const base = {
  direction: "high",
  subType: "no_realloc",
  preIssuePrice: 10_000,
  preIssueShares: 10_000_000,
  newSharePrice: 12_000,
  issuedShares: 5_000_000,
  relatedAcquiredShares: 4_400_000,
  ratioDenomShares: 5_500_000,
} as const;

describe("§29②4호 기준금액 — 3억원 arm 단독 구별력 (고가 나목)", () => {
  it("[CI-HIGH-ABS-OVER] 비율 미충족이어도 가중이익 3억 이상이면 과세 — 533,600,000", () => {
    const r = calcCapitalIncreaseGift({ ...base, forfeitedShares: 500_000 });
    // 1,334 × 500,000 = 667,000,000 → × (4,400,000 ÷ 5,500,000) = 533,600,000
    expect(r.deemedGiftValue).toBe(533_600_000);
    expect(r.applied).toBe(true);
    // 🔑 이 건이 과세인 유일한 근거가 3억 arm이다 — 비율 arm은 미충족이다.
    //    (arm을 지우면 이 단언이 0으로 뒤집힌다. 그것이 이 anchor의 존재 이유다.)
    expect(r.exclusionReason).toBeUndefined();
  });

  it("[CI-HIGH-ABS-UNDER] 대칭 — 비율 미충족 + 3억 **미만**이면 미과세", () => {
    // 실권주만 500,000 → 200,000으로 줄인다. 다른 인자는 그대로라 비율 arm도 그대로 미충족이다.
    const r = calcCapitalIncreaseGift({ ...base, forfeitedShares: 200_000 });
    // 1,334 × 200,000 = 266,800,000 → × 0.8 = 213,440,000 < 3억
    expect(r.deemedGiftValue).toBe(0);
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toBe("이익이 기준금액(증자후가 30%·3억) 미만");
  });

  it("[CI-HIGH-RATIO-ONLY] 대조 — 비율 arm **단독**으로도 과세된다 (3억 미만인데 과세)", () => {
    // ⚠️ 이 단언이 없으면 위 두 건이 「30%로 갈린 것」인지 「3억으로 갈린 것」인지 알 수 없다.
    //    여기서는 반대로 **3억 미만**이면서 비율만 충족시켜, 두 arm이 서로 독립임을 못 박는다.
    //    인수가 16,000: ㉯ = (10,000×10,000,000 + 16,000×5,000,000) ÷ 15,000,000 = 12,000
    //    차액 4,000 ≥ 12,000 × 30% = 3,600 ⇒ 비율 충족
    //    이익 = 4,000 × 50,000 × (4,400,000 ÷ 5,500,000) = 160,000,000 < 3억
    const r = calcCapitalIncreaseGift({ ...base, newSharePrice: 16_000, forfeitedShares: 50_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(160_000_000);
  });
});
