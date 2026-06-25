/**
 * 증여로 보는 경우 — 폼 → 엔진 입력 변환 + 증여세 마법사 prefill 어댑터 (④ 동기화).
 */
import type { DeemedGiftInput, DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { toOptionalDate } from "@/lib/api/date-coerce";
import { resolveFreeLoanRate } from "@/lib/tax-engine/data/gift-deemed-rates";
import { applyRateFraction } from "@/lib/tax-engine/tax-utils";
import {
  bondInterestLoss,
  computeExcessRatio,
  applyExcessRatio,
  PV_FACTOR_SCALE,
} from "@/lib/tax-engine/gift-deemed/convertible-bond-helpers";
import {
  DEEMED_TYPE_META,
  type DeemedFormState,
} from "@/components/calc/deemed-gift/shared";
import type { FormState as GiftFormState } from "@/components/calc/gift-tax-form-shared";

/** 폼 상태 → DeemedGiftInput (유형별 분기) */
export function buildDeemedGiftInput(form: DeemedFormState): DeemedGiftInput {
  switch (form.type) {
    case "trust_benefit":
      return {
        type: "trust_benefit",
        beneficiaryType: form.tbBeneficiaryType,
        trustPropertyValue: parseAmount(form.tbPropertyValue),
        // 확정 시 % → 분수 (10%→{1000,10000}). 미확정이면 undefined → 엔진이 칙§19의2② 3% 적용
        yieldRate: form.tbYieldDetermined
          ? { numer: Math.round(parseDecimal(form.tbYieldRatePct) * 100), denom: 10_000 }
          : undefined,
        withholdingRate: { numer: Math.round(parseDecimal(form.tbWithholdingPct) * 100), denom: 10_000 },
        incomeAnnuityType: form.tbAnnuityType,
        installments: form.tbAnnuityType === "finite" ? Math.round(parseDecimal(form.tbInstallments)) : undefined,
        incomeIntervalYears: form.tbIntervalYears ? parseDecimal(form.tbIntervalYears) : undefined,
        expectedRemainingYears: form.tbExpectedRemainingYears ? parseDecimal(form.tbExpectedRemainingYears) : undefined,
        beneficiaryGender: form.tbBeneficiaryGender || undefined,
        beneficiaryAge: form.tbBeneficiaryAge ? parseDecimal(form.tbBeneficiaryAge) : undefined,
        incomeGiftDate: toOptionalDate(form.tbIncomeGiftDate || undefined),
        principalGiftDate: toOptionalDate(form.tbPrincipalGiftDate || undefined),
        surrenderValue: form.tbSurrenderValue ? parseAmount(form.tbSurrenderValue) : undefined,
        giftTimingType: form.tbGiftTiming,
      };
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
        // 다기간(G2/G3) — 토글 ON 시에만 전달(undefined=단일). value=subType별 의미
        periods: form.freePeriods?.map((p) => ({
          startDate: p.startDate,
          propertyValue: form.freeSubType === "free_use" ? parseAmount(p.value) : undefined,
          loanAmount: form.freeSubType === "collateral" ? parseAmount(p.value) : undefined,
          actualInterestPaid: form.freeSubType === "collateral" ? parseAmount(p.interest) : undefined,
        })),
        // 경정청구(G1) — 무상사용(분모 60)·담보(분모 12) 공통 (§79②1호·§81⑤)
        rectification: form.freeRectOn
          ? {
              giftTaxCalculated: parseAmount(form.freeRectTax),
              giftDate: form.freeRectGiftDate,
              terminationDate: form.freeRectTermDate,
            }
          : undefined,
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
      const ratioFromPct = (pct: string) => ({ numer: Math.round(parseDecimal(pct) * 100), denom: 10_000 });
      const optAmount = (s: string) => (s.trim() ? parseAmount(s) : undefined);
      if (ct === "transfer")
        return { type: "convertible_bond", caseType: "transfer", bondMarketValue: parseAmount(form.cbMarketValue), transferPrice: parseAmount(form.cbTransferPrice) };
      if (ct === "conversion") {
        const increasedShares = parseAmount(form.cbIncreasedShares);
        // 초과분 자동산정(⑤) — creditedShares·이자손실분 안분. 미입력 시 직접입력(또는 전부=증가주식수)
        let creditedShares = optAmount(form.cbCreditedShares) ?? increasedShares;
        let excessRatio: { numer: number; denom: number } | undefined;
        if (form.cbAutoExcess) {
          excessRatio = computeExcessRatio({
            subscribedShares: parseAmount(form.cbSubscribedShares),
            totalSubscribableShares: parseAmount(form.cbTotalSubscribable),
            ownPreRatio: ratioFromPct(form.cbOwnPreRatioPct),
          });
          creditedShares = excessRatio.numer;
        }
        // 이자손실분 자동계산(PV §10의2) — full × 초과분비율. 미입력 시 직접입력
        let interestLoss: number;
        if (form.cbAutoInterestLoss) {
          const maturity = parseAmount(form.cbBondMaturity);
          const annualCoupon = applyRateFraction(maturity, Math.round(parseDecimal(form.cbCouponRatePct) * 100), 10_000);
          const full = bondInterestLoss({
            maturityAmount: maturity,
            annualCoupon,
            pvFactorAppropriate: Math.round(parseDecimal(form.cbPvFactorAppr) * PV_FACTOR_SCALE),
            annuityFactorAppropriate: Math.round(parseDecimal(form.cbAnnuityFactorAppr) * PV_FACTOR_SCALE),
          });
          interestLoss = excessRatio ? applyExcessRatio(full, excessRatio) : full;
        } else {
          interestLoss = parseAmount(form.cbInterestLoss);
        }
        return {
          type: "convertible_bond",
          caseType: "conversion",
          bondMarketValue: parseAmount(form.cbMarketValue),
          preConvPrice: parseAmount(form.cbPreConvPrice),
          preConvShares: parseAmount(form.cbPreConvShares),
          conversionPrice: parseAmount(form.cbConversionPrice),
          increasedShares,
          creditedShares,
          isListed: form.cbIsListed,
          listedMarketAvg: form.cbIsListed ? parseAmount(form.cbListedMarketAvg) : undefined,
          interestLoss,
          acquisitionGainPrior: parseAmount(form.cbAcqGainPrior),
          bondTransferGainForCap: optAmount(form.cbTransferGainForCap),
        };
      }
      if (ct === "conversion_reverse")
        return {
          type: "convertible_bond",
          caseType: "conversion_reverse",
          bondMarketValue: parseAmount(form.cbMarketValue),
          preConvPrice: parseAmount(form.cbPreConvPrice),
          preConvShares: parseAmount(form.cbPreConvShares),
          conversionPrice: parseAmount(form.cbConversionPrice),
          increasedShares: parseAmount(form.cbIncreasedShares),
          isListed: form.cbIsListed,
          listedMarketAvg: form.cbIsListed ? parseAmount(form.cbListedMarketAvg) : undefined,
          relatedPreRatio: ratioFromPct(form.cbRelatedPreRatioPct),
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

  // 신탁이익(§33): 원본권·수익권 별개 증여시기 → subGifts를 항목 분리 이관.
  // 마법사 giftDate는 단일이므로 수익권 증여시기 우선(원본권 증여시기가 다르면 별도 신고 — 결과뷰 안내).
  if (result.type === "trust_benefit" && result.subGifts && result.subGifts.length > 0) {
    const RIGHT_LABEL = { principal: "원본권", income: "수익권" } as const;
    return {
      giftDate: form.tbIncomeGiftDate || form.tbPrincipalGiftDate || form.giftDate,
      giftItems: result.subGifts.map((sg) => ({
        id: `deemed-trust-${sg.right}`,
        category: "other" as const,
        name: `신탁이익(${RIGHT_LABEL[sg.right]}) 증여이익`,
        marketValue: sg.value,
      })),
    };
  }

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
