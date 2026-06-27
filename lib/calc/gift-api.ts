/**
 * gift-api.ts — 증여세 폼→엔진 입력 변환 (④ 지점)
 *
 * buildGiftTaxInput: GiftTaxFormState → GiftTaxInput 순수 함수.
 * GiftTaxForm.tsx 오케스트레이터가 import해 사용.
 *
 * G-H3: buildInput 테스트 전무 → 순수 함수로 추출하여 단위 테스트 가능하게 함.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { resolveActiveUnlistedValuation } from "@/lib/calc/unlisted-valuation-mode";
import { injectSuperficiesRemainingYears, injectIntangibleRemainingYears, injectSavingsAccrualIfAuto, injectReceivableValuationDate, injectCbValuationDate, injectTrustBenefitRemainingYears, injectPeriodicRemainingYears, injectCryptoUnitPriceIfTimeseries } from "@/lib/calc/estate-item-valuation";
import { buildAppraisalFee } from "@/lib/calc/appraisal-fee-form";
import { deriveDonorRelation } from "@/components/calc/gift-tax-form-shared";
import { resolveIsMinorDonee } from "@/lib/calc/gift-donee-minor";
import type {
  GiftTaxInput,
  GiftDeductionInput,
  GiftTaxCreditInput,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { FormState, GiftSubFormState } from "@/components/calc/gift-tax-form-shared";

// GiftSubForm re-export — gift-api.ts 공개 계약 (⑬ 지점에서 참조)
export type { GiftSubFormState as GiftSubForm };

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
 *   - familyBusinessYears: specialTreatment==="family_business" + 입력 시에만 전달 (빈값 → undefined → 엔진 기본 10년)
 *   - exemptions: 빈 배열 → undefined
 */
export function buildGiftTaxInput(form: FormState): GiftTaxInput {
  // 비상장주식 모드 strip — simple 모드인데 V2가 잔존하는 경우 엔진 전달 전 제거
  // 지상권 잔존연수 합성 — 평가기준일(증여일) 기준 (§61③, override 우선)
  // §63④ 예금 자동 계산 주입 — auto 모드 시 미수이자·원천징수세액 pre-inject
  const giftDateObj = form.giftDate ? new Date(form.giftDate) : undefined;
  const allItems = [...form.giftItems, ...form.stockItems]
    .map(resolveActiveUnlistedValuation)
    .map((i) => injectSuperficiesRemainingYears(i, form.giftDate || undefined))
    .map((i) => injectIntangibleRemainingYears(i, form.giftDate || undefined))
    .map((i) => (giftDateObj ? injectSavingsAccrualIfAuto(i, giftDateObj) : i))
    .map((i) => injectReceivableValuationDate(i, form.giftDate || undefined))
    .map((i) => injectCbValuationDate(i, form.giftDate || undefined))
    .map((i) => injectTrustBenefitRemainingYears(i, form.giftDate || undefined))
    .map((i) => injectPeriodicRemainingYears(i, form.giftDate || undefined))
    .map(injectCryptoUnitPriceIfTimeseries);

  const deductionInput: GiftDeductionInput = {
    donorRelation: deriveDonorRelation(form.donor, resolveIsMinorDonee(form)),
    marriageExemption: parseAmount(form.marriageExemption) || undefined,
    birthExemption: parseAmount(form.birthExemption) || undefined,
    priorUsedDeduction: parseAmount(form.priorUsedDeduction) || undefined,
    // §53의2③ 기공제 누적 — 3중 패턴: 빈값/0이면 undefined → 엔진 기본(기공제 0) 유지
    priorUsedMarriageBirthDeduction: parseAmount(form.priorUsedMarriageBirthDeduction) || undefined,
    // 상증령 §46①2호 동시증여 안분 — 3-state 보존(OFF=undefined). string→number 변환.
    // taxableValue ≤ 0 항목 제거(엔진 필터·Zod positive 정합 — 빈/0행은 "없음" 동일 취급).
    simultaneousGifts: form.simultaneousGifts
      ?.map((g) => ({ donorRelation: g.donorRelation, taxableValue: parseAmount(g.taxableValue) }))
      .filter((g) => g.taxableValue > 0),
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
    // G-M8: startupNewHiresAtLeast10 — startup 선택 시에만 전달 (3중 패턴: specialTreatment!=="startup"이면 undefined strip)
    startupNewHiresAtLeast10:
      form.specialTreatment === "startup"
        ? form.startupNewHiresAtLeast10
        : undefined,
    // §30의6① 가업 영위기간 — family_business 선택 + 입력 시에만 전달.
    // 빈값 → undefined → 엔진 기본 10년(300억 한도). 10 미만 명시 입력(0 포함)은 그대로 전달 → 엔진이 특례 불가 판정(일반 스트림 폴백)
    familyBusinessYears:
      form.specialTreatment === "family_business" &&
      form.familyBusinessYears !== ""
        ? parseDecimal(form.familyBusinessYears)
        : undefined,
  };

  return {
    giftDate: form.giftDate,
    donorRelation: deriveDonorRelation(form.donor, resolveIsMinorDonee(form)),
    donor: form.donor,
    giftItems: allItems,
    exemptions: form.exemptionItems.length > 0 ? form.exemptionItems : undefined,
    // sourceCalculationId(UI 메타)는 엔진 입력에서 strip (지점 ④).
    // specialTreatmentType·priorSpecialTaxPaid는 엔진 필요 필드 — strip 금지.
    priorGiftsWithin10Years: form.priorGifts.map(
      ({ sourceCalculationId: _src, ...rest }) => rest,
    ),
    // G-M2b: isGenerationSkip → donor === "grandparent" 자동 파생
    isGenerationSkip: form.donor === "grandparent",
    isMinorDonee: resolveIsMinorDonee(form),
    // §57① 단서 — donor=grandparent 일 때만 전송, 그 외 undefined strip (3중 패턴)
    isSubstituteGift: form.donor === "grandparent" ? (form.isSubstituteGift || undefined) : undefined,
    deductionInput,
    creditInput,
    // 감정평가수수료 공제 (§55①·시행령 §46의2 → §20의3 준용)
    appraisalFee: buildAppraisalFee(form),
    // 분납 (§70②) — 별지10호 ㊼. 엔진이 finalTax로 calcInstallmentSplit 후 cashDeferred echo
    applyInstallmentSplit: form.splitPaymentEnabled,
    requestedSplitAmount: form.splitPaymentAmount
      ? parseAmount(form.splitPaymentAmount)
      : undefined,
    // §36 대납(代納) gross-up — 명시 키 (spread 금지: 침묵 strip 방지)
    donorPaysGiftTax: form.donorPaysGiftTax,
    donorHasJointLiability: form.donorHasJointLiability,
    // §36 부분 대납 — 빈값/0 → undefined → 엔진 ?? 0 (전액 대납 기존 동작)
    doneePaidGiftTax: parseAmount(form.doneePaidGiftTax ?? "") || undefined,
  };
}

/**
 * buildSimultaneousGiftInputs — 건 0 + simultaneousGiftForms(추가 건 배열) → GiftTaxInput[] 변환 (④ 지점)
 *
 * UI 설계 §2(④): 동시증여 다중 건 세액 계산에서 호출.
 * buildGiftTaxInput을 건 0 + 각 추가 건에 모두 적용.
 * 동시증여 없음(undefined/[]) → [건0] 단건 반환.
 *
 * ⑬ 지점: Route body에 포함될 inputs 배열 직렬화는 호출부(GiftTaxForm.tsx)에서 처리.
 */
export function buildSimultaneousGiftInputs(form: FormState): GiftTaxInput[] {
  const base = buildGiftTaxInput(form);
  if (!form.simultaneousGiftForms || form.simultaneousGiftForms.length === 0) {
    return [base];
  }
  const additional = form.simultaneousGiftForms.map((sub) =>
    // simultaneousGiftForms는 Omit<FormState, "simultaneousGiftForms">
    // buildGiftTaxInput은 simultaneousGiftForms 필드를 사용하지 않으므로 spread로 확장
    buildGiftTaxInput({ ...sub, simultaneousGiftForms: undefined } as FormState),
  );
  return [base, ...additional];
}
