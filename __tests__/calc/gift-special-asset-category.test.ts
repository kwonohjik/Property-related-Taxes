/**
 * 조특법 특례 귀속 자산 재산 종류 제약 — validateStep ⑧ ↔ Zod ⑩ 동기화 (R3 잔여 해소)
 *
 * 법령 근거 (KoreanLaw 현행 본문 대조):
 *   §30의5① 전단 + 조특령 §27의5① — 창업자금은 "소득세법 §94①에 따른 재산
 *     (토지·건물·부동산에 관한 권리·주식 등)을 제외한 재산"만 가능.
 *   §30의6① — 가업승계는 "해당 가업의 주식 또는 출자지분"만 가능.
 *
 * R3 잔여 항목의 해소: 특례 자산의 assumedDebtForGift(§47①) 미차감은 버그가 아니라
 * "특례 자산 = 부동산" 조합 자체가 법령상 불가 — 채무 입력 UI가 부동산 전용이므로
 * 본 카테고리 차단으로 해당 조합이 구조적으로 차단됨.
 *
 * 단일 진실: isSpecialTreatmentEligibleCategory (lib/tax-engine/gift-special-stream.ts)
 * — UI ⑤(Selector disabled)·validateStep ⑧·Zod superRefine ⑩ 3곳 공용.
 */
import { describe, it, expect } from "vitest";
import {
  validateStep,
  INITIAL_FORM,
} from "@/components/calc/gift-tax-form-shared";
import { giftTaxInputSchema } from "@/lib/validators/property-valuation-input";
import {
  isSpecialTreatmentEligibleCategory,
} from "@/lib/tax-engine/gift-special-stream";
import type {
  AssetCategory,
  EstateItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";

const STEP3 = 3;

function item(
  id: string,
  category: AssetCategory,
  tag?: boolean,
): EstateItem {
  return {
    id,
    category,
    name: `자산${id}`,
    marketValue: 1_000_000_000,
    ...(tag === undefined ? {} : { isSpecialTreatmentAsset: tag }),
  } as EstateItem;
}

function form(
  giftItems: EstateItem[],
  specialTreatment: "" | "startup" | "family_business",
) {
  return { ...INITIAL_FORM, giftDate: "2025-01-15", giftItems, specialTreatment };
}

function zodInput(
  giftItems: EstateItem[],
  specialTreatment: "startup" | "family_business",
) {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    giftItems,
    priorGiftsWithin10Years: [],
    isGenerationSkip: false,
    isMinorDonee: false,
    deductionInput: { donorRelation: "lineal_ascendant_adult" },
    creditInput: {
      isFiledOnTime: true,
      specialTreatment,
      ...(specialTreatment === "startup"
        ? { startupInvestmentCompleted: true }
        : {}),
    },
  };
}

describe("isSpecialTreatmentEligibleCategory — 카테고리 매트릭스", () => {
  it("startup: 소법 §94① 재산(부동산 3종·주식 2종) 불가, cash·financial·other 허용", () => {
    expect(isSpecialTreatmentEligibleCategory("real_estate_land", "startup")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("real_estate_building", "startup")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("real_estate_apartment", "startup")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("listed_stock", "startup")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("unlisted_stock", "startup")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("cash", "startup")).toBe(true);
    expect(isSpecialTreatmentEligibleCategory("financial", "startup")).toBe(true);
    expect(isSpecialTreatmentEligibleCategory("other", "startup")).toBe(true);
  });

  it("family_business: 주식 2종만 허용", () => {
    expect(isSpecialTreatmentEligibleCategory("listed_stock", "family_business")).toBe(true);
    expect(isSpecialTreatmentEligibleCategory("unlisted_stock", "family_business")).toBe(true);
    expect(isSpecialTreatmentEligibleCategory("cash", "family_business")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("financial", "family_business")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("real_estate_apartment", "family_business")).toBe(false);
    expect(isSpecialTreatmentEligibleCategory("other", "family_business")).toBe(false);
  });
});

describe("validateStep ⑧ — 특례 귀속 카테고리 차단", () => {
  it("토지 1개 + startup (단일 자동 귀속) → 차단", () => {
    const msg = validateStep(STEP3, form([item("a", "real_estate_land")], "startup"));
    expect(msg).not.toBeNull();
    expect(msg).toContain("특례 귀속 불가");
    expect(msg).toContain("§94①");
  });

  it("현금 1개 + startup → 통과", () => {
    expect(validateStep(STEP3, form([item("a", "cash")], "startup"))).toBeNull();
  });

  it("토지 1개 + family_business → 차단 (주식만)", () => {
    const msg = validateStep(STEP3, form([item("a", "real_estate_land")], "family_business"));
    expect(msg).not.toBeNull();
    expect(msg).toContain("주식");
  });

  it("N=2: 현금(특례 true) + 아파트(명시 일반 false) + startup → 통과 — 일반 귀속 자산은 무관", () => {
    expect(
      validateStep(
        STEP3,
        form([item("a", "cash", true), item("b", "real_estate_apartment", false)], "startup"),
      ),
    ).toBeNull();
  });

  it("N=2: 아파트를 특례 true 태깅 + startup → 차단", () => {
    const msg = validateStep(
      STEP3,
      form([item("a", "cash", false), item("b", "real_estate_apartment", true)], "startup"),
    );
    expect(msg).not.toBeNull();
    expect(msg).toContain("특례 귀속 불가");
  });

  it("특례 미선택이면 카테고리 검증 없음", () => {
    expect(validateStep(STEP3, form([item("a", "real_estate_land")], ""))).toBeNull();
  });
});

describe("Zod superRefine ⑩ — 특례 귀속 카테고리 차단 (validateStep 동기화)", () => {
  it("토지 1개 + startup (단일 자동 귀속) → 400", () => {
    const parsed = giftTaxInputSchema.safeParse(
      zodInput([item("a", "real_estate_land")], "startup"),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((i) => i.message.includes("특례 귀속 불가")),
      ).toBe(true);
    }
  });

  it("현금 1개 + startup → 통과 (기존 경로 회귀)", () => {
    const parsed = giftTaxInputSchema.safeParse(
      zodInput([item("a", "cash")], "startup"),
    );
    expect(parsed.success).toBe(true);
  });

  it("N=2: 아파트 특례 true + startup → 400", () => {
    const parsed = giftTaxInputSchema.safeParse(
      zodInput(
        [item("a", "cash", true), item("b", "real_estate_apartment", true)],
        "startup",
      ),
    );
    expect(parsed.success).toBe(false);
  });

  it("financial 1개 + family_business → 400 (주식만)", () => {
    const parsed = giftTaxInputSchema.safeParse(
      zodInput([item("a", "financial")], "family_business"),
    );
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((i) => i.message.includes("주식")),
      ).toBe(true);
    }
  });
});
