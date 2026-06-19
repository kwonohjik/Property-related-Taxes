/**
 * 증여세 사전증여 입력 필드 정리 — validateStep Step2 검증 (D1·D2)
 * Plan: docs/00-pm/gift-prior-gift-field-cleanup.plan.md
 *
 *   VS-1 (D1) prefill된 ⑤·⑦가 store에 있으면 Step2 통과 (UI↔validate 모순 방지)
 *   VS-2 (대조) 동일그룹인데 ⑤ 미입력 → 차단 유지
 *   VS-3 (D2) 특례 회차(specialTreatmentType)는 §47 합산 제외 → ⑤·⑦ 없이 통과
 *   VS-4 (대조) 다른 동일인 그룹은 ⑤·⑦ 검증 제외 (별개 신고)
 */

import { describe, it, expect } from "vitest";
import { validateStep } from "@/components/calc/gift-tax-form-shared";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";
import { INITIAL_APPRAISAL_FEE_FIELDS } from "@/lib/calc/appraisal-fee-form";

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    isGenerationSkip: false,
    isMinorDonee: false,
    isSubstituteGift: false,
    giftItems: [],
    stockItems: [],
    exemptionItems: [],
    priorGifts: [],
    marriageExemption: "",
    birthExemption: "",
    priorUsedDeduction: "",
    priorUsedMarriageBirthDeduction: "",
    isFiledOnTime: true,
    foreignTaxPaid: "",
    specialTreatment: "",
    startupInvestmentCompleted: false,
    startupNewHiresAtLeast10: false,
    familyBusinessYears: "",
    splitPaymentEnabled: false,
    splitPaymentAmount: "",
    ...INITIAL_APPRAISAL_FEE_FIELDS,
    ...overrides,
  };
}

function prior(overrides: Partial<PriorGift> = {}): PriorGift {
  return {
    giftDate: "2020-03-01",
    isHeir: false,
    giftAmount: 150_000_000,
    giftTaxPaid: 0,
    donor: "father",
    ...overrides,
  };
}

describe("증여세 사전증여 필드 정리 — validateStep (D1·D2)", () => {
  it("VS-1 (D1): prefill된 ⑤·⑦가 store에 있으면 Step2 통과", () => {
    const form = makeForm({
      donor: "father",
      priorGifts: [
        prior({ giftTaxBase: 100_000_000, computedTax: 10_000_000 }),
      ],
    });
    expect(validateStep(2, form)).toBeNull();
  });

  it("VS-2 (대조): 동일그룹인데 ⑤ 미입력이면 차단 유지", () => {
    const form = makeForm({
      donor: "father",
      priorGifts: [prior({ giftTaxBase: undefined, computedTax: 10_000_000 })],
    });
    expect(validateStep(2, form)).toMatch(/합산과세표준 ⑤/);
  });

  it("VS-3 (D2): 특례 회차는 ⑤·⑦ 없이도 Step2 통과 (§47 합산 제외)", () => {
    const form = makeForm({
      donor: "father",
      priorGifts: [
        prior({
          specialTreatmentType: "startup",
          giftTaxBase: undefined,
          computedTax: undefined,
        }),
      ],
    });
    expect(validateStep(2, form)).toBeNull();
  });

  it("VS-4 (대조): 다른 동일인 그룹은 ⑤·⑦ 검증 제외", () => {
    const form = makeForm({
      donor: "father",
      priorGifts: [
        prior({
          donor: "sibling",
          giftTaxBase: undefined,
          computedTax: undefined,
        }),
      ],
    });
    expect(validateStep(2, form)).toBeNull();
  });
});
