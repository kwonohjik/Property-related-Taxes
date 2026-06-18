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
    case "merger":
      if (form.mrgCaseType === "non_stock") {
        if (parseAmount(form.mrgFaceValue) <= 0) return "액면가액을 입력하세요";
        if (parseAmount(form.mrgOvervaluedPrice) <= 0) return "합병당사법인 1주당 평가가액을 입력하세요";
      } else {
        if (parseAmount(form.mrgMergedPrice) <= 0) return "합병 후 1주당 평가가액을 입력하세요";
        if (parseAmount(form.mrgExchangedShares) <= 0) return "교부받은 주식수를 입력하세요";
      }
      break;
    case "capital_increase":
      if (parseAmount(form.ciPrePrice) <= 0) return "증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.ciPreShares) <= 0) return "증자 전 발행주식총수를 입력하세요";
      if (form.ciDirection === "high" && form.ciSubType !== "forfeited_realloc") {
        if (parseAmount(form.ciRatioDenomShares) <= 0) return "분모 신주수를 입력하세요";
      }
      break;
    case "capital_decrease":
      if (parseAmount(form.cdSharePrice) <= 0) return "감자주식 1주당 평가액을 입력하세요";
      if (form.cdCaseType === "high") {
        if (parseAmount(form.cdOwnRedeemedShares) <= 0) return "해당 주주등 감자 주식수를 입력하세요";
      } else {
        if (parseAmount(form.cdTotalShares) <= 0) return "총감자 주식수를 입력하세요";
      }
      break;
    case "contribution":
      if (parseAmount(form.conPrePrice) <= 0) return "현물출자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.conPreShares) <= 0) return "현물출자 전 발행주식총수를 입력하세요";
      break;
    case "convertible_stock":
      if (parseAmount(form.csConvPrePrice) <= 0) return "전환 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csConvPreShares) <= 0) return "전환 시점 증자 전 발행주식총수를 입력하세요";
      if (parseAmount(form.csIssuePrePrice) <= 0) return "발행 시점 증자 전 1주당 평가가액을 입력하세요";
      if (parseAmount(form.csIssuePreShares) <= 0) return "발행 시점 증자 전 발행주식총수를 입력하세요";
      break;
    case "convertible_bond":
      if (form.cbCaseType === "conversion" || form.cbCaseType === "conversion_reverse") {
        if (parseAmount(form.cbPreConvPrice) <= 0) return "전환등 전 1주당 평가가액을 입력하세요";
        if (parseAmount(form.cbConversionPrice) <= 0) return "1주당 전환가액등을 입력하세요";
        if (parseAmount(form.cbIncreasedShares) <= 0) return "전환등 증가주식수를 입력하세요";
      } else if (form.cbCaseType === "transfer") {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
        if (parseAmount(form.cbTransferPrice) <= 0) return "양도가액을 입력하세요";
      } else {
        if (parseAmount(form.cbMarketValue) <= 0) return "전환사채등 시가를 입력하세요";
      }
      break;
  }
  return null;
}
