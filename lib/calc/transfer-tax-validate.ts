/**
 * 양도소득세 계산기 단계별 유효성 검사
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

export function validateStep(step: number, form: TransferFormData): string | null {
  if (step === 0) {
    if (!form.propertyType) return "양도하는 부동산 유형을 선택하세요.";
  }
  if (step === 1) {
    if (!form.propertyAddressRoad && !form.propertyAddressJibun)
      return "양도자산 소재지를 검색·선택하세요.";
    if (!form.transferPrice || parseAmount(form.transferPrice) <= 0) return "양도가액을 입력하세요.";
    if (!form.transferDate) return "양도일을 선택하세요.";
  }
  if (step === 2) {
    if (!form.acquisitionDate) return "취득일을 선택하세요.";
    if (form.acquisitionDate >= form.transferDate) return "취득일은 양도일보다 이전이어야 합니다.";
    if (form.useEstimatedAcquisition) {
      if (!form.standardPriceAtAcquisition || parseAmount(form.standardPriceAtAcquisition) <= 0)
        return "취득 당시 기준시가를 입력하세요.";
      if (!form.standardPriceAtTransfer || parseAmount(form.standardPriceAtTransfer) <= 0)
        return "양도 당시 기준시가를 입력하세요.";
    } else {
      if (!form.acquisitionPrice || parseAmount(form.acquisitionPrice) < 0)
        return "취득가액을 입력하세요.";
    }
  }
  if (step === 3) {
    if (!form.householdHousingCount) return "세대 보유 주택 수를 선택하세요.";
  }
  return null;
}
