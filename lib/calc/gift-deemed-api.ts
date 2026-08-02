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
    case "free_loan": {
      // §43² 다건 합산 (loanLoans 토글 ON) → free_loan_aggregated 별도 type dispatch
      if (form.loanLoans !== undefined) {
        return {
          type: "free_loan_aggregated",
          loans: form.loanLoans.map((item) => ({
            loanDate: item.loanDate,
            loanAmount: parseAmount(item.amount),
            actualInterestPaid: parseAmount(item.interest),
            appropriateRate: resolveFreeLoanRate(item.loanDate || form.giftDate || "2024-01-01"),
            isRelatedParty: form.loanRelated,
            hasJustifiableReason: form.loanJustifiable,
          })),
        };
      }
      // 단건 + §41의4② 다년(기간 양끝 입력 시만 — date-coerce N/A, 문자열 그대로)
      return {
        type: "free_loan",
        loanAmount: parseAmount(form.loanAmount),
        actualInterestPaid: parseAmount(form.loanInterest),
        appropriateRate: resolveFreeLoanRate(form.giftDate || "2024-01-01"),
        isRelatedParty: form.loanRelated,
        hasJustifiableReason: form.loanJustifiable,
        ...(form.loanStartDate && form.loanEndDate
          ? { loanStartDate: form.loanStartDate, loanEndDate: form.loanEndDate }
          : {}),
      };
    }
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
        isListed: form.ciIsListed,
        listedMarketAvg: form.ciIsListed ? parseAmount(form.ciListedMarketAvg) : undefined,
        allocationMethod: form.ciAllocationMethod,
      };
    }
    case "capital_increase_allocation":
      // cap-table은 DeemedGiftInput(단건 엔진) 멤버가 아님 — route가 Zod 재검증 후 별도 dispatch
      return {
        type: "capital_increase_allocation",
        direction: form.ciAllocDirection,
        // §39① 괄호 「주권상장법인이」 — 공모 배정 제외 AND 조건. ㉯ 계산에는 쓰이지 않는다(안 C)
        isListed: form.ciAllocIsListed,
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
          allocationMethod: r.allocationMethod,
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
            faceValue: parseAmount(form.cdFaceValue) || undefined, // §29의2①2호 액면 게이트
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
        isListed: form.conIsListed,
        listedMarketAvg: form.conIsListed ? parseAmount(form.conListedMarketAvg) : undefined,
        publicOfferingShares: form.conIsListed ? parseAmount(form.conPublicOfferingShares) : undefined,
      };
    }
    case "convertible_bond": {
      const ct = form.cbCaseType;
      const ratioFromPct = (pct: string) => ({ numer: Math.round(parseDecimal(pct) * 100), denom: 10_000 });
      const optAmount = (s: string) => (s.trim() ? parseAmount(s) : undefined);
      // §40①1호·2호 각 목 + 발행 방법 — 라목(conversion_reverse)·3호(transfer)는 제외 대상이 아니라 미전달
      const clauseFields = { clause: form.cbClause, issuanceMethod: form.cbIssuanceMethod };
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
          ...clauseFields,
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
      // 1호 — isListed는 공모 발행 제외의 AND 조건이라 acquisition 경로에도 전달한다(종전 미전달)
      return {
        type: "convertible_bond",
        caseType: "acquisition",
        ...clauseFields,
        isListed: form.cbIsListed,
        bondMarketValue: parseAmount(form.cbMarketValue),
        acquisitionPrice: parseAmount(form.cbAcquisitionPrice),
      };
    }
    case "convertible_stock": {
      const isHigh = form.csDirection === "high";
      const needsRatio = isHigh && form.csSubType !== "forfeited_realloc";
      const side = (k: { prePrice: string; preShares: string; newPrice: string; issuedShares: string; forfeitedShares: string; relatedAcquired: string; ratioDenom: string; isListed: boolean; listedMarketAvg: string; allocationMethod: DeemedFormState["ciAllocationMethod"] }) => ({
        direction: form.csDirection,
        subType: form.csSubType,
        preIssuePrice: parseAmount(k.prePrice),
        preIssueShares: parseAmount(k.preShares),
        newSharePrice: parseAmount(k.newPrice),
        issuedShares: parseAmount(k.issuedShares),
        forfeitedShares: parseAmount(k.forfeitedShares),
        relatedAcquiredShares: needsRatio ? parseAmount(k.relatedAcquired) : undefined,
        ratioDenomShares: needsRatio ? parseAmount(k.ratioDenom) : undefined,
        // §29②6이 §29②1~5를 상속하므로 시점별로 단서가 각각 걸린다
        isListed: k.isListed,
        listedMarketAvg: k.isListed ? parseAmount(k.listedMarketAvg) : undefined,
        allocationMethod: k.allocationMethod,
      });
      return {
        type: "convertible_stock",
        atConversion: side({ prePrice: form.csConvPrePrice, preShares: form.csConvPreShares, newPrice: form.csConvNewPrice, issuedShares: form.csConvIssuedShares, forfeitedShares: form.csConvForfeitedShares, relatedAcquired: form.csConvRelatedAcquiredShares, ratioDenom: form.csConvRatioDenomShares, isListed: form.csConvIsListed, listedMarketAvg: form.csConvListedMarketAvg, allocationMethod: form.csConvAllocationMethod }),
        atIssuance: side({ prePrice: form.csIssuePrePrice, preShares: form.csIssuePreShares, newPrice: form.csIssueNewPrice, issuedShares: form.csIssueIssuedShares, forfeitedShares: form.csIssueForfeitedShares, relatedAcquired: form.csIssueRelatedAcquiredShares, ratioDenom: form.csIssueRatioDenomShares, isListed: form.csIssueIsListed, listedMarketAvg: form.csIssueListedMarketAvg, allocationMethod: form.csIssueAllocationMethod }),
      };
    }
    case "acquisition_fund_presumption":
      return {
        type: "acquisition_fund_presumption",
        subType: form.afSubType,
        acquisitionValue: parseAmount(form.afAcquisitionValue),
        provenAmount: parseAmount(form.afProvenAmount),
      };
    case "nominee_trust": {
      const ntPerShare = form.ntValuationMode === "per_share";
      return {
        type: "nominee_trust",
        // per_share 모드는 propertyValue 미전송 — 엔진이 perSharePrice×nomineeShares로 단일 도출(dual-truth 금지)
        ...(ntPerShare ? {} : { propertyValue: parseAmount(form.ntPropertyValue) }),
        hasTaxAvoidancePurpose: form.ntTaxAvoidance,
        isExcluded: form.ntExcluded,
        valuationMode: form.ntValuationMode,
        ...(ntPerShare
          ? {
              perSharePrice: parseAmount(form.ntPerSharePrice),
              nomineeShares: parseAmount(form.ntNewShares),
              subscriptionPrice: parseAmount(form.ntSubscriptionPrice) || undefined,
              theoreticalExRightsPrice: parseAmount(form.ntTheoreticalExRights) || undefined,
              preIncreasePerShare: parseAmount(form.ntPreIncreasePerShare) || undefined,
              actualOwnerName: form.ntActualOwner?.trim() || undefined,
              nomineeName: form.ntNominee?.trim() || undefined,
            }
          : {}),
      };
    }
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
        ...(form.lgMajorShareholder ? { isMajorShareholder: true } : {}),
        ...(form.lgSurchargeExempt ? { isSurchargeExemptEntity: true } : {}),
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
        acquisitionCause: form.viAcqCause || undefined,
        valueIncreaseReason: form.viReason,
        acquisitionDate: form.viAcqDate || undefined,
        eventDate: form.viEventDate || undefined,
      };
    case "specific_corp": {
      const isRoster = form.scMode === "roster";
      const isAuto = form.scCorporateTaxMode === "auto";
      const transactionBenefit = parseAmount(form.scTransactionBenefit);
      const giftDeduction = parseAmount(form.scGiftDeduction) || undefined; // 0이면 undefined(엔진 default 0)

      if (isRoster && form.scShareholders && form.scShareholders.length > 0) {
        const totalShares = parseAmount(form.scTotalShares);
        const shareholders = form.scShareholders.map((sh) => ({
          id: sh.id,
          name: sh.name,
          relation: sh.relation,
          shares: parseAmount(sh.shares),
          totalShares,
          isDonor: sh.isDonor,
          isRelated: sh.relation !== "other", // "other"=타인 → 비특수관계인
        }));
        if (isAuto) {
          // auto: 엔진이 안분. raw 4필드 전달. UI 재계산 금지.
          return {
            type: "specific_corp",
            transactionBenefit,
            shareholders,
            annualIncome: parseAmount(form.scCorpIncome),
            corporateTaxComputed: parseAmount(form.scCorpTaxAssessed),
            corporateTaxCredit: parseAmount(form.scCorpTaxDeduction) || undefined,
            giftDeduction,
          };
        } else {
          // direct: corporateTax = 직접 입력 (이월결손금 0 허용 → 0 전달)
          return {
            type: "specific_corp",
            transactionBenefit,
            corporateTax: parseAmount(form.scCorporateTax),
            shareholders,
            giftDeduction,
          };
        }
      }
      // single 경로 (기존 하위호환)
      return {
        type: "specific_corp",
        transactionBenefit,
        corporateTax: parseAmount(form.scCorporateTax),
        ownershipRatio: { numer: Math.round(parseDecimal(form.scRatioPct) * 100), denom: 10_000 },
        giftDeduction,
      };
    }
    case "related_corp": {
      // string → 분수(분모 10000) 변환. ⚠️ discriminated union이라 roster 누락을 TS가 못 잡음 → grep 자가점검.
      const parseRatio = (pctStr: string) => ({
        numer: Math.round(parseDecimal(pctStr) * 100),
        denom: 10_000,
      });
      const shareholders = form.rcShareholders.map((row) => ({
        id: row.id,
        name: row.name,
        relation: (row.relation as "self" | "relative" | "other") || "other",
        directRatio: parseRatio(row.directRatioPctStr),
        isCorporate: row.isCorporate,
      }));
      const intermediaryCorps = form.rcIntermediaryCorps.map((row) => ({
        corpShareholderId: row.corpShareholderId,
        stakeInBeneficiary: parseRatio(row.stakeInBeneficiaryPctStr),
        owners: row.owners.map((o) => ({
          individualId: o.individualId,
          ratio: parseRatio(o.ratioPctStr),
        })),
      }));
      const salesPartners = form.rcSalesPartners.map((row) => ({
        id: row.id,
        name: row.name,
        salesAmount: parseAmount(row.salesAmountStr),
        isRelated: row.isRelated,
        exclusionType: row.exclusionType || undefined,
        rulingShareholderStakes:
          row.rulingStakes.length > 0
            ? row.rulingStakes.map((s) => ({
                shareholderId: s.shareholderId,
                ratio: parseRatio(s.ratioPctStr),
              }))
            : undefined,
      }));
      return {
        type: "related_corp",
        enterpriseSize: (form.rcEnterpriseSize || "small") as "small" | "medium" | "large",
        totalSales: parseAmount(form.rcTotalSalesStr),
        preTaxAdjOperatingIncome: parseAmount(form.rcPreTaxAdjOperatingIncomeStr),
        taxableIncome: parseAmount(form.rcTaxableIncomeStr),
        corporateTaxNet: parseAmount(form.rcCorporateTaxNetStr),
        shareholders,
        intermediaryCorps,
        salesPartners,
      };
    }
    default:
      throw new Error("증여 유형을 선택하세요");
  }
}


// prefill 어댑터는 800줄 정책으로 분리 — import 경로 보존을 위해 re-export한다.
export { buildGiftWizardPrefill } from "./gift-deemed-prefill";
