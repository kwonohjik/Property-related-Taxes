/**
 * 증여로 보는 경우 — 입력 검증 (⑧ 동기화). Zod superRefine과 동일 fallback.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";

export function validateDeemedInput(form: DeemedFormState): string | null {
  if (!form.giftDate) return "증여일을 입력하세요";
  if (!form.type) return "증여로 보는 경우 유형을 선택하세요";

  switch (form.type) {
    case "insurance":
      if (parseAmount(form.insTotalPremium) <= 0) return "납부보험료 총액을 입력하세요";
      if (parseAmount(form.insRelevantPremium) > parseAmount(form.insTotalPremium))
        return "관련 보험료가 총 납부보험료를 초과할 수 없습니다 (§34①)";
      break;
    case "bargain_transfer":
      if (parseAmount(form.bargMarketValue) <= 0) return "시가를 입력하세요";
      break;
    case "debt_forgiveness":
      if (parseAmount(form.debtForgiven) <= 0) return "면제·인수·변제 채무액을 입력하세요";
      break;
    case "free_realestate":
      if (form.freeSubType === "free_use" && parseAmount(form.freePropertyValue) <= 0)
        return "부동산 가액을 입력하세요";
      if (form.freeSubType === "collateral" && parseAmount(form.freeLoanAmount) <= 0)
        return "차입금을 입력하세요";
      break;
    case "free_loan":
      if (parseAmount(form.loanAmount) <= 0) return "대출금액을 입력하세요";
      break;
  }
  return null;
}
