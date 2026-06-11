/**
 * 조특법 특례 한도 초과분 일반 스트림 이관 + §30의6① 영위기간 한도 분기 Anchor
 *
 * 법령 근거 (KoreanLaw 현행 본문 20260602 시행분 대조):
 *   §30의5① — "창업자금"은 증여세 과세가액 50억원(10명 이상 신규 고용 시 100억원)을
 *     한도로 정의 → 한도 초과분은 창업자금이 아니므로 일반 증여세 과세.
 *   §30의5⑪ — 창업자금 외의 다른 증여재산 가액은 창업자금 과세가액에 가산하지 아니함
 *     → 초과분(=창업자금 외 재산)은 별도 일반 스트림.
 *   §30의6① 각 호 — 가업승계 한도: 10년 이상 20년 미만 300억 / 20년 이상 30년 미만
 *     400억 / 30년 이상 600억. 한도 초과분 동일하게 일반 과세.
 *
 * 종전 버그 (R3 후속 실증): 한도 초과분이 특례 스트림에서 캡되기만 하고 일반 스트림에
 * 합산되지 않아 과세 누락 — 창업 60억과 50억의 finalTax가 동일(4.5억)했음.
 * + familyBusinessYears가 14지점 미동기화로 항상 기본 10년(300억 한도) 고정이었음.
 *
 * 수치는 §26 누진세율(1억 10% / 5억 20%·누진공제 1천만 / 10억 30%·6천만 /
 * 30억 40%·1.6억 / 초과 50%·4.6억) + §53 직계존속 5천만 + §69 3% 수동 계산으로 고정.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  GiftDeductionInput,
  GiftTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-prior-gift.types";

function makeEstateItem(
  id: string,
  amount: number,
  isSpecial?: boolean,
): EstateItem {
  return {
    id,
    category: "financial",
    name: `자산${id}`,
    marketValue: amount,
    isSpecialTreatmentAsset: isSpecial,
  } as EstateItem;
}

const BASE_CREDIT: GiftTaxCreditInput = { isFiledOnTime: true };
const BASE_DEDUCTION: GiftDeductionInput = {
  donorRelation: "lineal_ascendant_adult",
  priorUsedDeduction: 0,
};

function makeInput(overrides: Partial<GiftTaxInput>): GiftTaxInput {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: BASE_DEDUCTION,
    creditInput: BASE_CREDIT,
    ...overrides,
  };
}

function startupCredit(overrides: Partial<GiftTaxCreditInput> = {}): GiftTaxCreditInput {
  return {
    ...BASE_CREDIT,
    specialTreatment: "startup",
    startupInvestmentCompleted: true,
    ...overrides,
  };
}

function familyCredit(overrides: Partial<GiftTaxCreditInput> = {}): GiftTaxCreditInput {
  return {
    ...BASE_CREDIT,
    specialTreatment: "family_business",
    ...overrides,
  };
}

describe("§30의5① 창업자금 한도 초과분 — 일반 스트림 이관", () => {
  /**
   * A. 창업자금 60억 (한도 50억)
   *   특례: eligible 50억 − 5억 공제 = 45억 × 10% = 4.5억
   *   일반: 초과 10억 − §53 5천만 = 9.5억 → ×30% − 6천만 = 2.25억 → §69 3% → 218,250,000
   */
  it("[LE-A] 창업 60억: special 450,000,000 + ordinary 218,250,000 = 668,250,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 6_000_000_000)],
        creditInput: startupCredit(),
      }),
    );
    expect(r.specialStreamTax).toBe(450_000_000);
    expect(r.ordinaryStreamTax).toBe(218_250_000);
    expect(r.finalTax).toBe(668_250_000);
  });

  it("[LE-A2] 이관 breakdown step 존재 (10억)", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 6_000_000_000)],
        creditInput: startupCredit(),
      }),
    );
    const step = r.breakdown.find((s) =>
      s.label.includes("특례 한도 초과 신규 증여분 일반 스트림 합산"),
    );
    expect(step).toBeDefined();
    expect(step!.amount).toBe(1_000_000_000);
  });

  it("[LE-B] 창업 50억 정확(한도 이내): 이관 0, finalTax 450,000,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 5_000_000_000)],
        creditInput: startupCredit(),
      }),
    );
    expect(r.specialStreamTax).toBe(450_000_000);
    expect(r.ordinaryStreamTax).toBe(0);
    expect(r.finalTax).toBe(450_000_000);
  });

  it("[LE-C] 창업 60억 + 신규고용 10명 이상(한도 100억): 이관 0, finalTax 550,000,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 6_000_000_000)],
        creditInput: startupCredit({ startupNewHiresAtLeast10: true }),
      }),
    );
    expect(r.specialStreamTax).toBe(550_000_000);
    expect(r.ordinaryStreamTax).toBe(0);
    expect(r.finalTax).toBe(550_000_000);
  });

  /**
   * D. 특례 prior 45억(기납부 4억) + 신규 10억 — 합산 55억, 초과 5억 ≤ 신규 10억 → 이관 5억
   *   특례: (50억 − 5억) × 10% = 4.5억 − 기납부 4억 = 5천만
   *   일반: 5억 − 5천만 = 4.5억 → ×20% − 1천만 = 8천만 → §69 3% → 77,600,000
   */
  it("[LE-D] prior 특례 45억 + 신규 10억: 초과 5억 이관, finalTax 127,600,000", () => {
    const prior: PriorGift = {
      giftDate: "2018-01-01",
      isHeir: false,
      giftAmount: 4_500_000_000,
      giftTaxPaid: 400_000_000,
      donor: "father",
      giftTaxBase: 4_000_000_000,
      computedTax: 400_000_000,
      specialTreatmentType: "startup",
      priorSpecialTaxPaid: 400_000_000,
    };
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 1_000_000_000)],
        priorGiftsWithin10Years: [prior],
        creditInput: startupCredit(),
      }),
    );
    expect(r.specialStreamTax).toBe(50_000_000);
    expect(r.ordinaryStreamTax).toBe(77_600_000);
    expect(r.finalTax).toBe(127_600_000);
  });

  /**
   * E. 특례 prior 60억(기납부 5.5억) + 신규 5억 — 합산 65억, 초과 15억 > 신규 5억
   *   → 이관은 신규 전액 5억으로 캡 (prior 기인 초과분은 과거 신고분 — 이중과세 방지)
   *   특례: 4.5억 − 5.5억 → 0 (음수 가드)
   *   일반: 5억 − 5천만 = 4.5억 → 8천만 → §69 3% → 77,600,000
   */
  it("[LE-E] prior 특례 60억 + 신규 5억: 이관 신규 전액 5억 캡, finalTax 77,600,000", () => {
    const prior: PriorGift = {
      giftDate: "2018-01-01",
      isHeir: false,
      giftAmount: 6_000_000_000,
      giftTaxPaid: 550_000_000,
      donor: "father",
      giftTaxBase: 5_500_000_000,
      computedTax: 550_000_000,
      specialTreatmentType: "startup",
      priorSpecialTaxPaid: 550_000_000,
    };
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 500_000_000)],
        priorGiftsWithin10Years: [prior],
        creditInput: startupCredit(),
      }),
    );
    expect(r.specialStreamTax).toBe(0);
    expect(r.ordinaryStreamTax).toBe(77_600_000);
    expect(r.finalTax).toBe(77_600_000);
    const step = r.breakdown.find((s) =>
      s.label.includes("특례 한도 초과 신규 증여분 일반 스트림 합산"),
    );
    expect(step!.amount).toBe(500_000_000);
  });
});

describe("§30의6① 가업승계 영위기간별 한도 분기 (familyBusinessYears)", () => {
  /**
   * F. 가업 350억 · 영위 25년 → 한도 400억(2호), 초과 0
   *   taxBase 340억 → 120억 × 10% + 220억 × 20% = 12억 + 44억 = 56억
   */
  it("[LE-F] 350억 · 25년(한도 400억): 이관 0, finalTax 5,600,000,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 35_000_000_000)],
        creditInput: familyCredit({ familyBusinessYears: 25 }),
      }),
    );
    expect(r.specialStreamTax).toBe(5_600_000_000);
    expect(r.ordinaryStreamTax).toBe(0);
    expect(r.finalTax).toBe(5_600_000_000);
  });

  /**
   * G. 가업 350억 · 미입력(엔진 기본 10년) → 한도 300억(1호), 초과 50억 이관
   *   특례: taxBase 290억 → 12억 + 170억 × 20% = 46억
   *   일반: 50억 − 5천만 = 49.5억 → ×50% − 4.6억 = 20.15억 → §69 3% → 1,954,550,000
   *   ※ 종전 버그 조합 실증: familyBusinessYears 미도달(항상 10년) + 초과분 과세 누락
   */
  it("[LE-G] 350억 · 미입력(10년 → 한도 300억): 초과 50억 이관, finalTax 6,554,550,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 35_000_000_000)],
        creditInput: familyCredit(),
      }),
    );
    expect(r.specialStreamTax).toBe(4_600_000_000);
    expect(r.ordinaryStreamTax).toBe(1_954_550_000);
    expect(r.finalTax).toBe(6_554_550_000);
  });

  it("[LE-H] 350억 · 30년(한도 600억): 이관 0, finalTax 5,600,000,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 35_000_000_000)],
        creditInput: familyCredit({ familyBusinessYears: 30 }),
      }),
    );
    expect(r.specialStreamTax).toBe(5_600_000_000);
    expect(r.finalTax).toBe(5_600_000_000);
  });

  it("[LE-H2] 350억 · 정확히 20년 경계(한도 400억): 이관 0 — 25년과 동일", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 35_000_000_000)],
        creditInput: familyCredit({ familyBusinessYears: 20 }),
      }),
    );
    expect(r.specialStreamTax).toBe(5_600_000_000);
    expect(r.finalTax).toBe(5_600_000_000);
  });

  /**
   * I. 가업 20억 · 영위 5년(10년 미만) → 특례 불가(§30의6①) — 전액 일반 폴백
   *   일반: 20억 − 5천만 = 19.5억 → ×40% − 1.6억 = 6.2억 → §69 3% → 601,400,000
   */
  it("[LE-I] 20억 · 5년: 특례 불가 → 전액 일반, finalTax 601,400,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [makeEstateItem("a", 2_000_000_000)],
        creditInput: familyCredit({ familyBusinessYears: 5 }),
      }),
    );
    expect(r.specialStreamTax ?? 0).toBe(0);
    expect(r.finalTax).toBe(601_400_000);
  });
});
