// §41의4② 다년 분할 + §43² 1년 이내 동일거래 합산 — 교재 이미지31 사례 원단위 anchor.
import { describe, it, expect } from "vitest";
import { calcFreeLoanGift } from "@/lib/tax-engine/gift-deemed/free-loan";
import { calcFreeLoanAggregatedGift } from "@/lib/tax-engine/gift-deemed/free-loan-aggregated";

const RATE = { numer: 46, denom: 1000 };

describe("§41의4② 다년 분할 (PERIOD)", () => {
  it("[PERIOD-1] 사례1: 10억·2022.1.2~2023.12.31·연3% → 1년차 16,000,000 + 2년차 15,956,164(364일 안분)", () => {
    const r = calcFreeLoanGift({
      loanAmount: 1_000_000_000,
      actualInterestPaid: 30_000_000, // 10억 × 3% 연이자
      appropriateRate: RATE,
      isRelatedParty: true,
      loanStartDate: "2022-01-02",
      loanEndDate: "2023-12-31",
    });
    expect(r.periodBreakdown).toHaveLength(2);
    expect(r.periodBreakdown![0].benefit).toBe(16_000_000);
    expect(r.periodBreakdown![0].giftDate).toBe("2022-01-02");
    expect(r.periodBreakdown![0].dayCount).toBe(365);
    expect(r.periodBreakdown![1].benefit).toBe(15_956_164);
    expect(r.periodBreakdown![1].giftDate).toBe("2023-01-02");
    expect(r.periodBreakdown![1].dayCount).toBe(364);
    expect(r.deemedGiftValue).toBe(16_000_000); // 첫 window (합산 금지)
    expect(r.applied).toBe(true);
  });

  it("[PERIOD-2] 정확히 2년(마지막 365일) → 두 해 모두 16,000,000 (안분 없음)", () => {
    const r = calcFreeLoanGift({
      loanAmount: 1_000_000_000,
      actualInterestPaid: 30_000_000,
      appropriateRate: RATE,
      isRelatedParty: true,
      loanStartDate: "2022-01-02",
      loanEndDate: "2024-01-01",
    });
    expect(r.periodBreakdown).toHaveLength(2);
    expect(r.periodBreakdown![0].benefit).toBe(16_000_000);
    expect(r.periodBreakdown![1].benefit).toBe(16_000_000);
    expect(r.periodBreakdown![1].dayCount).toBe(365);
  });

  it("[PERIOD-3] 기간 미입력 → 단건 경로 (회귀, periodBreakdown 없음)", () => {
    const r = calcFreeLoanGift({ loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true });
    expect(r.periodBreakdown).toBeUndefined();
    expect(r.deemedGiftValue).toBe(13_800_000);
  });
});

describe("§43² 1년 이내 동일거래 합산 (AGG)", () => {
  it("[AGG-1] 사례2: ㉮3억3%·㉯1억무상·㉰5억2.6% → 합계 19,400,000, 증여시기 2023-04-25", () => {
    const r = calcFreeLoanAggregatedGift({
      loans: [
        { loanDate: "2022-05-04", loanAmount: 300_000_000, actualInterestPaid: 9_000_000, appropriateRate: RATE, isRelatedParty: true, label: "㉮" },
        { loanDate: "2022-09-20", loanAmount: 100_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true, label: "㉯" },
        { loanDate: "2023-04-25", loanAmount: 500_000_000, actualInterestPaid: 13_000_000, appropriateRate: RATE, isRelatedParty: true, label: "㉰" },
      ],
    });
    expect(r.deemedGiftValue).toBe(19_400_000);
    expect(r.applied).toBe(true);
    expect(r.aggregationBreakdown).toHaveLength(3);
    expect(r.aggregationBreakdown![0].rawBenefit).toBe(4_800_000);
    expect(r.aggregationBreakdown![1].rawBenefit).toBe(4_600_000);
    expect(r.aggregationBreakdown![2].rawBenefit).toBe(10_000_000);
    const crossing = r.aggregationBreakdown!.find((b) => b.isThresholdCrossing);
    expect(crossing?.loanDate).toBe("2023-04-25");
  });

  it("[AGG-2] 1년 초과 건 분리: ㉮(2022-05-04)가 기준일(2023-06-01) 소급 1년 밖 → 합산 제외", () => {
    const r = calcFreeLoanAggregatedGift({
      loans: [
        { loanDate: "2022-05-04", loanAmount: 300_000_000, actualInterestPaid: 9_000_000, appropriateRate: RATE, isRelatedParty: true },
        { loanDate: "2023-06-01", loanAmount: 500_000_000, actualInterestPaid: 13_000_000, appropriateRate: RATE, isRelatedParty: true },
      ],
    });
    expect(r.aggregationBreakdown).toHaveLength(1); // ㉰만
    expect(r.deemedGiftValue).toBe(10_000_000);
  });

  it("[AGG-3] 단건만 → 단건과 동일 (회귀)", () => {
    const r = calcFreeLoanAggregatedGift({
      loans: [{ loanDate: "2023-01-01", loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true }],
    });
    expect(r.deemedGiftValue).toBe(13_800_000);
  });

  it("[AGG-미달] 합산해도 1천만 미만 → 미적용 (1억 무상 ×2 = 9.2M)", () => {
    const r = calcFreeLoanAggregatedGift({
      loans: [
        { loanDate: "2023-01-01", loanAmount: 100_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true },
        { loanDate: "2023-02-01", loanAmount: 100_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true },
      ],
    });
    expect(r.applied).toBe(false);
    expect(r.deemedGiftValue).toBe(0);
  });

  it("[AGG-경계] 정확히 1년 전 당일 건 포함 (이내=당일 포함, >= cutoff)", () => {
    // 기준일 2023-04-25, cutoff = 2022-04-25. ㉮ 2022-04-25(정확히 1년 전)은 폐구간 포함.
    const r = calcFreeLoanAggregatedGift({
      loans: [
        { loanDate: "2022-04-25", loanAmount: 100_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true },
        { loanDate: "2023-04-25", loanAmount: 500_000_000, actualInterestPaid: 13_000_000, appropriateRate: RATE, isRelatedParty: true },
      ],
    });
    expect(r.aggregationBreakdown).toHaveLength(2); // 1년 전 당일 포함
    expect(r.deemedGiftValue).toBe(14_600_000); // 4,600,000 + 10,000,000
  });
});

describe("§41의4 단건 회귀 (다년·합산 추가 후 보존)", () => {
  it("[LOAN-1] 무상 3억 → 13,800,000", () => {
    const r = calcFreeLoanGift({ loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: true });
    expect(r.deemedGiftValue).toBe(13_800_000);
  });
  it("[LOAN-4] 비특수+정당사유 → 미적용 (게이트 보존)", () => {
    const r = calcFreeLoanGift({ loanAmount: 300_000_000, actualInterestPaid: 0, appropriateRate: RATE, isRelatedParty: false, hasJustifiableReason: true });
    expect(r.applied).toBe(false);
    expect(r.exclusionReason).toContain("정당한 사유");
  });
});
