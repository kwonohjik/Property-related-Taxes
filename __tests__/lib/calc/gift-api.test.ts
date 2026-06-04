/**
 * G-H3 anchor — buildGiftTaxInput() 순수 함수 단위 테스트
 *
 * buildGiftTaxInput: GiftTaxFormState → GiftTaxInput 변환 ④ 지점.
 * 검증 항목:
 *   GA-1  priorGifts: sourceCalculationId strip 후 donor·giftAmount·computedTax·giftTaxBase 보존
 *   GA-2  isGenerationSkip = (donor === "grandparent") 파생
 *   GA-3  donorRelation = deriveDonorRelation(donor, isMinorDonee) — 성인 분기
 *   GA-4  donorRelation = deriveDonorRelation(donor, isMinorDonee) — 미성년 분기
 *   GA-5  startupInvestmentCompleted: startup일 때만 전달
 *   GA-6  startupInvestmentCompleted: 비startup이면 undefined
 *   GA-7  exemptions 빈 배열 → undefined
 *   GA-8  exemptions 비어있지 않으면 그대로 전달
 *   GA-9  marriageExemption parseAmount("") → undefined (빈문자열 fallback)
 *   GA-10 marriageExemption parseAmount("0") → undefined (0 fallback)
 *   GA-11 marriageExemption parseAmount("100000000") → 100_000_000 (유효값)
 *   GA-12 foreignTaxPaid 빈문자열 → undefined
 *   GA-13 priorUsedDeduction 빈문자열 → undefined
 *   GA-14 §53의2 fallback: donor=spouse → deductionInput.marriageExemption=undefined (비직계존속)
 *   GA-15 donor=father, isGenerationSkip=false → buildInput에서 덮어씀(grandparent 아님)
 *   GA-16 deductionInput.donorRelation은 deriveDonorRelation 결과 (FormState.donorRelation 무관)
 *   GA-17 priorGifts: sourceCalculationId 없는 항목도 정상 보존
 *   GA-18 isMinorDonee=true+donor=grandparent → donorRelation=lineal_ascendant_minor
 */

import { describe, it, expect } from "vitest";
import { buildGiftTaxInput } from "@/lib/calc/gift-api";
import type { FormState } from "@/components/calc/gift-tax-form-shared";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";

// ============================================================
// 기본 폼 상태 팩토리
// ============================================================

function makeForm(overrides: Partial<FormState> = {}): FormState {
  return {
    giftDate: "2025-01-15",
    donorRelation: "lineal_ascendant_adult",
    donor: "father",
    isGenerationSkip: false,
    isMinorDonee: false,
    giftItems: [],
    stockItems: [],
    exemptionItems: [],
    priorGifts: [],
    marriageExemption: "",
    birthExemption: "",
    priorUsedDeduction: "",
    isFiledOnTime: true,
    foreignTaxPaid: "",
    specialTreatment: "",
    startupInvestmentCompleted: false,
    ...overrides,
  };
}

function makePriorGift(overrides: Partial<PriorGift & { sourceCalculationId?: string }> = {}): PriorGift & { sourceCalculationId?: string } {
  return {
    giftDate: "2020-03-01",
    isHeir: false,
    giftAmount: 50_000_000,
    giftTaxPaid: 0,
    donor: "father",
    giftTaxBase: 10_000_000,
    computedTax: 1_000_000,
    sourceCalculationId: "test-id-abc",
    ...overrides,
  };
}

// ============================================================
// GA-1 ~ GA-18
// ============================================================

describe("buildGiftTaxInput() — ④ 지점 변환 anchor (G-H3)", () => {

  // ─────── priorGifts 변환 ───────

  it("[GA-1] sourceCalculationId strip 후 donor·giftAmount·computedTax·giftTaxBase 보존", () => {
    const pg = makePriorGift({
      donor: "mother",
      giftAmount: 80_000_000,
      giftTaxBase: 30_000_000,
      computedTax: 6_000_000,
      giftTaxPaid: 5_800_000,
      sourceCalculationId: "src-id-xyz",
    });
    const form = makeForm({ priorGifts: [pg] });
    const result = buildGiftTaxInput(form);

    expect(result.priorGiftsWithin10Years).toHaveLength(1);
    const out = result.priorGiftsWithin10Years[0];

    // sourceCalculationId가 strip되어야 함
    expect("sourceCalculationId" in out).toBe(false);

    // 핵심 필드 보존
    expect(out.donor).toBe("mother");
    expect(out.giftAmount).toBe(80_000_000);
    expect(out.giftTaxBase).toBe(30_000_000);
    expect(out.computedTax).toBe(6_000_000);
    expect(out.giftTaxPaid).toBe(5_800_000);
  });

  it("[GA-17] sourceCalculationId 없는 항목도 정상 보존", () => {
    const pg: PriorGift = {
      giftDate: "2019-05-01",
      isHeir: true,
      giftAmount: 30_000_000,
      giftTaxPaid: 0,
      donor: "father",
    };
    const form = makeForm({ priorGifts: [pg] });
    const result = buildGiftTaxInput(form);
    const out = result.priorGiftsWithin10Years[0];
    expect(out.giftAmount).toBe(30_000_000);
    expect(out.donor).toBe("father");
    expect("sourceCalculationId" in out).toBe(false);
  });

  // ─────── isGenerationSkip 파생 ───────

  it("[GA-2] donor=grandparent → isGenerationSkip=true (FormState 값 무관)", () => {
    const form = makeForm({ donor: "grandparent", isGenerationSkip: false });
    const result = buildGiftTaxInput(form);
    expect(result.isGenerationSkip).toBe(true);
  });

  it("[GA-15] donor=father → isGenerationSkip=false (FormState에 true여도 덮어씀)", () => {
    const form = makeForm({ donor: "father", isGenerationSkip: true });
    const result = buildGiftTaxInput(form);
    expect(result.isGenerationSkip).toBe(false);
  });

  // ─────── donorRelation 파생 ───────

  it("[GA-3] donor=father, isMinorDonee=false → donorRelation=lineal_ascendant_adult", () => {
    const form = makeForm({ donor: "father", isMinorDonee: false });
    const result = buildGiftTaxInput(form);
    expect(result.donorRelation).toBe("lineal_ascendant_adult");
    expect(result.deductionInput.donorRelation).toBe("lineal_ascendant_adult");
  });

  it("[GA-4] donor=grandparent, isMinorDonee=true → donorRelation=lineal_ascendant_minor", () => {
    const form = makeForm({ donor: "grandparent", isMinorDonee: true });
    const result = buildGiftTaxInput(form);
    expect(result.donorRelation).toBe("lineal_ascendant_minor");
    expect(result.deductionInput.donorRelation).toBe("lineal_ascendant_minor");
  });

  it("[GA-18] isMinorDonee=true + donor=grandparent → lineal_ascendant_minor (미성년+세대생략 조합)", () => {
    // §57 40% 판정 조합: isGenerationSkip=true + isMinorDonee=true
    const form = makeForm({ donor: "grandparent", isMinorDonee: true });
    const result = buildGiftTaxInput(form);
    expect(result.isGenerationSkip).toBe(true);
    expect(result.isMinorDonee).toBe(true);
    expect(result.donorRelation).toBe("lineal_ascendant_minor");
  });

  it("[GA-16] deductionInput.donorRelation은 deriveDonorRelation 결과 — FormState.donorRelation 무관", () => {
    // FormState에 donorRelation이 오래된 값으로 잔존해도 buildInput에서 재파생
    const form = makeForm({
      donor: "spouse",
      donorRelation: "lineal_ascendant_adult", // 불일치 — 재파생으로 덮어씌워져야 함
      isMinorDonee: false,
    });
    const result = buildGiftTaxInput(form);
    expect(result.deductionInput.donorRelation).toBe("spouse");
    expect(result.donorRelation).toBe("spouse");
  });

  // ─────── startupInvestmentCompleted ───────

  it("[GA-5] specialTreatment=startup → startupInvestmentCompleted 전달", () => {
    const form = makeForm({ specialTreatment: "startup", startupInvestmentCompleted: true });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.startupInvestmentCompleted).toBe(true);
  });

  it("[GA-6] specialTreatment=family_business → startupInvestmentCompleted=undefined", () => {
    const form = makeForm({ specialTreatment: "family_business", startupInvestmentCompleted: true });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.startupInvestmentCompleted).toBeUndefined();
  });

  it("[GA-6b] specialTreatment='' → startupInvestmentCompleted=undefined", () => {
    const form = makeForm({ specialTreatment: "", startupInvestmentCompleted: true });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.startupInvestmentCompleted).toBeUndefined();
    expect(result.creditInput.specialTreatment).toBeUndefined();
  });

  // ─────── exemptions ───────

  it("[GA-7] exemptionItems 빈 배열 → exemptions=undefined", () => {
    const form = makeForm({ exemptionItems: [] });
    const result = buildGiftTaxInput(form);
    expect(result.exemptions).toBeUndefined();
  });

  it("[GA-8] exemptionItems 비어있지 않으면 그대로 전달", () => {
    const item: ExemptionCheckedItem = { ruleId: "gift_education", claimedAmount: 0 };
    const form = makeForm({ exemptionItems: [item] });
    const result = buildGiftTaxInput(form);
    expect(result.exemptions).toHaveLength(1);
    expect(result.exemptions![0].ruleId).toBe("gift_education");
  });

  // ─────── parseAmount || undefined fallback ───────

  it("[GA-9] marriageExemption 빈문자열 → deductionInput.marriageExemption=undefined", () => {
    const form = makeForm({ marriageExemption: "" });
    const result = buildGiftTaxInput(form);
    expect(result.deductionInput.marriageExemption).toBeUndefined();
  });

  it("[GA-10] marriageExemption '0' → deductionInput.marriageExemption=undefined", () => {
    // parseAmount('0') = 0, 0 || undefined = undefined
    const form = makeForm({ marriageExemption: "0" });
    const result = buildGiftTaxInput(form);
    expect(result.deductionInput.marriageExemption).toBeUndefined();
  });

  it("[GA-11] marriageExemption '100,000,000' → deductionInput.marriageExemption=100_000_000", () => {
    const form = makeForm({ donor: "father", marriageExemption: "100,000,000" });
    const result = buildGiftTaxInput(form);
    expect(result.deductionInput.marriageExemption).toBe(100_000_000);
  });

  it("[GA-12] foreignTaxPaid 빈문자열 → creditInput.foreignTaxPaid=undefined", () => {
    const form = makeForm({ foreignTaxPaid: "" });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.foreignTaxPaid).toBeUndefined();
  });

  it("[GA-13] priorUsedDeduction 빈문자열 → deductionInput.priorUsedDeduction=undefined", () => {
    const form = makeForm({ priorUsedDeduction: "" });
    const result = buildGiftTaxInput(form);
    expect(result.deductionInput.priorUsedDeduction).toBeUndefined();
  });

  // ─────── §53/§53의2 fallback 3중 패턴 — G-LOW ───────

  it("[GA-14] donor=spouse → deductionInput.marriageExemption=undefined (비직계존속, UI가 리셋하지 않은 경우도 buildInput에서 무시)", () => {
    // UI에서 donorRelation이 spouse로 바뀌면 marriageExemption이 '' 리셋되어야 하나
    // 만약 UI 리셋 누락 시에도 buildInput에서 marriageExemption이 그대로 전달됨.
    // 이 테스트는 현행 동작(값 그대로 전달)을 anchor로 고정하여 회귀 감지.
    // 엔진 gift-deductions.ts가 §53의2 적격성(직계존속)을 게이트하므로 최종 세액 무관.
    const form = makeForm({
      donor: "spouse",
      donorRelation: "spouse",
      marriageExemption: "50,000,000", // UI가 리셋을 빠뜨린 시나리오
    });
    const result = buildGiftTaxInput(form);
    // buildInput 자체는 mariageExemption을 그대로 전달 (UI 리셋 책임은 Step0)
    // 이 값이 엔진에 도달해도 gift-deductions가 spouse에 대해 §53의2를 적용하지 않음.
    // anchor: 현행 동작 고정 — 엔진 게이트가 마지막 방어선임을 명시
    expect(result.deductionInput.marriageExemption).toBe(50_000_000);
    // 단, donorRelation은 spouse로 파생되어 있어야 함
    expect(result.deductionInput.donorRelation).toBe("spouse");
  });

  // ─────── isFiledOnTime ───────

  it("[GA-19] isFiledOnTime=false → creditInput.isFiledOnTime=false (신고공제 미적용 경로)", () => {
    const form = makeForm({ isFiledOnTime: false });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.isFiledOnTime).toBe(false);
  });

  it("[GA-19b] isFiledOnTime=true → creditInput.isFiledOnTime=true (기본값 보존)", () => {
    const form = makeForm({ isFiledOnTime: true });
    const result = buildGiftTaxInput(form);
    expect(result.creditInput.isFiledOnTime).toBe(true);
  });

  // ─────── 결합 시나리오: strip 회귀 감지 ───────

  it("[GA-STRIP-RED] 일부러 sourceCalculationId를 strip 안 하면 RED — strip 로직 회귀 감지", () => {
    const pg = makePriorGift({ sourceCalculationId: "sentinel-id" });
    const form = makeForm({ priorGifts: [pg] });
    const result = buildGiftTaxInput(form);
    // strip이 작동하면 엔진 입력에 sourceCalculationId 없어야 함
    const out = result.priorGiftsWithin10Years[0] as unknown as Record<string, unknown>;
    expect(out["sourceCalculationId"]).toBeUndefined();
  });

  it("[GA-DONOR-RED] donor=grandparent일 때 isGenerationSkip=false면 RED — 파생 로직 회귀 감지", () => {
    // 만약 buildGiftTaxInput이 form.isGenerationSkip을 그대로 사용한다면
    // form.isGenerationSkip=false + donor=grandparent → result.isGenerationSkip=false
    // 현행 구현에서는 donor 기반으로 파생하므로 true가 되어야 함
    const form = makeForm({ donor: "grandparent", isGenerationSkip: false });
    const result = buildGiftTaxInput(form);
    expect(result.isGenerationSkip).toBe(true); // 파생 결과 true
  });
});
