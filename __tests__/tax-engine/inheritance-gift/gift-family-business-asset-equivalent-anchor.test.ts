/**
 * U-17 가업승계 증여세 과세특례 — 가업자산상당액 anchor
 *
 * 법령 (KoreanLaw MCP 본문 재조회, 계획서 plan_U17.md):
 *   조특법 §30의6① — 「그 주식등의 가액 중 대통령령으로 정하는 가업자산상당액에 대한 증여세 과세가액」에서
 *     10억원 공제 · 10%(120억 초과분 20%). 특례·한도는 가업자산상당액에만 걸린다.
 *   조특령 §27의6⑩ — 가업자산상당액 = 상증령 §15⑤2호를 준용하여 계산한 금액, 「상속개시일」은 「증여일」로 본다.
 *   조특법 §30의5⑬(§30의6⑤ 준용) — 비율분은 상증법 일반 규정(§47②·§53·§56·§57·§58·§69)으로 과세.
 *
 * 사용자 결정: Q-1 해석 B(비율분·한도 초과분에 §69 적용) · Q-2 (a)(특례 주식 인수채무는 가업자산상당액에서 전액 차감).
 *
 * 수치: §26 누진(1억 10% / 5억 20%·1천만 / 10억 30%·6천만 / 30억 40%·1.6억 / 초과 50%·4.6억)
 *       + §53 직계존속 성년 5천만 + §69 3%(2025년 증여) 수동 계산.
 */
import { describe, it, expect } from "vitest";
import { calcGiftTax } from "@/lib/tax-engine/gift-tax";
import type {
  GiftTaxInput,
  EstateItem,
  GiftTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { CorporateNonBusinessAssets } from "@/lib/tax-engine/types/inheritance-corporate-non-business.types";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import {
  validateStep,
  INITIAL_FORM,
  type FormState,
  type GiftSubFormState,
} from "@/components/calc/gift-tax-form-shared";
import {
  giftTaxInputSchema,
  giftSimultaneousRequestSchema,
} from "@/lib/validators/property-valuation-input";
import {
  FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE,
  FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_WARNING,
} from "@/lib/tax-engine/gift-family-business-asset-equivalent";

const FB_CREDIT: GiftTaxCreditInput = {
  isFiledOnTime: true,
  specialTreatment: "family_business",
  familyBusinessYears: 15,
};

function stock(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "s",
    category: "unlisted_stock",
    name: "가업주식",
    marketValue: 5_000_000_000,
    ...overrides,
  } as EstateItem;
}

function makeInput(overrides: Partial<GiftTaxInput>): GiftTaxInput {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems: [],
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult", priorUsedDeduction: 0 },
    creditInput: FB_CREDIT,
    ...overrides,
  };
}

const LAND_2B: CorporateNonBusinessAssets = { nonBusinessLand: 2_000_000_000 };

describe("U-17 엔진 — 가업자산상당액(조특령 §27의6⑩)", () => {
  /**
   * C1: 주식 50억 × (100억 − 20억) ÷ 100억 = 가업자산상당액 40억
   *   특례 (40억 − 10억) × 10% = 300,000,000
   *   일반 비율분 10억 − 5천만 = 9.5억 × 30% − 6천만 = 225,000,000 − §69 6,750,000 = 218,250,000
   *   before 400,000,000 (corporate 필드 무시, 50억 전액 특례)
   */
  it("[C1] 비율 0.8 → special 300,000,000 + ordinary 218,250,000 = 518,250,000", () => {
    const r = calcGiftTax(
      makeInput({ giftItems: [stock({ corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: LAND_2B })] }),
    );
    expect(r.familyBusinessAssetEquivalent).toBe(4_000_000_000);
    expect(r.familyBusinessNonBusinessPortion).toBe(1_000_000_000);
    expect(r.familyBusinessAssetEquivalentDetail).toEqual([
      {
        name: "가업주식",
        grossValue: 5_000_000_000,
        totalAssets: 10_000_000_000,
        sumOfNonBusiness: 2_000_000_000,
        assetEquivalent: 4_000_000_000,
      },
    ]);
    expect(r.specialStreamAggregatedValue).toBe(4_000_000_000);
    expect(r.specialStreamTax).toBe(300_000_000);
    expect(r.creditDetail.filingCredit).toBe(6_750_000);
    expect(r.ordinaryStreamTax).toBe(218_250_000);
    expect(r.finalTax).toBe(518_250_000);
    expect(r.breakdown.some((s) => s.label === "사업무관자산 비율분 일반 스트림 합산" && s.amount === 1_000_000_000)).toBe(true);
  });

  it("[C2] 총자산만 입력(사업무관 0) → 비율 1, 400,000,000 불변", () => {
    const r = calcGiftTax(makeInput({ giftItems: [stock({ corporateTotalAssets: 10_000_000_000 })] }));
    expect(r.familyBusinessAssetEquivalent).toBe(5_000_000_000);
    expect(r.familyBusinessNonBusinessPortion).toBe(0);
    expect(r.finalTax).toBe(400_000_000);
  });

  /**
   * C3: 사업무관 20억 ≥ 총자산 10억 → 가업자산상당액 0 · 특례 0
   *   일반 50억 − 5천만 = 49.5억 × 50% − 4.6억 = 2,015,000,000 − §69 60,450,000 = 1,954,550,000
   */
  it("[C3] 사업무관 ≥ 총자산 → 전액 일반 1,954,550,000 · echo 노출(⑦ 게이트)", () => {
    const r = calcGiftTax(
      makeInput({ giftItems: [stock({ corporateTotalAssets: 1_000_000_000, corporateNonBusinessAssets: LAND_2B })] }),
    );
    expect(r.specialStreamTax).toBe(0);
    expect(r.familyBusinessAssetEquivalent).toBe(0);
    expect(r.familyBusinessNonBusinessPortion).toBe(5_000_000_000);
    expect(r.finalTax).toBe(1_954_550_000);
  });

  it("[C4] 총자산 미입력(엔진 직접 호출) → gross 유지 400,000,000 + 경고", () => {
    const r = calcGiftTax(makeInput({ giftItems: [stock({ corporateNonBusinessAssets: LAND_2B })] }));
    expect(r.finalTax).toBe(400_000_000);
    expect(r.familyBusinessAssetEquivalent).toBeUndefined();
    expect(r.warnings).toContain(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_WARNING);
  });

  it("[C7] 영위 5년(미적격) → gross 전액 일반 1,954,550,000 불변 · 경고·echo 없음", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [stock({ corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: LAND_2B })],
        creditInput: { ...FB_CREDIT, familyBusinessYears: 5 },
      }),
    );
    expect(r.finalTax).toBe(1_954_550_000);
    expect(r.familyBusinessAssetEquivalent).toBeUndefined();
    expect(r.warnings).not.toContain(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_WARNING);
  });

  /**
   * C8 (회귀): 주식 500억 × 0.8 = 가업자산상당액 400억 > 한도 300억(영위 15년)
   *   특례 300억 − 10억 = 290억 → 120억 × 10% + 170억 × 20% = 4,600,000,000
   *   일반 = 한도 초과 100억 + 비율분 100억 = 200억 − 5천만 → × 50% − 4.6억 = 9,515,000,000 − §69 285,450,000
   *   = 9,229,550,000 · 합계 13,829,550,000 (before와 같다)
   */
  it("[C8] 가업자산상당액 ≥ 한도 → 13,829,550,000 불변", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [stock({ marketValue: 50_000_000_000, corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: LAND_2B })],
      }),
    );
    expect(r.specialStreamTax).toBe(4_600_000_000);
    expect(r.ordinaryStreamTax).toBe(9_229_550_000);
    expect(r.finalTax).toBe(13_829_550_000);
  });

  /**
   * C9 (Q-2 (a)): C1 + 특례 주식 인수채무 5억 → 특례 (40억 − 5억 − 10억) × 10% = 250,000,000
   *   + 일반 218,250,000 = 468,250,000 (before 350,000,000)
   */
  it("[C9] 인수채무는 가업자산상당액에서 전액 차감 → 468,250,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          stock({
            assumedDebtForGift: 500_000_000,
            corporateTotalAssets: 10_000_000_000,
            corporateNonBusinessAssets: LAND_2B,
          }),
        ],
      }),
    );
    expect(r.specialStreamDebt).toBe(500_000_000);
    expect(r.specialStreamTax).toBe(250_000_000);
    expect(r.ordinaryStreamTax).toBe(218_250_000);
    expect(r.finalTax).toBe(468_250_000);
  });

  /**
   * C11 (연혁 게이트 = 증여일): 보유현금 30억 · 직전 5년 말 각 10억 · 비사업용토지 20억
   *   2025-03-15: 라목 200% → 과다현금 10억 · 사업무관 30억 · 상당액 35억
   *     특례 250,000,000 + 일반 (15억 − 5천만) × 40% − 1.6억 = 420,000,000 − 12,600,000 = 407,400,000 → 657,400,000
   *   2025-01-15: 150% → 과다현금 15억 · 사업무관 35억 · 상당액 32.5억
   *     특례 225,000,000 + 일반 (17.5억 − 5천만) × 40% − 1.6억 = 520,000,000 − 15,600,000 = 504,400,000 → 729,400,000
   */
  const CASH: CorporateNonBusinessAssets = {
    nonBusinessLand: 2_000_000_000,
    currentCash: 3_000_000_000,
    cashByYearEnd: [1_000_000_000, 1_000_000_000, 1_000_000_000, 1_000_000_000, 1_000_000_000],
  };
  it("[C11] 증여일 2025-03-15 → 200% 기준 657,400,000", () => {
    const r = calcGiftTax(
      makeInput({
        giftDate: "2025-03-15",
        giftItems: [stock({ corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: CASH })],
      }),
    );
    expect(r.familyBusinessAssetEquivalent).toBe(3_500_000_000);
    expect(r.finalTax).toBe(657_400_000);
  });
  it("[C11] 증여일 2025-01-15 → 150% 기준 729,400,000", () => {
    const r = calcGiftTax(
      makeInput({ giftItems: [stock({ corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: CASH })] }),
    );
    expect(r.familyBusinessAssetEquivalent).toBe(3_250_000_000);
    expect(r.finalTax).toBe(729_400_000);
  });

  /** C12: 창업자금은 총자산을 읽지 않는다 */
  it("[C12] startup → 가업자산상당액 미적용", () => {
    const r = calcGiftTax(
      makeInput({
        giftItems: [
          { id: "c", category: "cash", name: "현금", marketValue: 1_000_000_000, corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: LAND_2B } as EstateItem,
        ],
        creditInput: { isFiledOnTime: true, specialTreatment: "startup", startupInvestmentCompleted: true },
      }),
    );
    expect(r.familyBusinessAssetEquivalent).toBeUndefined();
    expect(r.specialStreamTax).toBe(50_000_000); // (10억 − 5억) × 10%
  });
});

// ────────────────────────────────────────────────────────────
// ⑧ validateStep · ⑩ Zod — 같은 술어 (본 건 + 동시증여 추가 건)
// ────────────────────────────────────────────────────────────

function fbStock(overrides: Partial<EstateItem> = {}): EstateItem {
  return {
    id: "a",
    category: "unlisted_stock",
    name: "가업주식",
    marketValue: 1_000_000_000,
    unlistedStockData: { totalShares: 10_000, ownedShares: 10_000, netAssetValue: 1_000_000_000 },
    ...overrides,
  } as EstateItem;
}

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    ...INITIAL_FORM,
    giftDate: "2025-01-15",
    giftItems: [fbStock()],
    specialTreatment: "family_business",
    ...overrides,
  };
}

function makeSub(overrides: Partial<GiftSubFormState> = {}): GiftSubFormState {
  const { simultaneousGiftForms: _omit, ...base } = INITIAL_FORM;
  return {
    ...base,
    giftDate: "2025-01-15",
    donor: "grandparent",
    giftItems: [fbStock()],
    specialTreatment: "family_business",
    ...overrides,
  };
}

const CASH_ITEM = { id: "m", category: "cash", name: "현금", marketValue: 100_000_000 } as EstateItem;

describe("U-17 ⑧·⑩ — 법인 총자산 미입력 차단", () => {
  it("[C4-⑧⑩] 본 건 총자산 미입력 → ⑧ 차단 · ⑩ 400 (같은 문구)", () => {
    const form = makeForm();
    expect(validateStep(3, form)).toBe(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE);
    const parsed = giftTaxInputSchema.safeParse(buildGiftTaxInput(form));
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.map((i) => i.message)).toContain(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE);
    }
  });

  it("[C4-ok] 총자산 입력 → ⑧ 통과 · ⑩ 통과 · ⑫ corporate 필드 보존", () => {
    const form = makeForm({
      giftItems: [fbStock({ corporateTotalAssets: 10_000_000_000, corporateNonBusinessAssets: LAND_2B })],
    });
    expect(validateStep(3, form)).toBeNull();
    const parsed = giftTaxInputSchema.safeParse(buildGiftTaxInput(form));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.giftItems[0].corporateTotalAssets).toBe(10_000_000_000);
      expect(parsed.data.giftItems[0].corporateNonBusinessAssets?.nonBusinessLand).toBe(2_000_000_000);
    }
  });

  it("[C4b] 영위기간 '5' 명시(미적격) → 총자산 없어도 ⑧·⑩ 통과", () => {
    const form = makeForm({ familyBusinessYears: "5" });
    expect(validateStep(3, form)).toBeNull();
    expect(giftTaxInputSchema.safeParse(buildGiftTaxInput(form)).success).toBe(true);
  });

  it("[C4c] 영위기간 빈값(엔진 기본 10년 = 적격) → 차단", () => {
    expect(validateStep(3, makeForm({ familyBusinessYears: "" }))).toBe(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE);
  });

  it("[C15] 특례 주식 + 합산배제 자산 → 엔진 partition(합산배제 제외 1개 자동 귀속)과 같은 집합으로 차단", () => {
    const aggExcl = { ...CASH_ITEM, isAggregationExcludedGift: true } as EstateItem;
    const form = makeForm({ giftItems: [fbStock(), aggExcl] });
    // 기존 귀속 검사(N≥2 미귀속)는 합산배제 자산도 세므로 귀속을 명시한다
    form.giftItems = [fbStock({ isSpecialTreatmentAsset: true }), { ...aggExcl, isSpecialTreatmentAsset: false }];
    expect(validateStep(3, form)).toBe(FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE);
    expect(giftTaxInputSchema.safeParse(buildGiftTaxInput(form)).success).toBe(false);
  });

  it("[C13] 동시증여 추가 건 총자산 미입력 → ⑧ 추가 건 루프 차단 · ⑩ giftSubFormSchema 400", () => {
    const sub = makeSub();
    const form = makeForm({
      specialTreatment: "",
      giftItems: [CASH_ITEM],
      simultaneousGiftForms: [sub],
    });
    expect(validateStep(3, form)).toBe(`동시증여 건 1: ${FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE}`);
    const body = {
      ...buildGiftTaxInput(form),
      simultaneousGiftForms: [buildGiftTaxInput(sub as FormState)],
    };
    const parsed = giftSimultaneousRequestSchema.safeParse(body);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const issue = parsed.error.issues.find((i) => i.message === FAMILY_BUSINESS_TOTAL_ASSETS_MISSING_MESSAGE);
      expect(issue?.path.slice(0, 2)).toEqual(["simultaneousGiftForms", 0]);
    }
  });

  it("[C13-ok] 추가 건 총자산 입력 → ⑧·⑩ 통과", () => {
    const sub = makeSub({ giftItems: [fbStock({ corporateTotalAssets: 10_000_000_000 })] });
    const form = makeForm({ specialTreatment: "", giftItems: [CASH_ITEM], simultaneousGiftForms: [sub] });
    expect(validateStep(3, form)).toBeNull();
    const body = {
      ...buildGiftTaxInput(form),
      simultaneousGiftForms: [buildGiftTaxInput(sub as FormState)],
    };
    expect(giftSimultaneousRequestSchema.safeParse(body).success).toBe(true);
  });
});
