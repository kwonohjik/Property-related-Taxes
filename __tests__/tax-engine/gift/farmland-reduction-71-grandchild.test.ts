/**
 * R-7 — §71 농지 감면: 손자(직계비속) 영농자녀 세대생략 시 한도 base = 산출세액 + 세대생략가산액
 *
 * 예규: 재산세과-2292(2008.8.18). 제3안 채택 —
 *   "영농자녀가 직계비속인 손자인 경우 감면되는 증여세액(1억 한도)은
 *    증여세 산출세액에 세대생략가산액을 합한 산출세액에 대하여 적용함."
 *   → §71 ㉡(한도 적용 base) = ⑦ 산출세액 + 세대생략 할증(⑫) = ⑬ 산출세액합계.
 *   부→자(세대생략 아님)는 ㉡ = ⑦ 그대로 (현행 불변).
 *
 * anchor: 조부→손자(성년), 농지 5억, 사전증여 없음.
 *   ⑦ = (5억 − 5천만 공제) 4.5억 × 20% − 1천만 = 80,000,000
 *   세대생략 할증 ⑧=⑫ = 80,000,000 × 30% = 24,000,000
 *   ㉡ = ⑬ = 80,000,000 + 24,000,000 = 104,000,000  (현행 버그: ⑦만 80,000,000)
 *   ㉣ = 104,000,000 (사전증여 없음, 단일 농지)
 *   ㉤ = min(104,000,000, 1억 잔여) = 100,000,000  (현행 버그: min(80M,1억)=80,000,000)
 *   ㉮ = 5억 × 1억/104,000,000 = 480,769,230 / ㉯ = 19,230,770
 *   결정세액 = ⑬ 104,000,000 − ㉤ 100,000,000 = 4,000,000  (현행 버그: 24,000,000)
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const grandchildFarmland: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "grandparent",
  giftItems: [
    { id: "farm", category: "cash", name: "농지", marketValue: 500_000_000, isFarmlandGiftReduction: true },
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: true,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("R-7 — 손자 세대생략 §71 한도 base = 산출세액 + 세대생략가산액", () => {
  const r = calcGiftTax(grandchildFarmland);

  it("⑦ 산출세액 80,000,000 · 세대생략 할증 24,000,000 (불변)", () => {
    expect(r.computedTax).toBe(80_000_000);
    expect(r.additionalGenerationSkipSurcharge).toBe(24_000_000);
  });

  it("㉡(㉣) 농지분 산출세액 = ⑦ + 할증 = 104,000,000 (현행 버그: 80,000,000)", () => {
    expect(r.farmlandReductionDetail?.farmlandComputedTax).toBe(104_000_000);
  });

  it("㉤ 감면세액 = min(104M, 1억) = 100,000,000 (현행 버그: 80,000,000)", () => {
    expect(r.farmlandReductionDetail?.reductionAmount).toBe(100_000_000);
  });

  it("㉮ = 5억 × 1억/104M = 480,769,230 / ㉯ = 19,230,770", () => {
    expect(r.farmlandReductionDetail?.reducedFarmlandValue).toBe(480_769_230);
    expect(r.farmlandReductionDetail?.excessFarmlandValue).toBe(19_230_770);
  });

  it("결정세액 = ⑬ 104,000,000 − ㉤ 100,000,000 = 4,000,000 (현행 버그: 24,000,000)", () => {
    expect(r.finalTax).toBe(4_000_000);
  });
});
