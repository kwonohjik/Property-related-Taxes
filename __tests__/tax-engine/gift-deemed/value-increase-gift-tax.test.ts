/**
 * §42의3 증여세 통합 anchor — 증여재산가액 → calcGiftTax 산출세액(computedTax).
 * anchor 대상 = computedTax(산출세액 ⑦, §69 신고세액공제 전). 세율 §56, 공제 §53.
 * §53 공제는 DonorRelation enum이 결정(isMinorDonee 아님 — 그건 §57② 세대생략 할증 전용):
 *   부모→미성년 자녀 = lineal_ascendant_minor(2천만) / 부모→성년 자녀 = lineal_ascendant_adult(5천만).
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

type DonorRel = "lineal_ascendant_minor" | "lineal_ascendant_adult";

// 부모(직계존속) → 자녀(수증자) 증여. §42의3 가치증가이익을 이미 평가된 금액(category:"other")으로 주입.
function mkInput(marketValue: number, donorRelation: DonorRel): GiftTaxInput {
  return {
    giftDate: "2025-01-01",
    donorRelation,
    donor: "father",
    giftItems: [{ id: "vi", category: "other", name: "§42의3 가치증가이익", marketValue }],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false, // §57② 세대생략 할증 전용 — 직계증여라 false (공제와 무관)
    deductionInput: { donorRelation },
    creditInput: { isFiledOnTime: true },
  };
}

describe("§42의3 증여세 통합 anchor (calcGiftTax computedTax)", () => {
  it("[VI-GT-CASE1] 18.7억 + 미성년(2천만) → computedTax 5.8억 (PDF 사례1)", () => {
    const r = calcGiftTax(mkInput(1_870_000_000, "lineal_ascendant_minor"));
    expect(r.totalDeduction).toBe(20_000_000);
    expect(r.taxBase).toBe(1_850_000_000);
    expect(r.computedTax).toBe(580_000_000); // floor(18.5억×40%)−1.6억
  });

  it("[VI-GT-CASE2] 25억 + 미성년(2천만) → computedTax 8.32억 (PDF 8.3억)", () => {
    const r = calcGiftTax(mkInput(2_500_000_000, "lineal_ascendant_minor"));
    expect(r.totalDeduction).toBe(20_000_000);
    expect(r.taxBase).toBe(2_480_000_000);
    expect(r.computedTax).toBe(832_000_000); // floor(24.8억×40%)−1.6억
  });

  it("[VI-GT-CASE3] 90억 + 성년(5천만) → computedTax 40.15억 (PDF 40억)", () => {
    const r = calcGiftTax(mkInput(9_000_000_000, "lineal_ascendant_adult"));
    expect(r.totalDeduction).toBe(50_000_000);
    expect(r.taxBase).toBe(8_950_000_000);
    expect(r.computedTax).toBe(4_015_000_000); // floor(89.5억×50%)−4.6억
  });

  it("[VI-GT-CASE4] 48억 + 미성년(2천만) → computedTax 19.3억 (PDF 사례4)", () => {
    const r = calcGiftTax(mkInput(4_800_000_000, "lineal_ascendant_minor"));
    expect(r.grossGiftValue).toBe(4_800_000_000);
    expect(r.totalDeduction).toBe(20_000_000);
    expect(r.taxBase).toBe(4_780_000_000);
    expect(r.computedTax).toBe(1_930_000_000); // floor(47.8억×50%)−4.6억
  });
});
