/**
 * 영농자녀 농지 증여세 감면(조특법 §71) 농지 재차증여 — anchor
 *
 * 출처: 재재산-1454(2022.11.22) / 법규재산-2314(2023.9.21) 해설 표
 * 계획: docs/00-pm/gift-farmland-reduction-71-redonation.plan.md
 *
 * FR-1 (단위 원):
 *   2015-01-19 현금   50,000,000  (증여공제로 납부세액 0)
 *   2019-05-03 농지A 153,754,000  감면신청, 산출세액 20,750,800 (100% 감면)
 *   2021-04-19 농지B 813,066,000  감면신청 — 금번 계산 대상
 *
 * 엔진은 category로 감면 게이팅 안 함(UI 전담) — 평가액 격리 위해 category "cash" 사용.
 * 라운딩: 해설은 천원 단위, 엔진은 원-정확 → ㉮·㉯는 원-정확 probe값을 canonical로 고정,
 *         해설 천원값(307,867 / 505,199)과 ≤2천원 tolerance 교차검증.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const farmlandB: GiftTaxInput = {
  giftDate: "2021-04-19",
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [
    {
      id: "B",
      category: "cash",
      name: "농지B",
      marketValue: 813_066_000,
      isFarmlandGiftReduction: true,
    },
  ],
  priorGiftsWithin10Years: [
    {
      giftDate: "2015-01-19",
      giftAmount: 50_000_000,
      donor: "father",
      giftTaxPaid: 0,
      giftTaxBase: 0,
      computedTax: 0,
      isHeir: false,
    },
    {
      giftDate: "2019-05-03",
      giftAmount: 153_754_000,
      donor: "father",
      giftTaxPaid: 0,
      giftTaxBase: 153_754_000,
      computedTax: 20_750_800, // ㉠ 농지A 산출세액
      isHeir: false,
      farmlandReductionApplied: true,
      farmlandReductionAmount: 20_750_800, // 농지A 100% 감면 (5년 한도 누계)
    },
  ],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
};

describe("§71 농지 재차증여 — [A] 재사용 기계 (감면 무관 값)", () => {
  it("㉢ 합산 증여가액 = 1,016,820,000", () => {
    expect(calcGiftTax(farmlandB).aggregatedGiftValue).toBe(1_016_820_000);
  });
  it("⑤ 과세표준 = 966,820,000", () => {
    expect(calcGiftTax(farmlandB).taxBase).toBe(966_820_000);
  });
  it("㉡ 합산 산출세액 = 230,046,000", () => {
    expect(calcGiftTax(farmlandB).computedTax).toBe(230_046_000);
  });
  it("§58 기납부세액공제 = 20,750,800", () => {
    expect(calcGiftTax(farmlandB).creditDetail.giftTaxCredit).toBe(20_750_800);
  });
});

describe("§71 농지 재차증여 — [B] 감면세액·안분", () => {
  it("㉣ 농지분 산출세액 = 209,295,200 (㉡ − ㉠)", () => {
    expect(calcGiftTax(farmlandB).farmlandReductionDetail?.farmlandComputedTax).toBe(
      209_295_200,
    );
  });
  it("5년 한도 잔여 = 79,249,200 (1억 − 20,750,800)", () => {
    expect(
      calcGiftTax(farmlandB).farmlandReductionDetail?.reductionLimitRemaining,
    ).toBe(79_249_200);
  });
  it("㉤ 농지 감면세액 = 79,249,200 (min(㉣, 잔여))", () => {
    expect(calcGiftTax(farmlandB).farmlandReductionDetail?.reductionAmount).toBe(
      79_249_200,
    );
  });
  it("누적 5년 감면 = 100,000,000 (1억 정확 도달)", () => {
    expect(
      calcGiftTax(farmlandB).farmlandReductionDetail?.cumulative5yrReduction,
    ).toBe(100_000_000);
  });
  it("㉮ 감면농지가액(감면범위) = 307,865,780 (원-정확, 해설 307,867천 ≈)", () => {
    const v = calcGiftTax(farmlandB).farmlandReductionDetail?.reducedFarmlandValue;
    expect(v).toBe(307_865_780);
    expect(Math.abs((v ?? 0) - 307_867_000)).toBeLessThanOrEqual(2_000); // 해설 tolerance
  });
  it("㉯ 초과분 농지가액 = 505,200,220 (= 813,066,000 − ㉮, 해설 505,199천 ≈)", () => {
    const v = calcGiftTax(farmlandB).farmlandReductionDetail?.excessFarmlandValue;
    expect(v).toBe(505_200_220);
    expect(Math.abs((v ?? 0) - 505_199_000)).toBeLessThanOrEqual(2_000);
  });
  it("차감세액(§69 전) = 130,046,000 (㉡ − §58 − ㉤) — 해설 anchor", () => {
    const r = calcGiftTax(farmlandB);
    expect(
      r.computedTax -
        r.creditDetail.giftTaxCredit -
        (r.farmlandReductionDetail?.reductionAmount ?? 0),
    ).toBe(130_046_000);
  });
  it("결정세액(§69 후) = 126,144,620", () => {
    expect(calcGiftTax(farmlandB).finalTax).toBe(126_144_620);
  });
});

describe("§71 농지 재차증여 — [D] real_estate_land(농지) category 통합 (UI 실경로)", () => {
  // UI는 real_estate_land에서만 토글 노출 — 엔진 농지 평가 경로(marketValue=시가) 검증
  const farmlandB_land: GiftTaxInput = {
    ...farmlandB,
    giftItems: [
      {
        id: "B",
        category: "real_estate_land",
        name: "농지B",
        marketValue: 813_066_000,
        isFarmlandGiftReduction: true,
      },
    ],
  };
  it("농지(real_estate_land) 평가 = 813,066,000 → ㉤ 79,249,200 · 결정세액 126,144,620", () => {
    const r = calcGiftTax(farmlandB_land);
    expect(r.farmlandReductionDetail?.farmlandValue).toBe(813_066_000);
    expect(r.farmlandReductionDetail?.reductionAmount).toBe(79_249_200);
    expect(r.farmlandReductionDetail?.reducedFarmlandValue).toBe(307_865_780);
    expect(r.finalTax).toBe(126_144_620);
  });
});

describe("§71 농지 재차증여 — [C] 회귀: 감면 미신청 시 불변", () => {
  it("isFarmlandGiftReduction 없으면 farmlandReductionDetail = null + finalTax = 203,016,344", () => {
    const noReduction: GiftTaxInput = {
      ...farmlandB,
      giftItems: [{ id: "B", category: "cash", name: "농지B", marketValue: 813_066_000 }],
      priorGiftsWithin10Years: farmlandB.priorGiftsWithin10Years.map((p) => ({
        ...p,
        farmlandReductionApplied: undefined,
        farmlandReductionAmount: undefined,
      })),
    };
    const r = calcGiftTax(noReduction);
    expect(r.farmlandReductionDetail).toBeNull();
    expect(r.finalTax).toBe(203_016_344);
  });
});
