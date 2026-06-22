/**
 * A-6 anchor — 이미지7 재현 (설계 §A-6 / 계획서 §10)
 *
 * 법령: 상증령 §46①2호 동시증여 공제 안분 / 상증법 §69 신고세액공제
 *
 * 시나리오:
 *   건0: 부(father) → 성년 60M / 기한 내 신고
 *   건1: 조부(grandparent) → 성년 100M / 기한 내 신고
 *   공제그룹: 둘 다 lineal_ascendant_adult (동일 그룹 → §46①2호 안분)
 *   동일인그룹: A(부) ≠ B(조부) → STEP 1 병합 없음
 *
 * 건0 기대값 (원단위 anchor):
 *   공제 = floor(50M × 60M / (60M+100M)) = floor(50M × 60/160) = 18,750,000
 *   과세표준 = 60M - 18,750,000 = 41,250,000
 *   산출세액 = 41,250,000 × 10% = 4,125,000 (1억 이하 구간)
 *   신고세액공제 = floor(4,125,000 × 3%) = 123,750
 *   납부세액 = 4,125,000 - 123,750 = 4,001,250
 *
 * Pre-Do probe (_probe-simultaneous-image7.test.ts)에서 baseline 확정된 값.
 */

import { describe, it, expect } from "vitest";
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 건0: 부(father) → 성년 60M / 기한 내 신고 */
const gift0_father60M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [{ id: "g0", category: "cash", name: "현금", marketValue: 60_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
};

/** 건1: 조부(grandparent) → 성년 100M / 기한 내 신고 */
const gift1_grandparent100M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "grandparent",
  giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 100_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: true,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
};

describe("A-6 — 이미지7 재현 (건0 부 60M + 건1 조부 100M, 기한 내 신고)", () => {
  it("결과 배열 길이 = 2 (동일인 그룹 A≠B → 병합 없음)", () => {
    const results = calcSimultaneousGifts([gift0_father60M, gift1_grandparent100M]);
    expect(results).toHaveLength(2);
  });

  it("건0 공제·과세표준·산출세액·신고세액공제·납부세액 원단위 일치", () => {
    const [r0] = calcSimultaneousGifts([gift0_father60M, gift1_grandparent100M]);

    // 공제 = floor(50M × 60M / 160M) = 18,750,000
    expect(r0.totalDeduction).toBe(18_750_000);
    // 과세표준 = 60M - 18,750,000 = 41,250,000
    expect(r0.taxBase).toBe(41_250_000);
    // 산출세액 = 41,250,000 × 10% = 4,125,000
    expect(r0.computedTax).toBe(4_125_000);
    // 납부세액 = 4,125,000 - floor(4,125,000 × 3%) = 4,125,000 - 123,750 = 4,001,250
    expect(r0.finalTax).toBe(4_001_250);
  });

  it("건0 netCurrentGiftValue echo = 60,000,000 (비과세·채무 없음)", () => {
    const [r0] = calcSimultaneousGifts([gift0_father60M, gift1_grandparent100M]);
    expect(r0.netCurrentGiftValue).toBe(60_000_000);
  });

  it("건1(조부) 세대생략 할증 > 0", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father60M, gift1_grandparent100M]);
    expect(r1.additionalGenerationSkipSurcharge).toBeGreaterThan(0);
  });
});
