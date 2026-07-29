/**
 * §69 신고세액공제율 연도별 적용 — anchor.
 *
 * 법률 제14388호(2016.12.20, 2017.1.1 시행) §69 개정 + 부칙 적용례:
 *   기준일(상속개시일/증여일) | 율
 *   ~2016-12-31 = 10% / 2017 = 7% / 2018 = 5% / 2019-01-01~ = 3%
 *
 * 검증 모델: 직계존속(성년) → 자녀 단순 증여 3.2억(세대생략·사전증여 없음).
 *   과표 = 3.2억 − 5천만 = 2.7억 → 산출세액 = 2.7억×20%−1천만 = 44,000,000 (불변)
 *   신고세액공제 = 산출세액 × 율 → finalTax = 44,000,000 − 공제.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type { GiftTaxInput } from "@/lib/tax-engine/types/inheritance-gift.types";

const mk = (giftDate: string): GiftTaxInput => ({
  giftDate,
  donorRelation: "lineal_ascendant_adult",
  donor: "father",
  giftItems: [{ id: "g", category: "cash", name: "현금", marketValue: 320_000_000 }],
  priorGiftsWithin10Years: [],
  isGenerationSkip: false,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
});

describe("§69 신고세액공제율 연도 경계 (산출세액 44,000,000 고정)", () => {
  it("산출세액은 연도 무관 44,000,000", () => {
    expect(calcGiftTax(mk("2018-05-02")).computedTax).toBe(44_000_000);
  });

  // [기준일, 율, 공제액, finalTax]
  const cases: [string, number, number, number][] = [
    ["2016-12-31", 0.10, 4_400_000, 39_600_000],
    ["2017-01-01", 0.07, 3_080_000, 40_920_000],
    ["2017-12-31", 0.07, 3_080_000, 40_920_000],
    ["2018-01-01", 0.05, 2_200_000, 41_800_000],
    ["2018-12-31", 0.05, 2_200_000, 41_800_000],
    ["2019-01-01", 0.03, 1_320_000, 42_680_000],
  ];

  for (const [date, rate, credit, finalTax] of cases) {
    it(`${date} → ${rate * 100}% : 공제 ${credit.toLocaleString()} · finalTax ${finalTax.toLocaleString()}`, () => {
      const r = calcGiftTax(mk(date));
      expect(r.totalTaxCredit).toBe(credit);
      expect(r.finalTax).toBe(finalTax);
      expect(r.creditDetail.filingCreditRate).toBe(rate); // result echo
    });
  }
});

describe("§69 율 echo — 결과 노출", () => {
  it("2018 증여 → filingCreditRate 0.05 echo", () => {
    expect(calcGiftTax(mk("2018-06-01")).creditDetail.filingCreditRate).toBe(0.05);
  });
});

describe("§69 율 — 합산배제 스트림(§41의3 등)도 증여연도 기준 (H-22)", () => {
  it("2017 합산배제 증여 5억 → §69 7% 반영 (수정 전 giftDate 미전달로 3% 고정)", () => {
    const r = calcGiftTax({
      ...mk("2017-06-01"),
      giftItems: [
        {
          id: "g",
          category: "cash",
          name: "상장이익(§41의3)",
          marketValue: 500_000_000,
          isAggregationExcludedGift: true,
        },
      ],
    });
    const agg = r.aggregationExcludedDetail!;
    // §55①3호 과세표준 = 5억 − 3천만 = 4.7억 → 산출세액 = 4.7억×20% − 1천만 = 84,000,000
    expect(agg.computedTax).toBe(84_000_000);
    // 2017년 §69 = 7% → 신고세액공제 floor(84,000,000 × 7%) = 5,880,000 (수정 전 3% = 2,520,000)
    expect(agg.totalCredit).toBe(5_880_000);
    expect(agg.finalTax).toBe(78_120_000);
  });
});
