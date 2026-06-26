/**
 * PDF 사례 2 — 직계비속(손자) 세대생략 할증과세
 *
 * 출처: docs/00-pm/gift-tax-pdf-cases-1-2.plan.md §1
 *
 * - 1차: 2018-05-02 조모(을) → 손자(갑, 성년) 현금 300,000,000
 * - 2차: 2021-05-02 조부(병) → 손자 현금 520,000,000
 * - 3차: 2023-05-02 조모(을) → 손자 현금 1,000,000,000
 *
 * §47② 조부모는 직계존속·그 배우자 → 동일인 합산 (그룹 B).
 * §57① 30% 할증 (성년 + 20억 미만).
 * §58 안분 한도 + §57 한도 안분 적용.
 */

import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  PriorGift,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function cashItem(id: string, amount: number): EstateItem {
  return { id, category: "cash", name: `현금${id}`, marketValue: amount };
}

describe("PDF 사례 2 — 조부모→손자 세대생략 재차증여", () => {
  // ──────────────────────────────────────────────
  // C2-1: 2018-05-02 1차 단독 (조모 → 손자 300M)
  //   ⑤=250M / ⑦=40M / ⑧=12M / ⑫=12M / ⑬=52M / ⑱=49,400,000
  //   (2018년 §69 신고세액공제율 5% — filing-credit-year-rate 도입 후 법령 정합 갱신)
  // ──────────────────────────────────────────────
  describe("C2-1: 1차 단독 신고", () => {
    const input: GiftTaxInput = {
      giftDate: "2018-05-02",
      donorRelation: "lineal_descendant",
      donor: "grandparent",
      giftItems: [cashItem("c2-1", 300_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("donorGroup = B (조부모)", () => {
      expect(result.donorGroup).toBe("B");
    });
    it("⑤ 합산과세표준 = 300M − 50M = 250,000,000", () => {
      expect(result.taxBase).toBe(250_000_000);
    });
    it("⑦ 산출세액 = 250M × 20% − 10M = 40,000,000", () => {
      expect(result.computedTax).toBe(40_000_000);
    });
    it("⑧ 할증과세 = 40M × 100% × 30% = 12,000,000", () => {
      expect(result.generationSkipSurchargeDetail?.surchargeBase).toBe(
        12_000_000,
      );
    });
    it("⑫ 추가 할증세액 = ⑧ − ⑪(0) = 12,000,000", () => {
      expect(result.additionalGenerationSkipSurcharge).toBe(12_000_000);
    });
    it("⑬ 산출세액합계 = ⑦ + ⑫ = 52,000,000", () => {
      expect(
        result.generationSkipSurchargeDetail?.totalComputedTaxWithSurcharge,
      ).toBe(52_000_000);
    });
    it("⑱ 차가감자진납부세액 = 49,400,000 (2018년 신고세액공제 5% = 2,600,000)", () => {
      // ⑬ 52,000,000 − §69 신고세액공제 floor(52M×5%)=2,600,000 = 49,400,000
      expect(result.creditDetail.filingCreditRate).toBe(0.05);
      expect(result.finalTax).toBe(49_400_000);
    });
  });

  // ──────────────────────────────────────────────
  // C2-2: 2021-05-02 2차 합산 (조부 → 손자 520M)
  // ──────────────────────────────────────────────
  describe("C2-2: 2차 합산 신고 (1차 조모 → 2차 조부, §47② 동일인 그룹 B)", () => {
    const prior: PriorGift[] = [
      {
        giftDate: "2018-05-02",
        isHeir: false,
        giftAmount: 300_000_000,
        giftTaxPaid: 50_440_000,
        donor: "grandparent",
        computedTax: 40_000_000,
        giftTaxBase: 250_000_000,
        additionalGenerationSkipSurcharge: 12_000_000,
        wasGenerationSkip: true,
      },
    ];
    const input: GiftTaxInput = {
      giftDate: "2021-05-02",
      donorRelation: "lineal_descendant",
      donor: "grandparent",
      giftItems: [cashItem("c2-2", 520_000_000)],
      priorGiftsWithin10Years: prior,
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("⑤ = 520M + 300M − 50M = 770,000,000", () => {
      expect(result.taxBase).toBe(770_000_000);
    });
    it("⑦ = 770M × 30% − 60M = 171,000,000", () => {
      expect(result.computedTax).toBe(171_000_000);
    });
    it("⑧ 할증과세 = 171M × 100% × 30% = 51,300,000", () => {
      expect(result.generationSkipSurchargeDetail?.surchargeBase).toBe(
        51_300_000,
      );
    });
    it("⑨ 누적 기할증과세액 = 1차 ⑫ = 12,000,000", () => {
      expect(
        result.generationSkipSurchargeDetail?.priorAdditionalCumulative,
      ).toBe(12_000_000);
    });
    it("⑩ 공제한도 = 171M × 250M/770M × 30% = 16,655,844", () => {
      expect(result.generationSkipSurchargeDetail?.surchargeCreditLimit).toBe(
        16_655_844,
      );
    });
    it("⑪ 차감 기할증 = Min(12M, 16.6M) = 12,000,000", () => {
      expect(result.generationSkipSurchargeDetail?.priorSurchargeCredit).toBe(
        12_000_000,
      );
    });
    it("⑫ 추가 할증세액 = 51.3M − 12M = 39,300,000", () => {
      expect(result.additionalGenerationSkipSurcharge).toBe(39_300_000);
    });
    it("⑬ 산출세액합계 = ⑦ + ⑫ = 210,300,000", () => {
      expect(
        result.generationSkipSurchargeDetail?.totalComputedTaxWithSurcharge,
      ).toBe(210_300_000);
    });
    it("⑭ 가산 증여재산 산출세액 = 1차 ⑦ = 40,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(40_000_000);
    });
    it("⑮ 한도 = floor(171M × 250M/770M) = 55,519,480 (PDF 55,519,481은 round 오차)", () => {
      // PDF 표 55,519,481은 round 처리, 엔진은 단일 floor 산식 → 55,519,480
      expect(result.priorGiftCreditDetail?.creditLimit).toBe(55_519_480);
    });
    it("⑯ 공제액 = Min(40M, 55.5M) = 40,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorPaidCredit).toBe(40_000_000);
    });
    it("⑰ 신고세액공제 = (210.3M − 40M) × 3% = 5,109,000", () => {
      expect(result.creditDetail.filingCredit).toBe(5_109_000);
    });
    it("⑱ 차가감자진납부세액 = 210.3M − 40M − 5,109,000 = 165,191,000", () => {
      expect(result.finalTax).toBe(165_191_000);
    });
  });

  // ──────────────────────────────────────────────
  // C2-3: 2023-05-02 3차 합산 (PDF 사례 2 본문, 18 anchor)
  // ──────────────────────────────────────────────
  describe("C2-3: 3차 합산 신고 (PDF 사례 2 본문, 18행)", () => {
    const prior: PriorGift[] = [
      {
        giftDate: "2018-05-02",
        isHeir: false,
        giftAmount: 300_000_000,
        giftTaxPaid: 50_440_000,
        donor: "grandparent",
        computedTax: 40_000_000,
        giftTaxBase: 250_000_000,
        additionalGenerationSkipSurcharge: 12_000_000,
        wasGenerationSkip: true,
      },
      {
        giftDate: "2021-05-02",
        isHeir: false,
        giftAmount: 520_000_000,
        giftTaxPaid: 165_191_000,
        donor: "grandparent",
        computedTax: 171_000_000,
        giftTaxBase: 770_000_000,
        additionalGenerationSkipSurcharge: 39_300_000,
        wasGenerationSkip: true,
      },
    ];
    const input: GiftTaxInput = {
      giftDate: "2023-05-02",
      donorRelation: "lineal_descendant",
      donor: "grandparent",
      giftItems: [cashItem("c2-3", 1_000_000_000)],
      priorGiftsWithin10Years: prior,
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("③ 가산 합계 = 300M + 520M = 820,000,000 → aggregatedGiftValue 1,820M", () => {
      expect(result.aggregatedGiftValue).toBe(1_820_000_000);
    });
    it("⑤ 합산과세표준 = 1,820M − 50M = 1,770,000,000", () => {
      expect(result.taxBase).toBe(1_770_000_000);
    });
    it("⑥ 세율 = 40%", () => {
      const row6 = result.filingFormRows.find((r) => r.number === "⑥");
      expect(row6?.formula).toBe("40%");
    });
    it("⑦ 산출세액 = 1,770M × 40% − 160M = 548,000,000", () => {
      expect(result.computedTax).toBe(548_000_000);
    });
    it("⑧ 할증과세 = 548M × 100% × 30% = 164,400,000", () => {
      expect(result.generationSkipSurchargeDetail?.surchargeBase).toBe(
        164_400_000,
      );
    });
    it("⑨ 누적 기할증과세액 = 12M + 39.3M = 51,300,000", () => {
      expect(
        result.generationSkipSurchargeDetail?.priorAdditionalCumulative,
      ).toBe(51_300_000);
    });
    it("⑩ 공제한도 = 548M × 770M/1770M × 30% = 71,518,644", () => {
      expect(result.generationSkipSurchargeDetail?.surchargeCreditLimit).toBe(
        71_518_644,
      );
    });
    it("⑪ 차감 기할증 = Min(51.3M, 71.5M) = 51,300,000", () => {
      expect(result.generationSkipSurchargeDetail?.priorSurchargeCredit).toBe(
        51_300_000,
      );
    });
    it("⑫ 추가 할증세액 = 164.4M − 51.3M = 113,100,000", () => {
      expect(result.additionalGenerationSkipSurcharge).toBe(113_100_000);
    });
    it("⑬ 산출세액합계 = ⑦ + ⑫ = 661,100,000", () => {
      expect(
        result.generationSkipSurchargeDetail?.totalComputedTaxWithSurcharge,
      ).toBe(661_100_000);
    });
    it("⑭ 가산 증여재산 산출세액 = 2차 ⑦ = 171,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(171_000_000);
    });
    it("⑮ 한도 = 548M × 770M/1770M = 238,395,480", () => {
      expect(result.priorGiftCreditDetail?.creditLimit).toBe(238_395_480);
    });
    it("⑯ 공제액 = Min(171M, 238.4M) = 171,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorPaidCredit).toBe(171_000_000);
    });
    it("⑰ 신고세액공제 = (661.1M − 171M) × 3% = 14,703,000", () => {
      expect(result.creditDetail.filingCredit).toBe(14_703_000);
    });
    it("⑱ 차가감자진납부세액 = 661.1M − 171M − 14,703,000 = 475,397,000", () => {
      expect(result.finalTax).toBe(475_397_000);
    });
    it("filingFormRows 18행 (할증 활성)", () => {
      expect(result.filingFormRows.length).toBe(18);
      expect(result.generationSkipSurchargeDetail).not.toBeNull();
    });
  });
});
