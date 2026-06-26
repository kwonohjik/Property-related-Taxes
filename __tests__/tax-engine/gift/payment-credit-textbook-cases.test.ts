/**
 * 교재 "(3) 증여세 납부세액공제 사례" 1·2 — 엔진 출력 ↔ 교재 숫자 원단위 anchor.
 *
 * 사례1: 2020 부→자 아파트 1억(산출세액 700만) → 2024 토지 3억. §47② 합산 + §58 납부세액공제 한도.
 * 사례2: 조부모 → 손자(성년) 3회(2018 3.2억 / 2020 5억 / 2023 9.8억). 세대생략 §57 할증 marginal +
 *        §58 납부세액공제 + §69 신고세액공제. 우리 앱은 "금번 1건 + 사전증여 N건" 모델이므로
 *        각 회차를 직전 회차들을 prior로 넣어 독립 계산 → 교재 표의 각 열을 재현.
 *
 * §69 신고세액공제율 연도별 적용 (filing-credit.ts FILING_CREDIT_RATE_TABLE):
 *   1차(2018) = 5% / 2차(2020)·3차(2023) = 3%. 교재 ⑰⑱ 전 회차 완전 일치.
 *   (연도별 율 경계 anchor는 filing-credit-year-rate.test.ts 참조.)
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 사례 1 — 단순 납부세액공제 (세대생략 없음)
// ============================================================
describe("교재 사례1 — §58 납부세액공제 한도 (부→자)", () => {
  const prior1: PriorGift = {
    giftDate: "2020-01-01",
    donor: "father",
    isHeir: false,
    giftAmount: 100_000_000,
    giftTaxPaid: 7_000_000,
    computedTax: 7_000_000, // 1차 산출세액(㉮ 기납부증여세산출세액)
    giftTaxBase: 50_000_000, // 1억 − 증여재산공제 5천만
    wasGenerationSkip: false,
  };
  const r = calcGiftTax({
    giftDate: "2024-01-01",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [
      { id: "g", category: "real_estate_land", name: "토지", marketValue: 300_000_000 },
    ],
    priorGiftsWithin10Years: [prior1],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: { isFiledOnTime: false },
  });

  it("산출세액 = (3억+1억−5천만)×20%−1천만 = 6천만", () => {
    expect(r.taxBase).toBe(350_000_000);
    expect(r.computedTax).toBe(60_000_000);
  });

  it("㉯ 한도 = 6천만 × (1억−5천만)/3.5억 = 8,571,428", () => {
    expect(r.priorGiftCreditDetail?.priorAddedTaxBase).toBe(50_000_000);
    expect(r.priorGiftCreditDetail?.creditLimit).toBe(8_571_428);
  });

  it("납부세액공제 = Min(㉮ 700만, ㉯ 857만) = 700만 / 결정세액 5,300만", () => {
    expect(r.priorGiftCreditDetail?.priorPaidCredit).toBe(7_000_000);
    expect(r.totalTaxCredit).toBe(7_000_000);
    expect(r.finalTax).toBe(53_000_000);
  });
});

// ============================================================
// 사례 2 — 조부모 3차 세대생략 (천원단위 → 원)
// ============================================================
const g1: PriorGift = {
  giftDate: "2018-05-02",
  donor: "grandparent",
  isHeir: false,
  giftAmount: 320_000_000,
  giftTaxPaid: 0,
  computedTax: 44_000_000, // 1차 ⑦
  giftTaxBase: 270_000_000, // 1차 ⑤
  wasGenerationSkip: true,
  additionalGenerationSkipSurcharge: 13_200_000, // 1차 ⑫
};
const g2: PriorGift = {
  giftDate: "2020-05-02",
  donor: "grandparent",
  isHeir: false,
  giftAmount: 500_000_000,
  giftTaxPaid: 0,
  computedTax: 171_000_000, // 2차 ⑦
  giftTaxBase: 770_000_000, // 2차 ⑤ (1차 합산)
  wasGenerationSkip: true,
  additionalGenerationSkipSurcharge: 38_100_000, // 2차 ⑫
};

const mk = (date: string, value: number, priors: PriorGift[]): GiftTaxInput => ({
  giftDate: date,
  donorRelation: "lineal_ascendant_adult",
  donor: "grandparent",
  giftItems: [{ id: "g", category: "cash", name: "현금", marketValue: value }],
  priorGiftsWithin10Years: priors,
  isGenerationSkip: true,
  isMinorDonee: false,
  deductionInput: { donorRelation: "lineal_ascendant_adult" },
  creditInput: { isFiledOnTime: true },
});

describe("교재 사례2 — 1차 증여 (2018.5.2, 3.2억)", () => {
  const r = calcGiftTax(mk("2018-05-02", 320_000_000, []));

  it("⑤ 270,000천 · ⑦ 44,000천 · ⑧ 13,200천 · ⑫ 13,200천 · ⑬ 57,200천 (교재 일치)", () => {
    expect(r.taxBase).toBe(270_000_000);
    expect(r.computedTax).toBe(44_000_000);
    expect(r.generationSkipSurchargeDetail?.surchargeBase).toBe(13_200_000);
    expect(r.additionalGenerationSkipSurcharge).toBe(13_200_000);
    expect(r.generationSkipSurchargeDetail?.totalComputedTaxWithSurcharge).toBe(57_200_000);
  });

  it("⑰ 신고세액공제 — 2018년 5% = 2,860,000 / ⑱ 자진납부세액 54,340,000 (교재 완전 일치)", () => {
    // 연도별 율 도입(filing-credit-year-rate) → 2018 = 5% 적용으로 교재와 일치.
    expect(r.creditDetail.filingCreditRate).toBe(0.05);
    expect(r.totalTaxCredit).toBe(2_860_000);
    expect(r.finalTax).toBe(54_340_000);
  });
});

describe("교재 사례2 — 2차 증여 (2020.5.2, 5억, 1차 합산)", () => {
  const r = calcGiftTax(mk("2020-05-02", 500_000_000, [g1]));

  it("⑤ 770,000천 · ⑦ 171,000천 (교재 일치)", () => {
    expect(r.taxBase).toBe(770_000_000);
    expect(r.computedTax).toBe(171_000_000);
  });

  it("§57 할증 — ⑧ 51,300천 · ⑨ 13,200천 · ⑩ 17,988천 · ⑪ 13,200천 · ⑫ 38,100천 · ⑬ 209,100천", () => {
    const s = r.generationSkipSurchargeDetail!;
    expect(s.surchargeBase).toBe(51_300_000);
    expect(s.priorAdditionalCumulative).toBe(13_200_000);
    expect(s.surchargeCreditLimit).toBe(17_988_311); // 교재 반올림 17,988천
    expect(s.priorSurchargeCredit).toBe(13_200_000);
    expect(s.additionalSurcharge).toBe(38_100_000);
    expect(s.totalComputedTaxWithSurcharge).toBe(209_100_000);
  });

  it("§58 납부세액공제 — ⑭ 44,000천 · ⑮ 59,961천 · ⑯ 44,000천", () => {
    expect(r.priorGiftCreditDetail?.priorComputedTax).toBe(44_000_000);
    expect(r.priorGiftCreditDetail?.creditLimit).toBe(59_961_038); // 교재 반올림 59,961천
    expect(r.priorGiftCreditDetail?.priorPaidCredit).toBe(44_000_000);
  });

  it("⑰ 신고세액공제 3% 4,953천 · ⑱ 자진납부세액 160,147천 (교재 완전 일치)", () => {
    expect(r.creditDetail.filingCreditRate).toBe(0.03);
    expect(r.totalTaxCredit).toBe(48_953_000); // ⑯ 44,000천 + ⑰ 4,953천
    expect(r.finalTax).toBe(160_147_000);
  });
});

describe("교재 사례2 — 3차 증여 (2023.5.2, 9.8억, 1·2차 합산)", () => {
  const r = calcGiftTax(mk("2023-05-02", 980_000_000, [g1, g2]));

  it("⑤ 1,750,000천 · ⑦ 540,000천 (교재 일치)", () => {
    expect(r.taxBase).toBe(1_750_000_000);
    expect(r.computedTax).toBe(540_000_000);
  });

  it("§57 할증 — ⑧ 162,000천 · ⑨ 51,300천 · ⑩ 71,280천 · ⑪ 51,300천 · ⑫ 110,700천 · ⑬ 650,700천", () => {
    const s = r.generationSkipSurchargeDetail!;
    expect(s.surchargeBase).toBe(162_000_000);
    expect(s.priorAdditionalCumulative).toBe(51_300_000);
    expect(s.surchargeCreditLimit).toBe(71_280_000);
    expect(s.priorSurchargeCredit).toBe(51_300_000);
    expect(s.additionalSurcharge).toBe(110_700_000);
    expect(s.totalComputedTaxWithSurcharge).toBe(650_700_000);
  });

  it("§58 납부세액공제 — ⑭ 171,000천 · ⑮ 237,600천 · ⑯ 171,000천", () => {
    expect(r.priorGiftCreditDetail?.priorComputedTax).toBe(171_000_000);
    expect(r.priorGiftCreditDetail?.creditLimit).toBe(237_600_000);
    expect(r.priorGiftCreditDetail?.priorPaidCredit).toBe(171_000_000);
  });

  it("⑰ 신고세액공제 3% 14,391천 · ⑱ 자진납부세액 465,309천 (교재 완전 일치)", () => {
    expect(r.creditDetail.filingCreditRate).toBe(0.03);
    expect(r.totalTaxCredit).toBe(185_391_000); // ⑯ 171,000천 + ⑰ 14,391천
    expect(r.finalTax).toBe(465_309_000);
  });
});
