import { describe, it, expect } from "vitest";
import { calcCapitalIncreaseGift } from "@/lib/tax-engine/gift-deemed/capital-increase";
import { calcCapitalIncreaseAllocation } from "@/lib/tax-engine/gift-deemed/capital-increase-allocation";
import type { CapitalIncreaseAllocationInput } from "@/lib/tax-engine/gift-deemed/types";

/**
 * 2-E — 「100분의 30」 임계를 **절사 없이** 판정 (리뷰 #34·#73)
 *
 * 「상증령」§29②2호 — "가목의 규정에 의하여 계산한 가액에서 나목의 규정에 의한 가액을 차감한
 *   가액이 **가목의 규정에 의하여 계산한 가액의 100분의 30 이상**이거나 …"
 * 같은 항 4호 — "… **제3호 나목의 가액의 100분의 30 이상**인 경우에 한한다"
 *
 * 종전 구현은 `safeMultiplyThenDivide(㉯, 30, 100)`으로 임계를 만들었는데 이 함수는
 * `Math.floor`로 **절사**한다(`tax-utils.ts:200`). 비교가 `>=`(이상)이므로 절사는
 * 임계를 **낮추는 쪽으로만** 작동하고, 그래서 오차 방향이 **항상 과다과세**다.
 *
 * ㉯가 10의 배수가 아니면 `㉯ × 0.3`은 소수부를 가지므로 **㉯마다 경계점이 정확히 1점씩**
 * 존재한다. 그 1점에서 게이트가 all-or-nothing이라 오차는 1원이 아니라 **증여재산가액 전액**이다.
 *
 * ⇒ 세 호출지점을 모두 절사 없는 교차곱(`차액 × 100 ≥ ㉯ × 30`)으로 바꾼다.
 */

// 경계 구성: ㉯ = 10,001 · 차액 3,000 · 법정 임계 3,000.3 · 절사 임계 3,000
//   ⇒ 3,000 ≥ 3,000(절사) = 통과(오답) / 3,000 < 3,000.3(법정) = 미통과(정답)
//   3억 arm도 150,000,000 < 3억이라 불성립이므로 **비율 arm 단독**으로 결론이 갈린다.
const LOW_BOUNDARY = {
  direction: "low",
  subType: "no_realloc",
  preIssuePrice: 13_001,
  preIssueShares: 1_000_000,
  newSharePrice: 7_001,
  issuedShares: 1_000_000,
  forfeitedShares: 50_000,
} as const;

describe("§29②2호 — 저가 나목 30% 임계 절사", () => {
  it("[CI-S39-RATIO-FLOOR-LOW] 경계점: 차액 3,000 < 임계 3,000.3 → 미과세", () => {
    const r = calcCapitalIncreaseGift(LOW_BOUNDARY);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
    expect(r.exclusionReason).toBe("이익이 기준금액(증자후가 30%·3억) 미만");
  });

  it("[CI-S39-RATIO-EXACT-LOW] 긍정 짝 — ㉯ 10,000·차액 3,000 = 정확히 30% → 과세 유지", () => {
    // 「이상」이므로 등호는 통과한다. 교차곱 전환이 `>`로 조여지는 것을 막는 짝.
    const r = calcCapitalIncreaseGift({
      ...LOW_BOUNDARY,
      preIssuePrice: 13_000,
      newSharePrice: 7_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(150_000_000);
  });

  it("[CI-S39-RATIO-OVER-LOW] 긍정 짝 — ㉯ 10,001·차액 3,001 > 임계 → 과세 유지", () => {
    // ㉯ = floor((13,002 + 7,000) / 2) = 10,001 · 차액 3,001 ≥ 3,000.3
    const r = calcCapitalIncreaseGift({ ...LOW_BOUNDARY, preIssuePrice: 13_002, newSharePrice: 7_000 });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(150_050_000);
  });
});

// 고가 동형 — §29②4호. 분자/분모를 같게 둬 비율 가중 1.0으로 고정하고 임계 축만 관측한다.
const HIGH_BOUNDARY = {
  direction: "high",
  subType: "no_realloc",
  preIssuePrice: 7_001,
  preIssueShares: 1_000_000,
  newSharePrice: 13_001,
  issuedShares: 1_000_000,
  forfeitedShares: 50_000,
  relatedAcquiredShares: 50_000,
  ratioDenomShares: 50_000,
} as const;

describe("§29②4호 — 고가 나목 30% 임계 절사", () => {
  it("[CI-S39-RATIO-FLOOR-HIGH] 경계점: 차액 3,000 < 임계 3,000.3 → 미과세", () => {
    const r = calcCapitalIncreaseGift(HIGH_BOUNDARY);
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[CI-S39-RATIO-EXACT-HIGH] 긍정 짝 — ㉯ 10,000·차액 3,000 = 정확히 30% → 과세 유지", () => {
    const r = calcCapitalIncreaseGift({
      ...HIGH_BOUNDARY,
      preIssuePrice: 7_000,
      newSharePrice: 13_000,
    });
    expect(r.applied).toBe(true);
    expect(r.deemedGiftValue).toBe(150_000_000);
  });
});

// cap-table 동형 — 2-B에서 신설한 균등증자 기준선(`perShareForRatio`)에 같은 절사가 걸린다.
//   Σentitled = preTotal이라 기준선 ㉯ = 10,001, 차액 3,000, 법정 임계 3,000.3.
//   수증자 이익 282,600,000 < 3억이라 비율 arm 단독으로 결론이 갈린다.
function captableBoundary(pre: number, priceIn: number): CapitalIncreaseAllocationInput {
  return {
    direction: "low",
    preIssuePrice: pre,
    newSharePrice: priceIn,
    shareholders: [
      { id: "d", name: "포기자", preShares: 100_000, entitledShares: 100_000, subscribedShares: 0 },
      {
        id: "b",
        name: "인수자",
        preShares: 900_000,
        entitledShares: 900_000,
        subscribedShares: 900_000,
        relatedTo: ["d"],
      },
    ],
  };
}

describe("cap-table — 균등증자 기준선 30% 임계 절사", () => {
  it("[CT-S39-RATIO-FLOOR] 경계점: 차액 3,000 < 임계 3,000.3 → 미과세", () => {
    const r = calcCapitalIncreaseAllocation(captableBoundary(13_001, 7_001));
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "b")?.total).toBe(0);
  });

  it("[CT-S39-RATIO-EXACT] 긍정 짝 — 기준선 10,000·차액 3,000 = 정확히 30% → 과세 유지", () => {
    const r = calcCapitalIncreaseAllocation(captableBoundary(13_000, 7_000));
    expect(r.perBeneficiary.find((p) => p.beneficiaryId === "b")?.total).toBeGreaterThan(0);
  });
});
