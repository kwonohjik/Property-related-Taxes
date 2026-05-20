/**
 * PDF 사례 1 — 동일인(부모) 재차증여 합산신고
 *
 * 출처: docs/00-pm/gift-tax-pdf-cases-1-2.plan.md §1
 *
 * - 1차: 2021-05-10 부(갑) → 장남(병, 40세 성년) 현금 350,000,000
 * - 2차: 2022-07-20 모(을) → 장남 토지 660㎡ 기준시가 660,000,000
 * - 3차: 2023-04-20 모(을) → 장남 아파트 매매사례가액 510,000,000
 *
 * §47② 부모는 직계존속·그 배우자 → 동일인 합산.
 * §57 미적용 (donor=A 부모).
 * §58 안분 한도 적용.
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

function realEstateItem(id: string, amount: number): EstateItem {
  return {
    id,
    category: "real_estate_apartment",
    name: `재산${id}`,
    marketValue: amount,
  };
}

describe("PDF 사례 1 — 동일인(부모) 재차증여 합산신고", () => {
  // ──────────────────────────────────────────────
  // C1-1: 2021-05-10 1차 단독 신고 (부 → 장남 현금 350M)
  //   ⑤=300,000,000 / ⑦=50,000,000 / ⑪=1,500,000 / ⑫=48,500,000
  // ──────────────────────────────────────────────
  describe("C1-1: 1차 단독 신고", () => {
    const input: GiftTaxInput = {
      giftDate: "2021-05-10",
      donorRelation: "lineal_descendant",
      donor: "father",
      giftItems: [cashItem("c1-1", 350_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("⑤ 합산과세표준 = 350M − 50M(직계존속 공제) = 300,000,000", () => {
      expect(result.taxBase).toBe(300_000_000);
    });
    it("⑦ 산출세액 = 300M × 20% − 누진공제 10M = 50,000,000", () => {
      expect(result.computedTax).toBe(50_000_000);
    });
    it("⑪ 신고세액공제 = 50M × 3% = 1,500,000", () => {
      expect(result.creditDetail.filingCredit).toBe(1_500_000);
    });
    it("⑫ 차가감자진납부세액 = 48,500,000", () => {
      expect(result.finalTax).toBe(48_500_000);
    });
    it("donorGroup = A (부모)", () => {
      expect(result.donorGroup).toBe("A");
    });
    it("§57 비활성 — generationSkipSurchargeDetail = null", () => {
      expect(result.generationSkipSurchargeDetail).toBeNull();
    });
  });

  // ──────────────────────────────────────────────
  // C1-2: 2022-07-20 2차 합산 (모 → 장남 토지 660M, 1차 합산)
  //   ⑤=960M / ⑦=228M / ⑧=50M / ⑨=71,250,000 / ⑩=50M / ⑪=5,340,000 / ⑫=172,660,000
  // ──────────────────────────────────────────────
  describe("C1-2: 2차 합산 신고 (1차 부 → 2차 모, §47② 동일인)", () => {
    const prior: PriorGift[] = [
      {
        giftDate: "2021-05-10",
        isHeir: false,
        giftAmount: 350_000_000,
        giftTaxPaid: 48_500_000,
        donor: "father",
        computedTax: 50_000_000,
        giftTaxBase: 300_000_000,
      },
    ];
    const input: GiftTaxInput = {
      giftDate: "2022-07-20",
      donorRelation: "lineal_descendant",
      donor: "mother",
      giftItems: [realEstateItem("c1-2", 660_000_000)],
      priorGiftsWithin10Years: prior,
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("⑤ 합산과세표준 = 660M + 350M − 50M = 960,000,000", () => {
      expect(result.taxBase).toBe(960_000_000);
    });
    it("⑦ 산출세액 = 960M × 30% − 누진공제 60M = 228,000,000", () => {
      expect(result.computedTax).toBe(228_000_000);
    });
    it("⑧ 가산 증여재산 산출세액 = 50M (1차 ⑦)", () => {
      expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(50_000_000);
    });
    it("⑨ 한도 = 228M × 300M/960M = 71,250,000", () => {
      expect(result.priorGiftCreditDetail?.creditLimit).toBe(71_250_000);
    });
    it("⑩ 공제액 = Min(50M, 71.25M) = 50,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorPaidCredit).toBe(50_000_000);
    });
    it("⑪ 신고세액공제 = (228M − 50M) × 3% = 5,340,000", () => {
      expect(result.creditDetail.filingCredit).toBe(5_340_000);
    });
    it("⑫ 차가감자진납부세액 = 228M − 50M − 5.34M = 172,660,000", () => {
      expect(result.finalTax).toBe(172_660_000);
    });
  });

  // ──────────────────────────────────────────────
  // C1-3: 2023-04-20 3차 합산 (PDF 사례 1 본문)
  //   ⑤=1,470M / ⑦=428M / ⑧=228M / ⑨=279,510,204 / ⑩=228M / ⑪=6M / ⑫=194,000,000
  // ──────────────────────────────────────────────
  describe("C1-3: 3차 합산 신고 (PDF 사례 1 본문)", () => {
    const prior: PriorGift[] = [
      {
        giftDate: "2021-05-10",
        isHeir: false,
        giftAmount: 350_000_000,
        giftTaxPaid: 48_500_000,
        donor: "father",
        computedTax: 50_000_000,
        giftTaxBase: 300_000_000,
      },
      {
        giftDate: "2022-07-20",
        isHeir: false,
        giftAmount: 660_000_000,
        giftTaxPaid: 172_660_000,
        donor: "mother",
        computedTax: 228_000_000,
        giftTaxBase: 960_000_000,
      },
    ];
    const input: GiftTaxInput = {
      giftDate: "2023-04-20",
      donorRelation: "lineal_descendant",
      donor: "mother",
      giftItems: [realEstateItem("c1-3", 510_000_000)],
      priorGiftsWithin10Years: prior,
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);

    it("③ 가산액 = 1,010,000,000", () => {
      expect(result.aggregatedGiftValue).toBe(1_520_000_000);
      // grossGiftValue(510M) + priorTotal(350+660=1,010M) = 1,520M
    });
    it("⑤ 합산과세표준 = 1,520M − 50M = 1,470,000,000", () => {
      expect(result.taxBase).toBe(1_470_000_000);
    });
    it("⑦ 산출세액 = 1,470M × 40% − 누진공제 160M = 428,000,000", () => {
      expect(result.computedTax).toBe(428_000_000);
    });
    it("⑧ 가산 증여재산 산출세액 = 2차 ⑦ = 228,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorComputedTax).toBe(228_000_000);
    });
    it("⑨ 한도 = 428M × 960M/1470M = 279,510,204", () => {
      expect(result.priorGiftCreditDetail?.creditLimit).toBe(279_510_204);
    });
    it("⑩ 공제액 = Min(228M, 279.5M) = 228,000,000", () => {
      expect(result.priorGiftCreditDetail?.priorPaidCredit).toBe(228_000_000);
    });
    it("⑪ 신고세액공제 = (428M − 228M) × 3% = 6,000,000", () => {
      expect(result.creditDetail.filingCredit).toBe(6_000_000);
    });
    it("⑫ 차가감자진납부세액 = 428M − 228M − 6M = 194,000,000", () => {
      expect(result.finalTax).toBe(194_000_000);
    });
    it("filingFormRows 12행 (할증 없음)", () => {
      expect(result.filingFormRows.length).toBe(12);
      expect(result.generationSkipSurchargeDetail).toBeNull();
    });
  });
});
