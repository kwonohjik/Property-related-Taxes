/**
 * A-4 anchor — 동일인 합산 가드 (부 130M + 모 50M → 그룹 A 합산)
 *
 * 법령: 상증법 §47② 동일인(직계존속 + 그 배우자) 합산
 *
 * 부(father)와 모(mother)는 getDonorGroup → "A" (동일 그룹)
 * → STEP 1 가드 발동 → 1건 180M 합산
 * → 결과 배열 길이 1
 * → 합산 후 공제 50M / 과세표준 130M / 산출세액 16,000,000 (5억 이하 20% − 1천만 누진공제)
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

const gift1_mother50M: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "mother",
  giftItems: [{ id: "g1", category: "cash", name: "현금", marketValue: 50_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("A-4 — 동일인 합산 가드 (부 130M + 모 50M = 그룹 A)", () => {
  it("결과 배열 길이 = 1 (동일 그룹 병합 후)", () => {
    const results = calcSimultaneousGifts([gift0_father130M, gift1_mother50M]);
    expect(results).toHaveLength(1);
  });

  it("합산 과세가액 = 180M / 공제 = 50M / 과세표준 = 130M", () => {
    const [r0] = calcSimultaneousGifts([gift0_father130M, gift1_mother50M]);
    expect(r0.grossGiftValue).toBe(180_000_000);
    expect(r0.totalDeduction).toBe(50_000_000);
    expect(r0.taxBase).toBe(130_000_000);
  });

  it("산출세액 = 16,000,000 (130M × 20% − 1천만 누진공제)", () => {
    // 130,000,000 × 20% = 26,000,000 − 10,000,000(누진공제) = 16,000,000
    const [r0] = calcSimultaneousGifts([gift0_father130M, gift1_mother50M]);
    expect(r0.computedTax).toBe(16_000_000);
  });

  it("warnings에 동일인 합산 안내 포함", () => {
    const [r0] = calcSimultaneousGifts([gift0_father130M, gift1_mother50M]);
    expect(r0.warnings.some((w) => w.includes("동일인") || w.includes("합산"))).toBe(true);
  });
});
