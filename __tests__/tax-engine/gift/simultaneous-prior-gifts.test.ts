/**
 * A-7 anchor — 사전증여 합산 포함 (건1 조부모 건에 priorGifts 있는 경우)
 *
 * 법령: 상증법 §47② 동일인 10년 합산
 *
 * 건0: 부(father) → 성년 130M / priorGifts 없음
 * 건1: 조부(grandparent) → 성년 70M + 3년 전 조부모 30M 사전증여
 *
 * 건1 §47 합산:
 *   aggregatedGiftValue = 70M(금번) + 30M(사전) = 100M
 *   공제 = 17,500,000 (§46①2호 안분 — 금번 70M 기준 안분)
 *   과세표준 = 100M - 17,500,000 = 82,500,000
 *   산출세액 = 82,500,000 × 10% = 8,250,000 (1억 이하 구간)
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

/** 건1: 조부(grandparent) 70M + 3년 전 조부 30M 사전증여 */
const gift1_grandparent70M_withPrior: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "grandparent",
  giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 70_000_000 }],
  priorGiftsWithin10Years: [
    {
      giftDate: "2021-05-01",  // 3년 전 — 10년 이내
      giftAmount: 30_000_000,
      donor: "grandparent",
      giftTaxPaid: 0,
      giftTaxBase: 30_000_000,
      isHeir: false,
    },
  ],
  isGenerationSkip: true,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("A-7 — 사전증여 합산 포함 (건1 조부모 70M + 3년 전 30M)", () => {
  it("결과 배열 길이 = 2", () => {
    const results = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M_withPrior]);
    expect(results).toHaveLength(2);
  });

  it("건1 §47 합산 과세가액 = 100M (70M + 30M)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M_withPrior]);
    // aggregatedGiftValue = netCurrentGiftValue(70M) + priorTotal(30M)
    expect(r1.aggregatedGiftValue).toBe(100_000_000);
  });

  it("건1 안분 공제는 금번 순 과세가액 70M 기준으로 계산됨", () => {
    // 공제 = floor(50M × 70M / (130M+70M)) = 17,500,000
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M_withPrior]);
    expect(r1.totalDeduction).toBe(17_500_000);
  });

  it("건1 과세표준 = 82,500,000 (합산 100M − 공제 17.5M)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M_withPrior]);
    expect(r1.taxBase).toBe(82_500_000);
  });

  it("건1 산출세액 = 8,250,000 (82.5M × 10%)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M_withPrior]);
    expect(r1.computedTax).toBe(8_250_000);
  });
});
