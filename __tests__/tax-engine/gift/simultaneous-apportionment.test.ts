/**
 * A-1, A-3 anchor — 부모 130M + 조부모 70M 동시증여 안분
 *
 * 법령: 상증령 §46①2호 동시증여 공제 안분
 *
 * A-1: 건0 부모 130M + 건1 조부모 70M (직계존속 성년, priorUsed=0)
 *   건0 공제 = floor(50M × 130M / (130M+70M)) = floor(32,500,000) = 32,500,000
 *   건1 공제 = floor(50M × 70M / (130M+70M)) = floor(17,500,000) = 17,500,000
 *   floor 잔액: 건0 + 건1 = 50,000,000 ≤ 한도 50,000,000 (정합)
 *
 * A-3: Σ finalTax = 건0.finalTax + 건1.finalTax
 */

import { describe, it, expect } from "vitest";
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

/** 건0: 부(father) → 성년 130M */
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

/** 건1: 조부(grandparent) → 성년 70M */
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

describe("A-1 — 부모 130M + 조부모 70M 동시증여 공제 안분 (상증령 §46①2호)", () => {
  it("건0 공제 = 32,500,000 / 건1 공제 = 17,500,000", () => {
    const [r0, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    expect(r0.totalDeduction).toBe(32_500_000);
    expect(r1.totalDeduction).toBe(17_500_000);
  });

  it("공제 합계 ≤ 한도 50,000,000 (floor 잔액 정합)", () => {
    const [r0, r1] = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    expect(r0.totalDeduction + r1.totalDeduction).toBeLessThanOrEqual(50_000_000);
  });
});

describe("A-3 — 수증자 총 납부세액 합계", () => {
  it("Σ finalTax = 건0.finalTax + 건1.finalTax", () => {
    const results = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    const [r0, r1] = results;
    const total = results.reduce((s, r) => s + r.finalTax, 0);
    expect(total).toBe(r0.finalTax + r1.finalTax);
    // 값이 0이 아님을 보장 (실제 납부 발생)
    expect(total).toBeGreaterThan(0);
  });

  it("결과 배열 길이 = 입력 건 수(2)", () => {
    const results = calcSimultaneousGifts([gift0_father130M, gift1_grandparent70M]);
    expect(results).toHaveLength(2);
  });
});
