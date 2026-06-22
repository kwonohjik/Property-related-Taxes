/**
 * A-2 anchor — 조부모 건 §57 세대생략 30% 할증
 *
 * 법령: 상증법 §57① 세대생략 할증과세
 *
 * 건0: 부(father) → 성년 130M (할증 없음)
 * 건1: 조부(grandparent) → 성년 70M (30% 할증)
 *
 * 건1 검증:
 *   공제 = 17,500,000 (안분)
 *   과세표준 = 70,000,000 - 17,500,000 = 52,500,000
 *   산출세액 = 52,500,000 × 10% = 5,250,000 (1억 이하 구간)
 *   세대생략 할증 = 5,250,000 × 30% = 1,575,000
 *   결정세액 = 5,250,000 + 1,575,000 = 6,825,000
 */

import { describe, it, expect } from "vitest";
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const gift0_father130M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [{ id: "g0", category: "cash", name: "현금", marketValue: 130_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

const gift1_grandparent70M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "grandparent",
  giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 70_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: true,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("A-2 — 조부모 건 §57 세대생략 30% 할증 정상 반영", () => {
  it("건0(부) 세대생략 할증 = 0", () => {
    const [r0] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    expect(r0.generationSkipSurcharge).toBe(0);
    expect(r0.additionalGenerationSkipSurcharge).toBe(0);
  });

  it("건1(조부) 세대생략 할증 > 0 (30% 할증 적용)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    expect(r1.generationSkipSurcharge).toBeGreaterThan(0);
    expect(r1.additionalGenerationSkipSurcharge).toBeGreaterThan(0);
  });

  it("건1 산출세액 5,250,000 / 할증 1,575,000 / 결정세액 6,825,000 (원단위 anchor)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    // 과세표준 = 70M - 17.5M = 52.5M → 산출 = 5,250,000 (10%)
    expect(r1.taxBase).toBe(52_500_000);
    expect(r1.computedTax).toBe(5_250_000);
    // 세대생략 30% 할증 = 5,250,000 × 30% = 1,575,000
    expect(r1.additionalGenerationSkipSurcharge).toBe(1_575_000);
    // 결정세액 = 5,250,000 + 1,575,000 = 6,825,000 (신고세액공제 없음)
    expect(r1.finalTax).toBe(6_825_000);
  });
});
