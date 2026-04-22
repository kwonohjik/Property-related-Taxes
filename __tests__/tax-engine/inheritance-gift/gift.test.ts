/**
 * 증여세 메인 엔진 통합 단위 테스트 (E10~E21)
 *
 * 계산 파이프라인 전체를 관통하여 결정세액을 검증.
 * 핵심 계산 원칙:
 *   - §26 구간: 1억이하10%, [1억+1~5억]20%-1천만, [5억+1~10억]30%-6천만
 *   - §69 신고공제: 남은세액 × 3%
 *   - §57 세대생략: 성년 30%, 미성년+20억초과 40%
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

function financialItem(id: string, amount: number): EstateItem {
  return { id, category: "financial", name: `예금${id}`, marketValue: amount };
}

describe("증여세 메인 엔진 — calcGiftTax()", () => {
  // ──── E10: 공제 한도 내 → 세액 0 ──────────────────────────
  it("[E10] 직계비속 5천만 → 공제 한도(5천만) 내 → 결정세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 50_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(50_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E11: 과세표준 1억 → 세액 10M ───────────────────────
  it("[E11] 직계비속 1억5천만 → 공제 5천만, 과세표준 1억 → 세액 1천만", () => {
    /**
     * 과세표준 = 1.5억 - 5천만 = 1억
     * 산출세액 = floor(1억 × 0.1) - 0 = 10,000,000
     * 신고공제 = floor(10M × 0.03) = 300,000
     * 결정세액 = 9,700,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(100_000_000);
    expect(result.computedTax).toBe(10_000_000);
    expect(result.creditDetail.filingCredit).toBe(300_000);
    expect(result.finalTax).toBe(9_700_000);
  });

  // ──── E12: 50만원 미만 → 과세 없음 ───────────────────────
  it("[E12] 기타친족 1천40만 → 공제 1천만, 과표 40만 < 50만 → 세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "other_relative",
      giftItems: [financialItem("1", 10_400_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "other_relative" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    // rawTaxBase = 400,000 < 500,000 → taxBase = 0
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E13: 10년 합산 → 공제 소진 ─────────────────────────
  it("[E13] 직계비속 5천만 + 기증여 4천만 → 공제잔여 1천만, 과표 4천만", () => {
    /**
     * 금번 증여 5천만, 기증여 4천만 (10년 내)
     * aggregatedGiftValue = 5천만 + 4천만 = 9천만
     * 관계공제 = 5천만 - 4천만(기사용) = 1천만
     * 과세표준 = 9천만 - 1천만 = 8천만
     * 산출세액 = floor(8천만 × 0.1) = 8,000,000
     * 신고공제 = floor(8M × 0.03) = 240,000
     * 결정세액 = 7,760,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-06-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 50_000_000)],
      priorGiftsWithin10Years: [
        {
          giftDate: "2022-01-01",
          isHeir: false,
          giftAmount: 40_000_000,
          giftTaxPaid: 0,
        },
      ],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_descendant",
        priorUsedDeduction: 40_000_000, // 기사용 공제
      },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.aggregatedGiftValue).toBe(90_000_000);
    expect(result.totalDeduction).toBe(10_000_000); // 잔여 공제
    expect(result.taxBase).toBe(80_000_000);
    expect(result.computedTax).toBe(8_000_000);
    expect(result.finalTax).toBe(7_760_000);
  });

  // ──── E14: 세대생략 30% 할증 (성인) ──────────────────────
  it("[E14] 세대생략(성인) — 과표 2.5억, 산출 4천만 → 할증 1200만", () => {
    /**
     * 직계비속 3억, 공제 5천만 → 과세표준 2.5억
     * 산출세액 = floor(2.5억 × 0.2) - 1천만 = 5천만 - 1천만 = 40,000,000
     * 세대생략 30%: floor(40M × 0.3) = 12,000,000
     * 신고공제: floor((40M + 12M) × 0.03) = floor(52M × 0.03) = 1,560,000
     * 결정세액 = 40M + 12M - 1.56M = 50,440,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 300_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(250_000_000);
    expect(result.computedTax).toBe(40_000_000);
    expect(result.generationSkipSurcharge).toBe(12_000_000);
    expect(result.creditDetail.filingCredit).toBe(1_560_000);
    expect(result.finalTax).toBe(50_440_000);
  });

  // ──── E15: 세대생략 40% 할증 (미성년 + 20억 초과) ────────
  it("[E15] 세대생략(미성년, 과표 29.5억) → 할증 40%", () => {
    /**
     * 직계비속 30억, 공제 5천만 → 과세표준 2,950,000,000
     * §26 구간 확인: 2.95억 ≤ 30억 → [10억+1~30억] 40% 구간
     * 산출세액 = floor(2.95억 × 0.4) - 1.6억 = 11.8억 - 1.6억 = 1,020,000,000
     * 과세표준 2.95억 > 20억 + 미성년 → 할증 40%
     * 세대생략 40%: floor(1020M × 0.4) = 408,000,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 3_000_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: true,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(2_950_000_000);
    expect(result.computedTax).toBe(1_020_000_000); // 40% 구간
    expect(result.generationSkipSurcharge).toBe(408_000_000); // 40% 할증
  });

  // ──── E16: 배우자 증여 6억 → 공제 한도 내 ────────────────
  it("[E16] 배우자 6억 → 공제 6억 한도 → 세액 0", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "spouse",
      giftItems: [financialItem("1", 600_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "spouse" },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(600_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E17: 혼인·출산 공제 포함 ───────────────────────────
  it("[E17] 성인직계존속 1억5천만 + 혼인공제 1억 → 과세표준 0", () => {
    /**
     * 직계존속(성인) 기본공제: 5천만
     * 혼인·출산공제: 1억 (단, 기본공제와 별도)
     * 총공제 = 5천만 + 1억 = 1억5천만
     * 과세표준 = 1.5억 - 1.5억 = 0
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_ascendant_adult",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: {
        donorRelation: "lineal_ascendant_adult",
        marriageExemption: 100_000_000,
      },
      creditInput: { isFiledOnTime: true },
    };
    const result = calcGiftTax(input);
    expect(result.totalDeduction).toBe(150_000_000);
    expect(result.taxBase).toBe(0);
    expect(result.finalTax).toBe(0);
  });

  // ──── E18: 기한 미신고 → 신고공제 없음 ───────────────────
  it("[E18] 기한 내 미신고 → 신고공제 0, 결정세액 = 산출세액", () => {
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 150_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false }, // 미신고
    };
    const result = calcGiftTax(input);
    // 신고공제 없음 → 결정세액 = 산출세액
    expect(result.creditDetail.filingCredit).toBe(0);
    expect(result.computedTax).toBe(10_000_000);
    expect(result.finalTax).toBe(10_000_000);
  });

  // ──── E19: 세대생략 40% 경계값 — 미성년 정확히 20억 → 30% ──
  it("[E19] 세대생략(미성년, 증여재산가액 정확히 20억) → 30% 할증 (초과 아님)", () => {
    /**
     * §57 ②: 미성년자 + 증여재산가액 20억 "초과" 시 40%.
     * 정확히 20억은 초과가 아니므로 기본 30% 적용.
     *
     * 직계비속 20억, 공제 5천만 → 과세표준 1,950,000,000
     * 산출세액: [10억+1~30억] 40% 구간
     *   floor(1,950,000,000 × 0.4) - 160,000,000 = 780M - 160M = 620,000,000
     * 세대생략 30%: floor(620M × 0.3) = 186,000,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 2_000_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: true,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(1_950_000_000);
    expect(result.computedTax).toBe(620_000_000);
    expect(result.generationSkipSurcharge).toBe(186_000_000); // 30%, NOT 40%
  });

  // ──── E20: 세대생략 40% 경계값 — 미성년 20억+1원 → 40% ─────
  it("[E20] 세대생략(미성년, 증여재산가액 20억+1원) → 40% 할증 (초과)", () => {
    /**
     * §57 ②: 미성년자 + 증여재산가액 20억 초과 → 40%.
     * 2,000,000,001원은 20억 초과이므로 40% 적용.
     *
     * 직계비속 20억+1원, 공제 5천만
     * 과세표준 = 2,000,000,001 - 50,000,000 = 1,950,000,001 (상증법 §55 절사 규정 없음)
     * 산출세액 = floor(1,950,000,001×0.4 - 160,000,000) = 620,000,000
     * 세대생략 40%: floor(620M × 0.4) = 248,000,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 2_000_000_001)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: true,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(1_950_000_001);
    expect(result.computedTax).toBe(620_000_000);
    expect(result.generationSkipSurcharge).toBe(248_000_000); // 40%, 미성년+20억 초과
  });

  // ──── E21: 세대생략 — 성년 30억 → 항상 30% ─────────────────
  it("[E21] 세대생략(성년, 증여재산가액 30억) → 30% 할증 (성년은 금액 무관 항상 30%)", () => {
    /**
     * §57 ②: 40%는 미성년자 조건 필수. 성년은 금액과 무관하게 30%.
     *
     * 직계비속 30억, 공제 5천만 → 과세표준 2,950,000,000
     * 산출세액: [10억+1~30억] 40% 구간
     *   floor(2,950,000,000 × 0.4) - 160,000,000 = 1,180M - 160M = 1,020,000,000
     * 세대생략 30%: floor(1,020M × 0.3) = 306,000,000
     */
    const input: GiftTaxInput = {
      giftDate: "2025-01-01",
      donorRelation: "lineal_descendant",
      giftItems: [financialItem("1", 3_000_000_000)],
      priorGiftsWithin10Years: [],
      isGenerationSkip: true,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_descendant" },
      creditInput: { isFiledOnTime: false },
    };
    const result = calcGiftTax(input);
    expect(result.taxBase).toBe(2_950_000_000);
    expect(result.computedTax).toBe(1_020_000_000);
    expect(result.generationSkipSurcharge).toBe(306_000_000); // 30%, 성년은 항상 30%
  });
});
