/**
 * gift-api.ts — 증여세 폼→엔진 입력 변환 (④ 지점)
 *
 * buildGiftTaxInput: GiftTaxFormState → GiftTaxInput 순수 함수.
 * GiftTaxForm.tsx 오케스트레이터가 import해 사용.
 *
 * G-H3: buildInput 테스트 전무 → 순수 함수로 추출하여 단위 테스트 가능하게 함.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import { deriveDonorRelation } from "@/components/calc/gift-tax-form-shared";
import type {
  GiftTaxInput,
  GiftDeductionInput,
  GiftTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState } from "@/components/calc/gift-tax-form-shared";

export type { FormState as GiftTaxFormState };

/**
 * buildGiftTaxInput — GiftTaxFormState → GiftTaxInput 순수 변환 함수 (④ 지점).
 *
 * 변환 규칙:
 *   - 비상장주식 비활성 모드 잔존 데이터 strip (resolveActiveUnlistedValuation)
 *   - sourceCalculationId(UI 메타) strip — 엔진에 전달하지 않음
 *   - isGenerationSkip: donor === "grandparent" 자동 파생 (G-M2b)
 *   - donorRelation: deriveDonorRelation(donor, isMinorDonee) 자동 파생 (G-M3)
 *   - marriageExemption / birthExemption: parseAmount || undefined (직계존속 여부는 UI가 통제)
 *   - priorUsedDeduction: parseAmount || undefined
 *   - foreignTaxPaid: parseAmount || undefined
 *   - specialTreatment: "" → undefined
 *   - startupInvestmentCompleted: specialTreatment==="startup"일 때만 전달, 아니면 undefined
 *   - exemptions: 빈 배열 → undefined
 */
export function buildGiftTaxInput(form: FormState): GiftTaxInput {
  // 비상장주식 모드 strip — simple 모드인데 V2가 잔존하는 경우 엔진 전달 전 제거
  const allItems = [...form.giftItems, ...form.stockItems].map(
    resolveActiveUnlistedValuation,
  );

  const deductionInput: GiftDeductionInput = {
    donorRelation: deriveDonorRelation(form.donor, form.isMinorDonee),
    marriageExemption: parseAmount(form.marriageExemption) || undefined,
    birthExemption: parseAmount(form.birthExemption) || undefined,
    priorUsedDeduction: parseAmount(form.priorUsedDeduction) || undefined,
  };

  const creditInput: GiftTaxCreditInput = {
    foreignTaxPaid: parseAmount(form.foreignTaxPaid) || undefined,
    isFiledOnTime: form.isFiledOnTime,
    specialTreatment: form.specialTreatment || undefined,
    // G-M7: startupInvestmentCompleted — startup 선택 시에만 전달
    startupInvestmentCompleted:
      form.specialTreatment === "startup"
        ? form.startupInvestmentCompleted
        : undefined,
  };

  return {
    giftDate: form.giftDate,
    donorRelation: deriveDonorRelation(form.donor, form.isMinorDonee),
    donor: form.donor,
    giftItems: allItems,
    exemptions: form.exemptionItems.length > 0 ? form.exemptionItems : undefined,
    // sourceCalculationId(UI 메타)는 엔진 입력에서 strip (지점 ④)
    priorGiftsWithin10Years: form.priorGifts.map(
      ({ sourceCalculationId: _src, ...rest }) => rest,
    ),
    // G-M2b: isGenerationSkip → donor === "grandparent" 자동 파생
    isGenerationSkip: form.donor === "grandparent",
    isMinorDonee: form.isMinorDonee,
    deductionInput,
    creditInput,
  };
}
