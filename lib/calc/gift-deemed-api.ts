/**
 * 증여로 보는 경우 — 폼 → 엔진 입력 변환 + 증여세 마법사 prefill 어댑터 (④ 동기화).
 */
import type { DeemedGiftInput, DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { resolveFreeLoanRate } from "@/lib/tax-engine/data/gift-deemed-rates";
import {
  DEEMED_TYPE_META,
  type DeemedFormState,
} from "@/components/calc/deemed-gift/shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";

/** 폼 상태 → DeemedGiftInput (유형별 분기) */
export function buildDeemedGiftInput(form: DeemedFormState): DeemedGiftInput {
  switch (form.type) {
    case "insurance":
      return {
        type: "insurance",
        caseType: form.insCaseType,
        insuranceProceeds: parseAmount(form.insProceeds),
        totalPremiumPaid: parseAmount(form.insTotalPremium),
        relevantPremium: parseAmount(form.insRelevantPremium),
        isInheritanceInsurance: form.insIsInheritance,
      };
    case "bargain_transfer":
      return {
        type: "bargain_transfer",
        marketValue: parseAmount(form.bargMarketValue),
        transactionPrice: parseAmount(form.bargPrice),
        isRelatedParty: form.bargRelated,
        transactionType: form.bargType,
        hasJustifiableReason: form.bargJustifiable,
        isExcludedTransaction: form.bargExcluded,
      };
    case "debt_forgiveness":
      return {
        type: "debt_forgiveness",
        forgivenDebt: parseAmount(form.debtForgiven),
        compensation: parseAmount(form.debtCompensation),
        occurType: form.debtOccurType,
      };
    case "free_realestate":
      return {
        type: "free_realestate",
        subType: form.freeSubType,
        propertyValue: form.freeSubType === "free_use" ? parseAmount(form.freePropertyValue) : undefined,
        loanAmount: form.freeSubType === "collateral" ? parseAmount(form.freeLoanAmount) : undefined,
        actualInterestPaid: parseAmount(form.freeInterest),
        isRelatedParty: form.freeRelated,
        hasJustifiableReason: form.freeJustifiable,
      };
    case "free_loan":
      return {
        type: "free_loan",
        loanAmount: parseAmount(form.loanAmount),
        actualInterestPaid: parseAmount(form.loanInterest),
        appropriateRate: resolveFreeLoanRate(form.giftDate || "2024-01-01"),
        isRelatedParty: form.loanRelated,
        hasJustifiableReason: form.loanJustifiable,
      };
    case "merger":
      return {
        type: "merger",
        mergedSharePrice: parseAmount(form.mrgMergedPrice),
        overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
        preMergerShares: parseAmount(form.mrgPreShares),
        exchangedShares: parseAmount(form.mrgExchangedShares),
        majorShares: parseAmount(form.mrgMajorShares),
      };
    case "capital_increase":
      return {
        type: "capital_increase",
        preIssuePrice: parseAmount(form.ciPrePrice),
        preIssueShares: parseAmount(form.ciPreShares),
        newSharePrice: parseAmount(form.ciNewPrice),
        issuedShares: parseAmount(form.ciIssuedShares),
        forfeitedShares: parseAmount(form.ciForfeitedShares),
      };
    case "capital_decrease":
      return {
        type: "capital_decrease",
        sharePrice: parseAmount(form.cdSharePrice),
        redemptionPrice: parseAmount(form.cdRedemptionPrice),
        totalRedeemedShares: parseAmount(form.cdTotalShares),
        majorPostRatio: { numer: Math.round(parseDecimal(form.cdMajorRatioPct) * 100), denom: 10_000 },
        relatedRedeemedShares: parseAmount(form.cdRelatedShares),
      };
    case "contribution":
      return {
        type: "contribution",
        preContribPrice: parseAmount(form.conPrePrice),
        preContribShares: parseAmount(form.conPreShares),
        newSharePrice: parseAmount(form.conNewPrice),
        contributedShares: parseAmount(form.conContributedShares),
        allocatedShares: parseAmount(form.conAllocatedShares),
      };
    case "convertible_bond":
      return {
        type: "convertible_bond",
        bondMarketValue: parseAmount(form.cbMarketValue),
        acquisitionPrice: parseAmount(form.cbAcquisitionPrice),
      };
    default:
      throw new Error("증여 유형을 선택하세요");
  }
}

/**
 * 증여이익 → 증여세 마법사 prefill payload (sessionStorage "giftTaxResumeInput").
 * 산정된 증여재산가액을 category:"other" 단일 항목(이미 평가된 금액)으로 주입.
 */
export function buildGiftWizardPrefill(
  form: DeemedFormState,
  result: DeemedGiftResult,
): Partial<GiftFormState> {
  const label = form.type ? DEEMED_TYPE_META[form.type].label : "증여이익";
  return {
    giftDate: form.giftDate,
    giftItems: [
      {
        id: `deemed-${result.type}`,
        category: "other",
        name: `${label} 증여이익`,
        marketValue: result.deemedGiftValue,
      },
    ],
  };
}
