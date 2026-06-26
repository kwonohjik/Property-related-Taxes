/**
 * R-6 — 3차 증여(재차증여 체인) §58 가산재산 marginal 산출세액·과표 + §57 한도 보정
 *
 * 산식 출처: 재재산-610(2007.5.23) 3차 증여 계산사례 (조부→손자 세대생략).
 *   구법 사례(3천만 공제·10% 신고공제·5년 cutoff)라 절대숫자 재현 아님 —
 *   "직전회차가 그 자신의 사전증여를 합산했고 그 사전증여가 금번 cutoff에서 탈락한 경우"
 *   ⑭=가산재산 산출세액=직전⑦−그전⑦, ⑤_prior=가산재산 과표(안분) 구조를 현행법으로 검증.
 *
 * 현행법 합성: 조부→손자, 1차(2013,10억)·2차(2020,3억)·3차(2024,1억). prior 값은 probe 동결.
 *   3차 cutoff(2014)에서 1차(2013) 탈락 → drop-out 발동.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function base(date: string, value: number, priors: PriorGift[]): GiftTaxInput {
  return {
    giftDate: date,
    donorRelation: "lineal_ascendant_adult",
    donor: "grandparent",
    giftItems: [{ id: "g", category: "cash", name: "현금", marketValue: value }],
    priorGiftsWithin10Years: priors,
    isGenerationSkip: true,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: false },
  };
}

// 현행법 probe 동결값 (1차 standalone·2차 with 1차 prior — 기존 정확 경로)
const prior1: PriorGift = {
  giftDate: "2013-01-01",
  donor: "grandparent",
  isHeir: false,
  giftAmount: 1_000_000_000,
  giftTaxPaid: 0,
  computedTax: 225_000_000, // 1차 ⑦
  giftTaxBase: 950_000_000, // 1차 ⑤
  wasGenerationSkip: true,
  additionalGenerationSkipSurcharge: 67_500_000, // 1차 ⑫
};
const prior2: PriorGift = {
  giftDate: "2020-01-01",
  donor: "grandparent",
  isHeir: false,
  giftAmount: 300_000_000,
  giftTaxPaid: 0,
  computedTax: 340_000_000, // 2차 ⑦ (1차 합산된 값)
  giftTaxBase: 1_250_000_000, // 2차 ⑤ (1차 합산된 값)
  wasGenerationSkip: true,
  additionalGenerationSkipSurcharge: 34_500_000, // 2차 ⑫
};

describe("R-6 무회귀 — 2차(직전=1차 단일, drop-out 없음)", () => {
  const r2 = calcGiftTax(base("2020-01-01", 300_000_000, [prior1]));
  it("⑭=1차⑦ 225M · ⑤_prior=1차⑤ 950M · 결정세액 149.5M (현행 불변)", () => {
    expect(r2.priorGiftCreditDetail?.priorComputedTax).toBe(225_000_000);
    expect(r2.priorGiftCreditDetail?.priorAddedTaxBase).toBe(950_000_000);
    expect(r2.finalTax).toBe(149_500_000);
  });
});

describe("R-6 — 3차(직전=2차 합산회차, 1차 금번 cutoff 탈락 → marginal)", () => {
  const r3 = calcGiftTax(base("2024-01-01", 100_000_000, [prior1, prior2]));

  it("⑦=60M · ⑤=350M (불변)", () => {
    expect(r3.taxBase).toBe(350_000_000);
    expect(r3.computedTax).toBe(60_000_000);
  });

  it("§58 ⑭ 가산재산 산출세액 = 직전⑦ − 그전⑦ = 340M − 225M = 115M (marginal)", () => {
    expect(r3.priorGiftCreditDetail?.priorComputedTax).toBe(115_000_000);
  });

  it("§58 ⑤_prior 가산재산 과표 = ⑤ × 가산/(가산+순현재) = 350M×300/400 = 262.5M (안분)", () => {
    expect(r3.priorGiftCreditDetail?.priorAddedTaxBase).toBe(262_500_000);
  });

  it("§58 ⑮ 한도 = ⑦ × ⑤_prior/⑤ = 60M × 0.75 = 45M / ⑯ = min(⑭,⑮) = 45M", () => {
    expect(r3.priorGiftCreditDetail?.creditLimit).toBe(45_000_000);
    expect(r3.priorGiftCreditDetail?.priorPaidCredit).toBe(45_000_000);
  });

  it("§57 ⑩ 한도 = 45M × 30% = 13.5M / ⑪ = min(⑨ 34.5M, ⑩ 13.5M) = 13.5M / ⑫ = ⑧18M − 13.5M = 4.5M", () => {
    expect(r3.generationSkipSurchargeDetail?.surchargeCreditLimit).toBe(13_500_000);
    expect(r3.generationSkipSurchargeDetail?.priorSurchargeCredit).toBe(13_500_000);
    expect(r3.generationSkipSurchargeDetail?.additionalSurcharge).toBe(4_500_000);
    expect(r3.additionalGenerationSkipSurcharge).toBe(4_500_000);
  });

  it("결정세액 = ⑬ 64.5M − ⑯ 45M = 19.5M (신고세액공제 없음)", () => {
    expect(r3.totalTaxCredit).toBe(45_000_000);
    expect(r3.finalTax).toBe(19_500_000);
  });
});
