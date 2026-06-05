/**
 * 감정평가수수료 폼 필드 ↔ 엔진 입력(AppraisalFeeInput) 변환 (상속·증여 공용 순수 헬퍼).
 * AppraisalFeeSection(client) 과 InheritanceTaxForm·gift-api(빌더)가 공유.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AppraisalFeeInput } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface AppraisalFeeFormFields {
  appraisalRealEstateFee: string;
  appraisalUnlistedFee: string;
  appraisalUnlistedTargetCount: string;
  appraisalUnlistedAgencyCount: string;
  appraisalTangibleFee: string;
}

export const INITIAL_APPRAISAL_FEE_FIELDS: AppraisalFeeFormFields = {
  appraisalRealEstateFee: "",
  appraisalUnlistedFee: "",
  appraisalUnlistedTargetCount: "",
  appraisalUnlistedAgencyCount: "",
  appraisalTangibleFee: "",
};

/** flat 폼 → AppraisalFeeInput. 3종 금액 모두 빈값이면 undefined (회귀 0). */
export function buildAppraisalFee(
  form: AppraisalFeeFormFields,
): AppraisalFeeInput | undefined {
  const re = parseAmount(form.appraisalRealEstateFee) || undefined;
  const un = parseAmount(form.appraisalUnlistedFee) || undefined;
  const tg = parseAmount(form.appraisalTangibleFee) || undefined;
  if (!re && !un && !tg) return undefined;
  return {
    realEstateAppraisalFee: re,
    unlistedStockAppraisalFee: un,
    unlistedTargetCount: parseAmount(form.appraisalUnlistedTargetCount) || undefined,
    unlistedAgencyCount: parseAmount(form.appraisalUnlistedAgencyCount) || undefined,
    tangibleAppraisalFee: tg,
  };
}
