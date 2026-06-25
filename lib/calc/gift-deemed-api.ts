/**
 * 증여로 보는 경우 — 폼 → 엔진 입력 변환 + 증여세 마법사 prefill 어댑터 (④ 동기화).
 */
import type { DeemedGiftInput, DeemedGiftAnyResult } from "@/lib/tax-engine/gift-deemed/types";
import type { ContributionParty } from "@/lib/tax-engine/gift-deemed/types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
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
import { deriveDonorRelation } from "@/lib/calc/prior-gift-donee-derive";

/** 폼 상태 → 와이어 입력 (단건 의제 + 증자 cap-table은 캐스트 — route가 Zod 재검증 후 dispatch) */
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
      if (form.mrgCaseType === "non_stock") {
        return {
          type: "merger",
          caseType: "non_stock",
          overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
          majorShares: parseAmount(form.mrgMajorShares),
          faceValue: parseAmount(form.mrgFaceValue),
          mergeConsideration: parseAmount(form.mrgConsideration),
        };
      }
      {
        const useSh = form.mrgUseShareholders;
        const overSh = form.mrgOverShareholders.map((s) => ({
          id: s.name.trim(),
          name: s.name.trim(),
          shares: parseAmount(s.shares),
        }));
        const underSh = form.mrgUnderShareholders.map((s) => ({
          id: s.name.trim(),
          name: s.name.trim(),
          shares: parseAmount(s.shares),
        }));
        // 매트릭스 모드는 auto 강제(㉮ 단순평균액). preShares는 주주 합으로 도출(단일소스).
        const autoEval = useSh || form.mrgMergedPriceMode === "auto";
        return {
          type: "merger",
          caseType: "stock",
          overvaluedSharePrice: parseAmount(form.mrgOvervaluedPrice),
          preMergerShares: useSh ? overSh.reduce((a, b) => a + b.shares, 0) : parseAmount(form.mrgPreShares),
          exchangedShares: parseAmount(form.mrgExchangedShares),
          majorShares: useSh ? 0 : parseAmount(form.mrgMajorShares),
          mergedPriceMode: autoEval ? "auto" : "direct",
          isRelatedCompany: form.mrgIsRelatedCompany,
          ...(autoEval
            ? {
                underSharePrice: parseAmount(form.mrgUnderSharePrice),
                underPreShares: useSh ? underSh.reduce((a, b) => a + b.shares, 0) : parseAmount(form.mrgUnderPreShares),
                postMergerTotalShares: parseAmount(form.mrgPostMergerTotalShares),
                isListed: form.mrgIsListed,
                ...(form.mrgIsListed && { listedPostAvgPrice: parseAmount(form.mrgListedPostAvgPrice) }),
              }
            : { mergedSharePrice: parseAmount(form.mrgMergedPrice) }),
          ...(useSh && {
            shareholders: {
              overvalued: overSh,
              undervalued: underSh,
              exchangeRatio: { numer: parseAmount(form.mrgExchangeNumer), denom: parseAmount(form.mrgExchangeDenom) },
            },
          }),
          ...(form.mrgIsSplitMerger && {
            isSplitMerger: true,
            splitValuationMode: form.mrgSplitMode,
            ...(form.mrgSplitMode === "net_asset_ratio" && {
              splitCompanyPreSharePrice: parseAmount(form.mrgSplitPrePrice),
              splitBusinessNetAsset: parseAmount(form.mrgSplitBusinessNetAsset),
              splitCompanyNetAsset: parseAmount(form.mrgSplitCompanyNetAsset),
            }),
          }),
        };
      }
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
    case "capital_increase_allocation":
      // cap-table은 DeemedGiftInput(단건 엔진) 멤버가 아님 — route가 Zod 재검증 후 별도 dispatch
      return {
        type: "capital_increase_allocation",
        direction: form.ciAllocDirection,
        preIssuePrice: parseAmount(form.ciAllocPrePrice),
        newSharePrice: parseAmount(form.ciAllocNewPrice),
        shareholders: form.ciAllocRows.map((r) => ({
          id: r.id,
          name: r.name.trim() || undefined,
          preShares: parseAmount(r.preShares),
          entitledShares: parseAmount(r.entitledShares),
          subscribedShares: parseAmount(r.subscribedShares),
          reallocatedShares: parseAmount(r.reallocatedShares) || undefined,
          relatedTo: r.relatedTo.length > 0 ? r.relatedTo : undefined,
        })),
      } as unknown as DeemedGiftInput;
    case "capital_decrease":
      if (form.cdMode === "multi") {
        // 멀티(불균등 감자 N:N) — 주주 테이블. 저가/고가는 엔진이 자동 판정.
        return {
          type: "capital_decrease",
          sharePrice: parseAmount(form.cdSharePrice),
          faceValue: parseAmount(form.cdFaceValue) || undefined,
          preTotalShares: parseAmount(form.cdPreTotalShares),
          shareholders: form.cdShareholders.map((row) => ({
            id: row.id,
            name: row.name,
            preShares: parseAmount(row.preShares),
            redeemedShares: parseAmount(row.redeemedShares),
            redemptionPricePerShare: parseAmount(row.redemptionPrice) || undefined,
            relationGroup: row.relationGroup || undefined,
          })),
        };
      }
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
      // conParties 3-state: undefined=미전달 / []=빈(validate 차단됨) / [...]=데이터
      const parties: ContributionParty[] | undefined =
        form.conParties === undefined
          ? undefined
          : form.conParties.map((p) => ({
              name: p.name || undefined,
              preShares: parseAmount(p.shares),
              relation: (p.relation || undefined) as GiftDonorRelation | undefined,
            }));
      return {
        type: "contribution",
        caseType: form.conCaseType,
        preContribPrice: parseAmount(form.conPrePrice),
        preContribShares: parseAmount(form.conPreShares),
        newSharePrice: parseAmount(form.conNewPrice),
        contributedShares: parseAmount(form.conContributedShares),
        allocatedShares: parseAmount(form.conAllocatedShares),
        // 고가 + roster無 경로만 relatedRatio 전달 (roster有면 parties 경로)
        relatedRatio: isHigh && !form.conParties
          ? { numer: Math.round(parseDecimal(form.conRelatedRatioPct) * 100), denom: 10_000 }
          : undefined,
        smallShareholderImputation: !isHigh ? form.conSmallImputation : undefined,
        parties,
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
    case "excess_dividend": {
      // ① 주주 배열 → shareholders 변환 (ownershipRatioPct → 분수)
      const edRows = form.edShareholders ?? [];
      const shareholders = edRows.map((row) => {
        const pct = parseDecimal(row.ownershipRatioPctStr);
        return {
          id: row.id,
          role: row.role,
          // 소수점 3자리까지 지원: 10.5% → {1050, 10000}
          ownershipRatio: {
            numer: Math.round(pct * 100),
            denom: 10_000,
          },
          actualDividend: parseAmount(row.actualDividendStr),
          name: row.name || undefined,
        };
      });

      // ② 소득세 모드별 조건부 필드
      const incomeTaxMode = form.edIncomeTaxMode ?? "undetermined";
      const separateIncomeTax =
        incomeTaxMode === "separate"
          ? parseAmount(form.edSeparateTaxAmount)
          : undefined;
      const comprehensiveTaxBase =
        incomeTaxMode === "comprehensive"
          ? parseAmount(form.edComprehensiveTaxBase)
          : undefined;
      // ⓑ기준 — 미입력 시 엔진 자동 추정
      const comprehensiveTaxBaseExcluding =
        incomeTaxMode === "comprehensive" && form.edComprehensiveTaxBaseExcluding
          ? parseAmount(form.edComprehensiveTaxBaseExcluding)
          : undefined;
      // 소득 귀속연도 override — 미입력 시 배당지급일 연도
      const incomeTaxYear =
        form.edIncomeTaxYear ? Number(form.edIncomeTaxYear) : undefined;

      // ③ 정산 2-pass 입력
      const actualIncomeTax = form.edSettlementMode
        ? parseAmount(form.edActualIncomeTax)
        : undefined;

      // ④ 증여세 과세 맥락 (giftTaxContext) — 증여자관계가 선택된 경우에만 전달
      const giftTaxContext = form.edDonorRelationship
        ? {
            donorRelationship: form.edDonorRelationship,
            priorDeductionApplied: form.edPriorDeductionApplied
              ? parseAmount(form.edPriorDeductionApplied)
              : undefined,
            isGenerationSkip: form.edIsGenerationSkip || undefined,
            isMinorGenerationSkip: form.edIsMinorGenerationSkip || undefined,
            isWithinFilingDeadline: form.edIsWithinFilingDeadline,
          }
        : undefined;

      // ⑤ 배당지급일 = 증여일 = 공통 giftDate (§41의2①). edDividendDate 폐지 — 다른 의제 유형과 일관.
      // buildDeemedGiftInput()은 Server Action 경로에서 직접 엔진을 호출할 수도 있어 Date로 변환 후 전달.
      const dividendDate = toOptionalDate(form.giftDate) ?? new Date();

      return {
        type: "excess_dividend" as const,
        shareholders,
        dividendDate,
        incomeTaxMode,
        separateIncomeTax,
        comprehensiveTaxBase,
        comprehensiveTaxBaseExcluding,
        incomeTaxYear,
        actualIncomeTax,
        giftTaxContext,
      };
    }
    case "listing_gain":
      return {
        type: "listing_gain",
        eventType: form.lgEventType,
        settlementPerSharePrice: parseAmount(form.lgSettlementPrice),
        perShareAcqValue: parseAmount(form.lgAcqValue),
        perShareCorpGrowth: parseAmount(form.lgCorpGrowth),
        shares: parseAmount(form.lgShares),
        // 령§31의3⑤ 자동계산 모드 — corpGrowthAuto 지정 시 엔진이 perShareCorpGrowth 무시
        ...(form.lgCorpGrowthMode === "auto"
          ? {
              corpGrowthAuto: {
                totalNetIncomePerShare: parseAmount(form.lgTotalNetIncome),
                monthsBusinessStartToListingPrevDay: parseAmount(form.lgMonthsBusinessStart),
                monthsAcqToSettlement: parseAmount(form.lgMonthsAcqToSettlement),
              },
            }
          : {}),
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
  result: DeemedGiftAnyResult,
): Partial<GiftFormState> {
  // 증자 cap-table: 수증자별 과세분(total>0)을 각각 별도 증여항목으로 이관 (수증자별 증여세 단위 상이)
  if ("perBeneficiary" in result) {
    const nameById = new Map(result.byShareholder.map((b) => [b.id, b.name]));
    return {
      giftDate: form.giftDate,
      giftItems: result.perBeneficiary
        .filter((b) => b.total > 0)
        .map((b) => ({
          id: `deemed-ci-alloc-${b.beneficiaryId}`,
          category: "other" as const,
          name: `${(nameById.get(b.beneficiaryId) ?? "").trim() || "수증자"} 증자이익(§39)`,
          marketValue: b.total,
        })),
    };
  }

  const label = form.type ? DEEMED_TYPE_META[form.type].label : "증여이익";

  // §39의3 현물출자: contributionBreakdown 있으면 저가/고가별 prefill
  if (result.type === "contribution" && result.contributionBreakdown && result.contributionBreakdown.length > 0) {
    // M2 — 저가/고가 판정은 form.conCaseType 명시값으로. gross 대소비교 금지:
    //   고가 roster有도 gross(base) >= Σper-donee 성립 → gross 비교 시 오판.
    const isLow = form.conCaseType !== "high";

    if (isLow) {
      // 저가: N 증여자 → 동시증여 다건 prefill (§47, 조심2010서3741)
      const mainBreakdown = result.contributionBreakdown[0];
      const restBreakdowns = result.contributionBreakdown.slice(1);

      const toDonorRel = (r?: GiftDonorRelation) =>
        r ? deriveDonorRelation(r, false) : ("other_relative" as const);

      const simultaneousGifts =
        restBreakdowns.length > 0
          ? restBreakdowns.map((bd) => ({
              donorRelation: toDonorRel(bd.relation),
              taxableValue: String(bd.value),
            }))
          : undefined;

      return {
        giftDate: form.giftDate,
        donorRelation: toDonorRel(mainBreakdown.relation),
        giftItems: [
          {
            id: `deemed-contribution-${mainBreakdown.party}`,
            category: "other" as const,
            name: `현물출자에 따른 이익 — ${mainBreakdown.party} 증여분`,
            marketValue: mainBreakdown.value,
          },
        ],
        simultaneousGifts,
      };
    }

    // 고가: 수증자 첫 행 단건 prefill (multi-수증자 N-건 자동화는 Phase B 후속)
    const firstDonee = result.contributionBreakdown[0];
    return {
      giftDate: form.giftDate,
      donorRelation: deriveDonorRelation(
        (firstDonee.relation ?? "other") as GiftDonorRelation,
        false,
      ),
      giftItems: [
        {
          id: `deemed-contribution-high-${firstDonee.party}`,
          category: "other" as const,
          name: `현물출자에 따른 이익 — ${firstDonee.party} 수증자분`,
          marketValue: firstDonee.value,
        },
      ],
    };
  }

  // 감자 멀티(§39의2): 과세 수증자 여러 명 → 선택된 수증자의 total만 이관(수증자별 별도 신고).
  if (result.type === "capital_decrease" && result.capitalDecreaseMulti) {
    const taxable = result.capitalDecreaseMulti.donees.filter((d) => d.isTaxable);
    const selected = taxable[form.cdSelectedDoneeIndex] ?? taxable[0];
    if (!selected) return { giftDate: form.giftDate, giftItems: [] };
    return {
      giftDate: form.giftDate,
      giftItems: [
        {
          id: `deemed-capital_decrease-${selected.name}`,
          category: "other",
          name: `감자에 따른 이익 증여이익 (${selected.name})`,
          marketValue: selected.total,
        },
      ],
    };
  }

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
        // §47① 합산배제증여재산(§41의3·§41의5 등) → 본세 §55①3호 스트림. 비합산배제 deemed는 undefined.
        ...(result.aggregationExcluded ? { isAggregationExcludedGift: true } : {}),
      },
    ],
  };
}
