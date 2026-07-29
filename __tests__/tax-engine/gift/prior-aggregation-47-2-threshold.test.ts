/**
 * C-4 anchor — §47② 동일인 10년 합산 '1천만원 이상' 임계
 *
 * 법령(KoreanLaw MCP, mst 276123, 시행 20260102):
 *   §47② "해당 증여일 전 10년 이내에 동일인…으로부터 받은 증여재산가액을 합친 금액이
 *   1천만원 이상인 경우에는 그 가액을 증여세 과세가액에 가산한다."
 *
 * 재현: 금회 1억 + 동일인(부) 사전증여 500만.
 *   합계 500만 < 1천만 → 미가산. 정답 과세가액 1억·과세표준 5천만·결정세액 4,850,000.
 *   버그(임계 미구현) 시: 105M 가산 → 과세표준 5,500만 → 5,335,000 (485,000원 과다).
 *   임계 미달 시 §58 기납부세액공제·§57 세대생략 한도 연계값도 무력화(matched 비움).
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import { aggregatePriorGiftsForGift } from "@/lib/tax-engine/gift-prior-aggregation";
import type {
  GiftTaxInput,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function makeInput(priorAmounts: number[]): GiftTaxInput {
  return {
    giftDate: "2024-05-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      { id: "g0", category: "cash", name: "현금", marketValue: 100_000_000 },
    ],
    priorGiftsWithin10Years: priorAmounts.map((amt, i) => ({
      giftDate: `2021-0${i + 1}-01`,
      giftAmount: amt,
      donor: "father" as const,
      giftTaxPaid: 0,
      giftTaxBase: amt,
      isHeir: false,
    })),
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: true },
  };
}

describe("C-4 §47② 1천만원 임계 (미달 시 합산 제외)", () => {
  it("사전증여 500만(<1천만) → 미가산: 과세가액 1억·과세표준 5천만·결정세액 4,850,000", () => {
    const r = calcGiftTax(makeInput([5_000_000]));
    expect(r.aggregatedGiftValue).toBe(100_000_000);
    expect(r.taxBase).toBe(50_000_000);
    expect(r.finalTax).toBe(4_850_000);
    // 무-사전증여와 완전히 동일해야 함 (연계값 전부 무력화)
    const noPrior = calcGiftTax(makeInput([]));
    expect(r.finalTax).toBe(noPrior.finalTax);
  });

  it("사전증여 1,500만(≥1천만) → 가산: 과세표준 6,500만·결정세액 6,305,000", () => {
    const r = calcGiftTax(makeInput([15_000_000]));
    expect(r.aggregatedGiftValue).toBe(115_000_000);
    expect(r.taxBase).toBe(65_000_000);
    expect(r.finalTax).toBe(6_305_000);
  });

  it("경계: 정확히 1천만 → 가산 (이상)", () => {
    const r = calcGiftTax(makeInput([10_000_000]));
    expect(r.aggregatedGiftValue).toBe(110_000_000);
  });

  it("경계: 9,999,999(<1천만) → 미가산", () => {
    const r = calcGiftTax(makeInput([9_999_999]));
    expect(r.aggregatedGiftValue).toBe(100_000_000);
  });

  it("복수 소액 합계 미달(400만+500만=900만<1천만) → 전체 미가산", () => {
    const r = calcGiftTax(makeInput([4_000_000, 5_000_000]));
    expect(r.aggregatedGiftValue).toBe(100_000_000);
    expect(r.finalTax).toBe(4_850_000);
  });

  it("복수 소액 합계 충족(600만+500만=1,100만≥1천만) → 전체 가산", () => {
    const r = calcGiftTax(makeInput([6_000_000, 5_000_000]));
    expect(r.aggregatedGiftValue).toBe(111_000_000);
  });

  it("헬퍼 단위: 임계 미달 시 matchedPriorGifts·연계값 전부 0/빈 배열", () => {
    const priors: PriorGift[] = [
      {
        giftDate: "2021-05-01",
        giftAmount: 5_000_000,
        donor: "father",
        giftTaxPaid: 0,
        giftTaxBase: 5_000_000,
        computedTax: 500_000,
        isHeir: false,
      },
    ];
    const agg = aggregatePriorGiftsForGift(priors, "2024-05-01", "father");
    expect(agg.totalAmount).toBe(0);
    expect(agg.matchedPriorGifts).toHaveLength(0);
    expect(agg.totalComputedTax).toBe(0);
    expect(agg.priorAddedTaxBase).toBe(0);
    expect(agg.warnings.some((w) => w.includes("§47② 미달"))).toBe(true);
  });
});
