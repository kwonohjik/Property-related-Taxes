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
      return form.mrgCaseType === "non_stock"
        ? {
            type: "merger",
            caseType: "non_stock",
            overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
            majorShares: parseAmount(form.mrgMajorShares),
            faceValue: parseAmount(form.mrgFaceValue),
            mergeConsideration: parseAmount(form.mrgConsideration),
          }
        : {
            type: "merger",
            caseType: "stock",
            mergedSharePrice: parseAmount(form.mrgMergedPrice),
            overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
            preMergerShares: parseAmount(form.mrgPreShares),
            exchangedShares: parseAmount(form.mrgExchangedShares),
            majorShares: parseAmount(form.mrgMajorShares),
          };
    case "capital_increase": {
      const isHigh = form.ciDirection === "high";
      const needsRatio = isHigh && form.ciSubType !== "forfeited_realloc";
      return {
        type: "capital_increase",
        direction: form.ciDirection,
        subType: form.ciSubType,
        preIssuePrice: parseAmount(form.ciPrePrice),
        preIssueShares: parseAmount(form.ciPreShares),
        newSharePrice: parseAmount(form.ciNewPrice),
        issuedShares: parseAmount(form.ciIssuedShares),
        forfeitedShares: parseAmount(form.ciForfeitedShares),
        relatedAcquiredShares: needsRatio ? parseAmount(form.ciRelatedAcquiredShares) : undefined,
        ratioDenomShares: needsRatio ? parseAmount(form.ciRatioDenomShares) : undefined,
        smallShareholderImputation: !isHigh ? form.ciSmallImputation : undefined,
      };
    }
    case "capital_decrease":
      return form.cdCaseType === "high"
        ? {
            type: "capital_decrease",
            caseType: "high",
            sharePrice: parseAmount(form.cdSharePrice),
            redemptionPrice: parseAmount(form.cdRedemptionPrice),
            ownRedeemedShares: parseAmount(form.cdOwnRedeemedShares),
          }
        : {
            type: "capital_decrease",
            caseType: "low",
            sharePrice: parseAmount(form.cdSharePrice),
            redemptionPrice: parseAmount(form.cdRedemptionPrice),
            totalRedeemedShares: parseAmount(form.cdTotalShares),
            majorPostRatio: { numer: Math.round(parseDecimal(form.cdMajorRatioPct) * 100), denom: 10_000 },
            relatedRedeemedShares: parseAmount(form.cdRelatedShares),
          };
    case "contribution": {
      const isHigh = form.conCaseType === "high";
      return {
        type: "contribution",
        caseType: form.conCaseType,
        preContribPrice: parseAmount(form.conPrePrice),
        preContribShares: parseAmount(form.conPreShares),
        newSharePrice: parseAmount(form.conNewPrice),
        contributedShares: parseAmount(form.conContributedShares),
        allocatedShares: parseAmount(form.conAllocatedShares),
        relatedRatio: isHigh ? { numer: Math.round(parseDecimal(form.conRelatedRatioPct) * 100), denom: 10_000 } : undefined,
        smallShareholderImputation: !isHigh ? form.conSmallImputation : undefined,
      };
    }
    case "convertible_bond": {
      const ct = form.cbCaseType;
      if (ct === "transfer")
        return { type: "convertible_bond", caseType: "transfer", bondMarketValue: parseAmount(form.cbMarketValue), transferPrice: parseAmount(form.cbTransferPrice) };
      if (ct === "conversion")
        return {
          type: "convertible_bond",
          caseType: "conversion",
          bondMarketValue: parseAmount(form.cbMarketValue),
          preConvPrice: parseAmount(form.cbPreConvPrice),
          preConvShares: parseAmount(form.cbPreConvShares),
          conversionPrice: parseAmount(form.cbConversionPrice),
          increasedShares: parseAmount(form.cbIncreasedShares),
          interestLoss: parseAmount(form.cbInterestLoss),
          acquisitionGainPrior: parseAmount(form.cbAcqGainPrior),
        };
      if (ct === "conversion_reverse")
        return {
          type: "convertible_bond",
          caseType: "conversion_reverse",
          bondMarketValue: parseAmount(form.cbMarketValue),
          preConvPrice: parseAmount(form.cbPreConvPrice),
          preConvShares: parseAmount(form.cbPreConvShares),
          conversionPrice: parseAmount(form.cbConversionPrice),
          increasedShares: parseAmount(form.cbIncreasedShares),
          relatedPreRatio: { numer: Math.round(parseDecimal(form.cbRelatedPreRatioPct) * 100), denom: 10_000 },
        };
      return { type: "convertible_bond", caseType: "acquisition", bondMarketValue: parseAmount(form.cbMarketValue), acquisitionPrice: parseAmount(form.cbAcquisitionPrice) };
    }
    case "convertible_stock": {
      const isHigh = form.csDirection === "high";
      const needsRatio = isHigh && form.csSubType !== "forfeited_realloc";
      const side = (k: { prePrice: string; preShares: string; newPrice: string; issuedShares: string; forfeitedShares: string; relatedAcquired: string; ratioDenom: string }) => ({
        direction: form.csDirection,
        subType: form.csSubType,
        preIssuePrice: parseAmount(k.prePrice),
        preIssueShares: parseAmount(k.preShares),
        newSharePrice: parseAmount(k.newPrice),
        issuedShares: parseAmount(k.issuedShares),
        forfeitedShares: parseAmount(k.forfeitedShares),
        relatedAcquiredShares: needsRatio ? parseAmount(k.relatedAcquired) : undefined,
        ratioDenomShares: needsRatio ? parseAmount(k.ratioDenom) : undefined,
      });
      return {
        type: "convertible_stock",
        atConversion: side({ prePrice: form.csConvPrePrice, preShares: form.csConvPreShares, newPrice: form.csConvNewPrice, issuedShares: form.csConvIssuedShares, forfeitedShares: form.csConvForfeitedShares, relatedAcquired: form.csConvRelatedAcquiredShares, ratioDenom: form.csConvRatioDenomShares }),
        atIssuance: side({ prePrice: form.csIssuePrePrice, preShares: form.csIssuePreShares, newPrice: form.csIssueNewPrice, issuedShares: form.csIssueIssuedShares, forfeitedShares: form.csIssueForfeitedShares, relatedAcquired: form.csIssueRelatedAcquiredShares, ratioDenom: form.csIssueRatioDenomShares }),
      };
    }
    case "acquisition_fund_presumption":
      return {
        type: "acquisition_fund_presumption",
        subType: form.afSubType,
        acquisitionValue: parseAmount(form.afAcquisitionValue),
        provenAmount: parseAmount(form.afProvenAmount),
      };
    case "nominee_trust":
      return {
        type: "nominee_trust",
        propertyValue: parseAmount(form.ntPropertyValue),
        hasTaxAvoidancePurpose: form.ntTaxAvoidance,
        isExcluded: form.ntExcluded,
      };
    case "excess_dividend":
      return {
        type: "excess_dividend",
        excessDividend: parseAmount(form.edExcessDividend),
        incomeTaxEquivalent: parseAmount(form.edIncomeTax),
      };
    case "listing_gain":
      return {
        type: "listing_gain",
        eventType: form.lgEventType,
        settlementPerSharePrice: parseAmount(form.lgSettlementPrice),
        perShareAcqValue: parseAmount(form.lgAcqValue),
        perShareCorpGrowth: parseAmount(form.lgCorpGrowth),
        shares: parseAmount(form.lgShares),
      };
    case "property_service_use":
      return {
        type: "property_service_use",
        subType: form.psuSubType,
        marketValue: parseAmount(form.psuMarketValue),
        consideration: form.psuSubType === "free_use" ? undefined : parseAmount(form.psuConsideration),
      };
    case "org_change":
      return {
        type: "org_change",
        subType: form.ocSubType,
        baseValue: parseAmount(form.ocBaseValue),
        preShares: parseAmount(form.ocPreShares),
        postShares: parseAmount(form.ocPostShares),
        postPerSharePrice: parseAmount(form.ocPostPerShare),
        preValue: parseAmount(form.ocPreValue),
        postValue: parseAmount(form.ocPostValue),
      };
    case "value_increase":
      return {
        type: "value_increase",
        currentValue: parseAmount(form.viCurrentValue),
        acquisitionCost: parseAmount(form.viAcqCost),
        normalIncrease: parseAmount(form.viNormalIncrease),
        contribution: parseAmount(form.viContribution),
      };
    case "specific_corp":
      return {
        type: "specific_corp",
        transactionBenefit: parseAmount(form.scTransactionBenefit),
        corporateTax: parseAmount(form.scCorporateTax),
        ownershipRatio: { numer: Math.round(parseDecimal(form.scRatioPct) * 100), denom: 10_000 },
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
