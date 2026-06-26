/**
 * R-2 — §71 농지 감면: 금번 증여에 농지(감면대상) + 비농지 혼합 시 ㉣ 농지분 산출세액 안분
 *
 * 조특법 §71①·§71②. 단일 증여 내 농지+비농지 혼합의 직접 예규는 부재 →
 *   ㉣(농지분 산출세액) = 금번 증여분 산출세액(㉡−㉠) × 농지가액/금번총가액 (가액비례 안분).
 *   §71 감면(㉤=min(㉣,잔여))이 비농지분 세액까지 감면하지 않도록 농지분으로 제한.
 *   단일 농지(농지=전체)면 ratio=1 → 기존 동작 불변.
 *
 * anchor: 부친→자녀(세대생략 아님), 농지 2억 + 현금 8억(총 10억), 사전증여 없음, 한도 미구속.
 *   ㉡ = (10억 − 5천만 공제) 9.5억 × 30% − 6천만 = 225,000,000
 *   ㉣_농지 = 225,000,000 × 2억/10억 = 45,000,000  (현행 버그: 225,000,000 전체)
 *   ㉤ = min(45,000,000, 1억 잔여) = 45,000,000      (현행 버그: min(225M,1억)=1억 — 과대감면)
 *   ㉮ = 2억 × 45M/45M = 2억 / ㉯ = 0
 *   결정세액 = 225,000,000 − 45,000,000 = 180,000,000 (현행 버그: 125,000,000)
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

// category "cash"는 평가 단순화용 (엔진은 isFarmlandGiftReduction을 종류로 게이트하지 않음 — 기존 §71 테스트 동일).
const mixed: GiftTaxInput = {
  giftDate: "2024-05-01",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [
    { id: "farm", category: "cash", name: "농지", marketValue: 200_000_000, isFarmlandGiftReduction: true },
    { id: "etc", category: "cash", name: "현금(비농지)", marketValue: 800_000_000 },
  ],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: false },
};

describe("R-2 — 농지+비농지 혼합 ㉣ 안분 (한도 미구속)", () => {
  const r = calcGiftTax(mixed);

  it("㉡ 합산 산출세액 225,000,000 (불변)", () => {
    expect(r.computedTax).toBe(225_000_000);
  });

  it("㉣ 농지분 산출세액 = 225,000,000 × 2억/10억 = 45,000,000 (안분, 전체마진 아님)", () => {
    expect(r.farmlandReductionDetail?.farmlandComputedTax).toBe(45_000_000);
  });

  it("㉤ 감면세액 = min(㉣ 45M, 잔여 1억) = 45,000,000 (비농지분 미감면)", () => {
    expect(r.farmlandReductionDetail?.reductionAmount).toBe(45_000_000);
  });

  it("㉮ 감면농지가액 = 2억 (전부 감면) / ㉯ 초과분 = 0", () => {
    expect(r.farmlandReductionDetail?.reducedFarmlandValue).toBe(200_000_000);
    expect(r.farmlandReductionDetail?.excessFarmlandValue).toBe(0);
  });

  it("결정세액 = ㉡ 225,000,000 − ㉤ 45,000,000 = 180,000,000", () => {
    expect(r.finalTax).toBe(180_000_000);
  });
});

/**
 * R-2 교차 케이스 — 혼합 AND 5년 1억 한도 구속 (㉤ < ㉣ → ㉮ 부분감면·㉯ > 0).
 *   농지 8억 + 현금 2억(총 10억), 사전증여 없음.
 *   ㉣_농지 = 225,000,000 × 8억/10억 = 180,000,000 > 잔여 1억 → 한도 구속.
 *   ㉤ = min(180M, 1억) = 100,000,000
 *   ㉮ = 8억 × 1억/180M = 444,444,444 / ㉯ = 8억 − ㉮ = 355,555,556
 *   결정세액 = 225,000,000 − 100,000,000 = 125,000,000
 */
describe("R-2 — 혼합 + 한도 구속 (㉮ 부분감면)", () => {
  const r = calcGiftTax({
    ...mixed,
    giftItems: [
      { id: "farm", category: "cash", name: "농지", marketValue: 800_000_000, isFarmlandGiftReduction: true },
      { id: "etc", category: "cash", name: "현금(비농지)", marketValue: 200_000_000 },
    ],
  });

  it("㉣ 농지분 = 180,000,000 (안분) / ㉤ = min(180M, 1억) = 100,000,000 (한도 구속)", () => {
    expect(r.farmlandReductionDetail?.farmlandComputedTax).toBe(180_000_000);
    expect(r.farmlandReductionDetail?.reductionAmount).toBe(100_000_000);
  });

  it("㉮ = 8억 × 1억/180M = 444,444,444 / ㉯ = 355,555,556 (부분감면)", () => {
    expect(r.farmlandReductionDetail?.reducedFarmlandValue).toBe(444_444_444);
    expect(r.farmlandReductionDetail?.excessFarmlandValue).toBe(355_555_556);
  });

  it("결정세액 = 225,000,000 − 100,000,000 = 125,000,000", () => {
    expect(r.finalTax).toBe(125_000_000);
  });
});
