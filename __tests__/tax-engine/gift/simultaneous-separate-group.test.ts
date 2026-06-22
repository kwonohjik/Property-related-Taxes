/**
 * A-5 anchor — 완전 별도 그룹 (직계존속 부모 + 직계비속) → 공제 그룹 다름, 안분 없음
 *
 * 법령: 상증법 §53 증여재산공제 (관계별 독립 한도)
 *       상증령 §46①2호 동시증여 안분 — 같은 donorRelation 그룹만 적용
 *
 * 건0: 부(father) → 성년 100M / donorRelation=lineal_ascendant_adult / 공제한도 50M
 *   → 공제 50M 전액 (안분 없음, 단건 경로)
 *   → 과세표준 50M / 산출세액 5,000,000 (50M×10%)
 *
 * 건1: 자녀(lineal_descendant) → 80M / donorRelation=lineal_descendant / 공제한도 50M
 *   → 공제 50M 전액 (안분 없음)
 *   → 과세표준 30M / 산출세액 3,000,000 (30M×10%)
 */

import { describe, it, expect } from "vitest";
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const gift0_father100M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [{ id: "g0", category: "cash", name: "현금", marketValue: 100_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

const gift1_descendant80M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_descendant",
  donor: "lineal_descendant",
  giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 80_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_descendant" },
  creditInput: { isFiledOnTime: false },
};

describe("A-5 — 완전 별도 그룹 (직계존속 + 직계비속) → 안분 없음", () => {
  it("결과 배열 길이 = 2 (병합 없음)", () => {
    const results = calcSimultaneousGifts([gift0_father100M, gift1_descendant80M]);
    expect(results).toHaveLength(2);
  });

  it("건0(부) 공제 = 50M 전액 (안분 없음, 단건 경로)", () => {
    const [r0] = calcSimultaneousGifts([gift0_father100M, gift1_descendant80M]);
    expect(r0.totalDeduction).toBe(50_000_000);
  });

  it("건1(자녀) 공제 = 50M 전액 (안분 없음)", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father100M, gift1_descendant80M]);
    expect(r1.totalDeduction).toBe(50_000_000);
  });

  it("건0 과세표준 50M / 산출세액 5,000,000", () => {
    const [r0] = calcSimultaneousGifts([gift0_father100M, gift1_descendant80M]);
    expect(r0.taxBase).toBe(50_000_000);
    expect(r0.computedTax).toBe(5_000_000);
  });

  it("건1 과세표준 30M / 산출세액 3,000,000", () => {
    const [, r1] = calcSimultaneousGifts([gift0_father100M, gift1_descendant80M]);
    expect(r1.taxBase).toBe(30_000_000);
    expect(r1.computedTax).toBe(3_000_000);
  });
});
