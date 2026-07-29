/**
 * C-15 anchor — §59 외국납부세액공제 메인+합산배제 스트림 이중공제 차단
 *
 * 법령(KoreanLaw MCP 상증법 mst 276123 §59): 실제 부과받은 외국세액 1회분만 공제.
 *
 * 버그: 합산배제(§41의3·§41의5) 스트림이 input.creditInput(foreignTaxPaid 포함)을 그대로 재투입 →
 *   메인 스트림 + 합산배제 스트림 각각 §59 전액 공제 → 2배.
 * 재현: 현금 10억 + 합산배제 5억, foreignTaxPaid 30,000,000.
 *   정답 공제 델타 29,100,000(=3천만 − §69 3% 상호작용). 버그 58,200,000(2배).
 * 수정: 합산배제 스트림 creditInput에서 foreignTaxPaid 제거 → §59 메인 일원화.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

function makeInput(foreignTaxPaid: number): GiftTaxInput {
  return {
    giftDate: "2024-05-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      { id: "cash", category: "cash", name: "현금", marketValue: 1_000_000_000 },
      { id: "excl", category: "cash", name: "합산배제", marketValue: 500_000_000, isAggregationExcludedGift: true },
    ],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: true, foreignTaxPaid },
  };
}

describe("C-15 §59 외국납부세액공제 이중공제 차단", () => {
  it("§59 공제는 1회만 적용 — foreign 30M 델타 = 29,100,000 (버그 58,200,000)", () => {
    const noForeign = calcGiftTax(makeInput(0));
    const withForeign = calcGiftTax(makeInput(30_000_000));
    const creditDelta = noForeign.finalTax - withForeign.finalTax;
    expect(creditDelta).toBe(29_100_000);
  });

  it("합산배제 스트림에는 §59 미적용 (foreign 유무와 무관하게 동일)", () => {
    const withForeign = calcGiftTax(makeInput(30_000_000));
    const noForeign = calcGiftTax(makeInput(0));
    const aggExclWith = withForeign.aggregationExcludedDetail?.finalTax;
    const aggExclNo = noForeign.aggregationExcludedDetail?.finalTax;
    expect(aggExclWith).toBe(aggExclNo);
    // 합산배제 스트림 §59 credit이 있었다면 finalTax가 달라졌을 것
    expect(aggExclWith).toBe(81_480_000);
  });

  it("합산배제 없으면 §59 정상 1회 (회귀 — 단일 스트림 불변)", () => {
    const single = (f: number): GiftTaxInput => ({
      giftDate: "2024-05-01",
      donorRelation: "lineal_ascendant_adult",
      donor: "father",
      giftItems: [{ id: "cash", category: "cash", name: "현금", marketValue: 1_000_000_000 }],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_ascendant_adult" },
      creditInput: { isFiledOnTime: true, foreignTaxPaid: f },
    });
    const delta = calcGiftTax(single(0)).finalTax - calcGiftTax(single(30_000_000)).finalTax;
    expect(delta).toBe(29_100_000);
  });
});
