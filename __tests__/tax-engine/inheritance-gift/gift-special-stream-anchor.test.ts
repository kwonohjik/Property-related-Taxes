/**
 * 조특법 증여세 특례 2-스트림 분리과세 정식 Anchor 테스트
 *
 * 법령 근거:
 *   §30의5① — 창업자금: 5억 공제, 10% 단일세율
 *   §30의5①후단 — 2회 이상 증여 시 기간무관 합산
 *   §30의5⑪ — 창업자금 외 자산은 창업자금 과세가액에 §47② 합산 금지
 *   §30의5⑫ — §69 신고세액공제 배제 (특례 스트림)
 *   §30의6① — 가업승계: 10억 공제, 120억 이하 10% / 초과 20%
 *   §30의6⑤ — §30의5 제8항~제13항 준용
 *
 * 수치는 probe 실측 후 수동 계산과 대조하여 toBe() 고정.
 *
 * Anchor 목록:
 *   A. 혼합 증여 (창업 30억 + 일반 5억) — 2-스트림 분리 합산
 *   B. 일반 prior 10억 + 신규 창업 20억 — §30의5⑪ 미합산
 *   C. 과거 특례 prior 10억(15년, startup) + 신규 창업 20억 — 기간무관 합산
 *   D. 단일 자산 자동 귀속 — isSpecialTreatmentAsset 미설정 시 전체 특례 귀속
 *   E. 미적격 폴백 — startupInvestmentCompleted=false 시 일반 스트림 전환
 *   F. 가업승계 120억 초과 20% 구간
 *   G. N개 자산 미귀속 차단 — superRefine validation
 *   H. 일반 prior 없음 + 특례 prior만 있는 경우 (일반 스트림 세액=0 확인)
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
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";

// ============================================================
// 테스트 헬퍼
// ============================================================

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

// ============================================================
// Anchor A — 혼합 증여: 창업 30억(isSpecial=true) + 일반 5억(isSpecial=false)
// ============================================================

describe("[A] 혼합 증여 2-스트림 분리 (창업 30억 + 일반 5억)", () => {
  /**
   * 수동 계산:
   *   특례 스트림: 30억 - 5억(§30의5① 공제) = 25억 × 10% = 2.5억
   *   일반 스트림: 5억 - 5천만(§53 성년) = 4.5억
   *     §56: 4.5억×20% - 1천만 = 8천만
   *     §69: 8천만×3% = 240만
   *     일반 최종: 8천만 - 240만 = 7,760만
   *   최종: 2.5억 + 7,760만 = 327,600,000
   */
  const input = makeInput({
    giftItems: [
      makeEstateItem("startup-30b", 3_000_000_000, true),
      makeEstateItem("land-5b", 500_000_000, false),
    ],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
    },
  });

  it("[A-1] finalTax = 2.5억(특례) + 7,760만(일반) = 327,600,000", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(327_600_000);
  });

  it("[A-2] specialStreamTax = 250,000,000 (창업 30억만 기준)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax).toBe(250_000_000);
  });

  it("[A-3] ordinaryStreamTax = 77,600,000 (일반 5억 별도 계산)", () => {
    const r = calcGiftTax(input);
    expect(r.ordinaryStreamTax).toBe(77_600_000);
  });

  it("[A-4] specialStreamAggregatedValue = 3,000,000,000 (창업자금만)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamAggregatedValue).toBe(3_000_000_000);
  });

  it("[A-5] §30의5⑪: 일반 자산 5억이 특례 스트림에 합산되지 않음", () => {
    const r = calcGiftTax(input);
    // 특례 스트림 합산 = 창업 30억만 (일반 5억 미포함)
    expect(r.specialStreamAggregatedValue).toBe(3_000_000_000);
    // 일반 스트림 합산 = 5억 (별도 계산)
    expect(r.aggregatedGiftValue).toBe(500_000_000);
  });
});

// ============================================================
// Anchor B — 일반 prior 10억(동일인, 10년 내) + 신규 창업 20억
// ============================================================

describe("[B] 일반 prior 10억 + 창업자금 20억 — §30의5⑪ 미합산", () => {
  /**
   * §30의5⑪: 창업자금 과세가액 계산 시 "창업자금 외의 다른 증여재산"은 §47② 합산 금지.
   *
   * 수동 계산:
   *   특례 스트림: 신규 창업 20억 - 5억(공제) = 15억 × 10% = 1.5억 (일반 prior 미합산)
   *   일반 스트림: 일반 prior 10억(§47 10년 합산)
   *     §53 공제 잔여: priorUsedDeduction=5천만 → 총 한도(5천만) 이미 소진 → 공제 0
   *     과세표준: 10억
   *     §56: 10억×30% - 6천만 = 2.4억
   *     §58 기납부: min(5천만, 2.4억×1) = 5천만
   *     §69 base: 2.4억 - 5천만 = 1.9억, §69: 1.9억×3% = 570만
   *     일반 최종: 2.4억 - 5천만 - 570만 = 184,300,000
   *   최종: 1.5억 + 184,300,000 = 334,300,000
   */

  const priorOrdinary: PriorGift = {
    giftDate: "2020-06-01",
    isHeir: false,
    giftAmount: 1_000_000_000,
    giftTaxPaid: 0,
    donor: "father",
    giftTaxBase: 500_000_000,
    computedTax: 50_000_000,
  };

  const input = makeInput({
    giftItems: [makeEstateItem("startup-20b", 2_000_000_000, true)],
    priorGiftsWithin10Years: [priorOrdinary],
    deductionInput: {
      donorRelation: "lineal_ascendant_adult",
      priorUsedDeduction: 50_000_000,
    },
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
    },
  });

  it("[B-1] finalTax = 1.5억(특례) + 184,300,000(일반) = 334,300,000", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(334_300_000);
  });

  it("[B-2] specialStreamTax = 150,000,000 (창업 20억만 기준)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax).toBe(150_000_000);
  });

  it("[B-3] ordinaryStreamTax = 184,300,000 (일반 prior 10억 별도 처리)", () => {
    const r = calcGiftTax(input);
    expect(r.ordinaryStreamTax).toBe(184_300_000);
  });

  it("[B-4] §30의5⑪: 특례 스트림에 일반 prior 미합산 — aggregatedGiftValue = 일반 prior만", () => {
    const r = calcGiftTax(input);
    // 일반 스트림 합산 = 일반 prior 10억 (신규 창업자금 미포함)
    expect(r.aggregatedGiftValue).toBe(1_000_000_000);
  });
});

// ============================================================
// Anchor C — 과거 특례 prior 10억(startup, 15년 전) + 신규 창업 20억
// ============================================================

describe("[C] 과거 특례 prior 10억(15년 전) + 신규 창업 20억 — §30의5①후단 기간무관 합산", () => {
  /**
   * §30의5①후단: "창업자금을 2회 이상 증여받거나 부모로부터 각각 증여받는 경우에는
   * 각각의 증여세 과세가액을 합산하여 적용한다." — 기간 무관(10년 cutoff 미적용).
   *
   * 수동 계산:
   *   특례 스트림 합산: 신규 20억 + 특례 prior 10억 = 30억 (기간무관)
   *   특례 과세표준: 30억 - 5억(공제) = 25억
   *   특례 산출세액: 25억 × 10% = 2.5억
   *   기납부 특례세액 차감: 5천만 (priorSpecialTaxPaid)
   *   특례 스트림 최종: 2.5억 - 5천만 = 2억
   *   일반 스트림: 일반 자산 없음 → 0
   *   최종: 2억
   */

  const priorSpecial: PriorGift = {
    giftDate: "2010-01-01", // 15년 전 — §47 10년 cutoff 초과
    isHeir: false,
    giftAmount: 1_000_000_000,
    giftTaxPaid: 50_000_000,
    donor: "father",
    giftTaxBase: 500_000_000,
    computedTax: 50_000_000,
    specialTreatmentType: "startup", // 특례 prior 마킹
    priorSpecialTaxPaid: 50_000_000, // 기납부 특례세액
  };

  const input = makeInput({
    giftItems: [makeEstateItem("startup-20b", 2_000_000_000, true)],
    priorGiftsWithin10Years: [priorSpecial],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
    },
  });

  it("[C-1] finalTax = 200,000,000 (2.5억 - 기납부 5천만)", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(200_000_000);
  });

  it("[C-2] specialStreamTax = 200,000,000", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax).toBe(200_000_000);
  });

  it("[C-3] specialStreamAggregatedValue = 3,000,000,000 (기간무관 30억 합산)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamAggregatedValue).toBe(3_000_000_000);
  });

  it("[C-4] ordinaryStreamTax = 0 (일반 자산 없음)", () => {
    const r = calcGiftTax(input);
    expect(r.ordinaryStreamTax ?? 0).toBe(0);
  });
});

// ============================================================
// Anchor D — 단일 자산 자동 귀속
// ============================================================

describe("[D] 단일 자산 자동 귀속 — isSpecialTreatmentAsset 미설정 시 자동 특례 귀속", () => {
  /**
   * giftItems.length === 1 시: isSpecialTreatmentAsset 값 무관하게 자동 전체 특례 귀속.
   *
   * 수동 계산:
   *   창업 20억 - 5억(공제) = 15억 × 10% = 1.5억
   *   §69 배제 (§30의5⑫) → 최종 = 1.5억
   */

  const input = makeInput({
    giftItems: [
      // isSpecialTreatmentAsset 미설정
      { id: "s1", category: "financial", name: "창업자산", marketValue: 2_000_000_000 } as EstateItem,
    ],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
    },
  });

  it("[D-1] finalTax = 150,000,000 (단일 자산 자동 귀속)", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(150_000_000);
  });

  it("[D-2] specialStreamTax = 150,000,000", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax).toBe(150_000_000);
  });

  it("[D-3] ordinaryStreamTax = 0 (일반 스트림 없음)", () => {
    const r = calcGiftTax(input);
    expect(r.ordinaryStreamTax ?? 0).toBe(0);
  });
});

// ============================================================
// Anchor E — 미적격 폴백: startupInvestmentCompleted=false
// ============================================================

describe("[E] 미적격 폴백 — 창업자금 투자 미완료 시 일반 스트림 전환", () => {
  /**
   * §30의5④: 투자 완료 조건 미충족 시 특례 미적용, 전체 자산이 일반 스트림으로 처리.
   *
   * 수동 계산 (20억 전체 일반 스트림):
   *   부모→성년 §53 공제 5천만, 과세표준 = 19.5억
   *   §56: 19.5억×40% - 1.6억 = 7.8억 - 1.6억 = 6.2억
   *   §69: 6.2억×3% = 186만
   *   최종: 6.2억 - 186만 = 601,400,000 (probe 확인됨)
   */

  const input = makeInput({
    giftItems: [makeEstateItem("s1", 2_000_000_000, true)],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: false, // 투자 미완료
    },
  });

  it("[E-1] finalTax = 601,400,000 (일반 스트림 폴백)", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(601_400_000);
  });

  it("[E-2] specialStreamTax = 0 (미적격)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax ?? 0).toBe(0);
  });

  it("[E-3] 경고 메시지 포함 — 투자완료 조건 미충족", () => {
    const r = calcGiftTax(input);
    const hasWarning = r.warnings.some((w) =>
      w.includes("창업자금 투자 완료 조건 미충족"),
    );
    expect(hasWarning).toBe(true);
  });
});

// ============================================================
// Anchor F — 가업승계 120억 초과 20% 구간
// ============================================================

describe("[F] 가업승계 특례 120억 초과 20% — §30의6①", () => {
  /**
   * 가업 150억, 영위 15년 → 한도 300억 내
   *   과세표준: 150억 - 10억(공제) = 140억
   *   120억 이하 × 10% = 12억
   *   20억(초과분) × 20% = 4억
   *   grossSpecialTax = 16억
   *   기납부 없음 → 최종 = 16억
   */

  const input = makeInput({
    giftItems: [makeEstateItem("biz1", 15_000_000_000, true)],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "family_business",
      familyBusinessYears: 15, // 10년 이상, 한도 300억
    },
  });

  it("[F-1] finalTax = 1,600,000,000 (120억이하 10% + 초과 20%)", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(1_600_000_000);
  });

  it("[F-2] specialStreamTax = 1,600,000,000", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamTax).toBe(1_600_000_000);
  });
});

// ============================================================
// Anchor G — N개 자산 미귀속 차단 (superRefine validation)
// ============================================================

describe("[G] Zod superRefine — N개 혼합 자산 미귀속 차단 (§30의5⑪)", () => {
  /**
   * N≥2 자산 + specialTreatment 선택 + isSpecialTreatmentAsset 미설정 자산 존재
   * → ZodError 발생 (path: giftItems)
   */

  it("[G-1] N=2, 1개 미설정 → validation 오류", () => {
    const rawInput = {
      giftDate: "2025-01-15",
      donorRelation: "lineal_ascendant_adult",
      donor: "father",
      giftItems: [
        // isSpecialTreatmentAsset=true (설정됨)
        { id: "s1", category: "financial", name: "창업", marketValue: 1_000_000_000, isSpecialTreatmentAsset: true },
        // isSpecialTreatmentAsset 미설정
        { id: "s2", category: "financial", name: "부동산", marketValue: 500_000_000 },
      ],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
      creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
    };

    const result = giftTaxInputSchema.safeParse(rawInput);
    expect(result.success).toBe(false);

    if (!result.success) {
      const giftItemsErrors = result.error.issues.filter((e) =>
        e.path.includes("giftItems"),
      );
      expect(giftItemsErrors.length).toBeGreaterThan(0);
      expect(giftItemsErrors[0].message).toContain("isSpecialTreatmentAsset");
    }
  });

  it("[G-2] N=2, 전부 설정 → validation 통과", () => {
    const rawInput = {
      giftDate: "2025-01-15",
      donorRelation: "lineal_ascendant_adult",
      donor: "father",
      giftItems: [
        { id: "s1", category: "financial", name: "창업", marketValue: 1_000_000_000, isSpecialTreatmentAsset: true },
        { id: "s2", category: "financial", name: "부동산", marketValue: 500_000_000, isSpecialTreatmentAsset: false },
      ],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
      creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
    };

    const result = giftTaxInputSchema.safeParse(rawInput);
    expect(result.success).toBe(true);
  });

  it("[G-3] N=1, isSpecialTreatmentAsset 미설정 → validation 통과 (자동 귀속)", () => {
    const rawInput = {
      giftDate: "2025-01-15",
      donorRelation: "lineal_ascendant_adult",
      donor: "father",
      giftItems: [
        { id: "s1", category: "financial", name: "창업", marketValue: 1_000_000_000 }, // isSpecialTreatmentAsset 미설정
      ],
      priorGiftsWithin10Years: [],
      isGenerationSkip: false,
      isMinorDonee: false,
      deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
      creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
    };

    const result = giftTaxInputSchema.safeParse(rawInput);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// Anchor H — 특례 prior만 있고 일반 prior 없음 + 일반 자산 없음
// ============================================================

describe("[H] 특례 prior만 있고 일반 prior·일반 자산 없음 — 일반 스트림 세액=0", () => {
  /**
   * 특례 prior만 합산 → 일반 스트림 입력 없음 → ordinaryStreamTax = 0
   * 특례: 20억 + 10억(특례 prior) = 30억 → 25억 × 10% - 5천만 = 2억
   */

  const priorSpecial: PriorGift = {
    giftDate: "2022-03-01",
    isHeir: false,
    giftAmount: 1_000_000_000,
    giftTaxPaid: 50_000_000,
    donor: "father",
    specialTreatmentType: "startup",
    priorSpecialTaxPaid: 50_000_000,
  };

  const input = makeInput({
    giftItems: [makeEstateItem("startup-20b", 2_000_000_000, true)],
    priorGiftsWithin10Years: [priorSpecial],
    deductionInput: BASE_DEDUCTION,
    creditInput: {
      ...BASE_CREDIT,
      specialTreatment: "startup",
      startupInvestmentCompleted: true,
    },
  });

  it("[H-1] finalTax = 200,000,000 (특례 스트림만)", () => {
    const r = calcGiftTax(input);
    expect(r.finalTax).toBe(200_000_000);
  });

  it("[H-2] ordinaryStreamTax = 0 (일반 스트림 없음)", () => {
    const r = calcGiftTax(input);
    expect(r.ordinaryStreamTax ?? 0).toBe(0);
  });

  it("[H-3] specialStreamAggregatedValue = 3,000,000,000 (기간 무관 합산)", () => {
    const r = calcGiftTax(input);
    expect(r.specialStreamAggregatedValue).toBe(3_000_000_000);
  });
});
