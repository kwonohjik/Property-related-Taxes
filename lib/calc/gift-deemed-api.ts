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
import { buildPhase3DeemedInput } from "./gift-deemed-api-phase3";

/** 폼 상태 → 와이어 입력 (단건 의제 + 증자 cap-table은 캐스트 — route가 Zod 재검증 후 dispatch) */
/**
 * 1-A — 비율 인자 개방. 어느 갈래에 어떤 인자가 필요한지 한 곳에서 정한다.
 *  · 고가(§39①2호) **전 subType**: 가목=§29②3호 다목 · 나목=§29②4호 · 다·라목=§29②5호 —
 *    모두 `relatedAcquiredShares ÷ ratioDenomShares`로 가중한다(종전엔 가목이 빠져 있었다).
 *  · 저가 나목(§39①1호 나목): §29②2호 다목 = 증자후 지분비율 × 특수관계인 실권주수.
 */
function capitalRatioNeeds(direction: "low" | "high", subType: DeemedFormState["ciSubType"]) {
  const isHigh = direction === "high";
  return { needsRatio: isHigh, needsLowDanmok: !isHigh && subType === "no_realloc" };
}

export function buildDeemedGiftInput(form: DeemedFormState): DeemedGiftInput {
  // Phase 3 추정·의제는 별도 파일로 분리했다(800줄 정책). 해당 없으면 null.
  const phase3 = buildPhase3DeemedInput(form);
  if (phase3) return phase3;
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
          // 🔴 IG-014: 라벨이 「합병대가 (액면 미달 시 적용)」이라 대가가 액면 이상인 사용자는 비워 둔다.
          // 0을 그대로 보내면 엔진의 `const consideration = input.mergeConsideration ?? face;`가
          // 0은 nullish가 아니라서 발동하지 않고 `base = Math.min(face, 0) = 0` → 증여이익이
          // 항상 0원이 된다. 같은 파일의 다른 분기 관례(`|| undefined`)를 적용해 `?? face`를 살린다.
          mergeConsideration: parseAmount(form.mrgConsideration) || undefined,
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
      const { needsRatio, needsLowDanmok } = capitalRatioNeeds(form.ciDirection, form.ciSubType);
      const ciPostDenom = parseAmount(form.ciPostTotalShares);
      return {
        type: "capital_increase",
        direction: form.ciDirection,
        subType: form.ciSubType,
        preIssuePrice: parseAmount(form.ciPrePrice),
        preIssueShares: parseAmount(form.ciPreShares),
        newSharePrice: parseAmount(form.ciNewPrice),
        issuedShares: parseAmount(form.ciIssuedShares),
        forfeitedShares: parseAmount(form.ciForfeitedShares),
        relatedAcquiredShares:
          needsRatio || needsLowDanmok ? parseAmount(form.ciRelatedAcquiredShares) : undefined,
        ratioDenomShares: needsRatio ? parseAmount(form.ciRatioDenomShares) : undefined,
        // 0은 「미입력」과 같게 다룬다 — 엔진이 실제 증가주식수로 되돌아간다.
        equalIssueShares:
          needsLowDanmok && parseAmount(form.ciEqualIssueShares) > 0
            ? parseAmount(form.ciEqualIssueShares)
            : undefined,
        // 분모가 0이면 비율이 성립하지 않으므로 아예 보내지 않는다 — 엔진이 종전 동작으로 되돌아간다.
        postIssueSubscriberRatio:
          needsLowDanmok && ciPostDenom > 0
            ? { numer: parseAmount(form.ciPostHeldShares), denom: ciPostDenom }
            : undefined,
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
        // UI 게이트와 «같은 술어»로 전달한다 — contribution-form.tsx의 토글은
        // `!isHigh && !hasRoster`(hasRoster = conParties)일 때만 렌더된다.
        // 바로 위 형제 필드 relatedRatio는 이미 그 형태다. 종전에는 roster를 안 봐서,
        // 토글을 켠 뒤 명부를 켜면 토글이 사라져 되돌릴 수 없는데도 결과 note에
        // 「§39의3② 소액주주 1인 의제」가 계속 붙었다(적용되지 않은 조항의 표시).
        smallShareholderImputation:
          !isHigh && !form.conParties ? form.conSmallImputation : undefined,
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
      const { needsRatio, needsLowDanmok } = capitalRatioNeeds(form.csDirection, form.csSubType);
      const side = (k: { prePrice: string; preShares: string; newPrice: string; issuedShares: string; forfeitedShares: string; relatedAcquired: string; ratioDenom: string; equalIssue: string; postHeld: string; postTotal: string; isListed: boolean; listedMarketAvg: string; allocationMethod: DeemedFormState["ciAllocationMethod"] }) => ({
        direction: form.csDirection,
        subType: form.csSubType,
        preIssuePrice: parseAmount(k.prePrice),
        preIssueShares: parseAmount(k.preShares),
        newSharePrice: parseAmount(k.newPrice),
        issuedShares: parseAmount(k.issuedShares),
        forfeitedShares: parseAmount(k.forfeitedShares),
        relatedAcquiredShares: needsRatio || needsLowDanmok ? parseAmount(k.relatedAcquired) : undefined,
        ratioDenomShares: needsRatio ? parseAmount(k.ratioDenom) : undefined,
        equalIssueShares:
          needsLowDanmok && parseAmount(k.equalIssue) > 0 ? parseAmount(k.equalIssue) : undefined,
        postIssueSubscriberRatio:
          needsLowDanmok && parseAmount(k.postTotal) > 0
            ? { numer: parseAmount(k.postHeld), denom: parseAmount(k.postTotal) }
            : undefined,
        // §29②6이 §29②1~5를 상속하므로 시점별로 단서가 각각 걸린다
        isListed: k.isListed,
        listedMarketAvg: k.isListed ? parseAmount(k.listedMarketAvg) : undefined,
        allocationMethod: k.allocationMethod,
      });
      return {
        type: "convertible_stock",
        atConversion: side({ prePrice: form.csConvPrePrice, preShares: form.csConvPreShares, newPrice: form.csConvNewPrice, issuedShares: form.csConvIssuedShares, forfeitedShares: form.csConvForfeitedShares, relatedAcquired: form.csConvRelatedAcquiredShares, ratioDenom: form.csConvRatioDenomShares, equalIssue: form.csConvEqualIssueShares, postHeld: form.csConvPostHeldShares, postTotal: form.csConvPostTotalShares, isListed: form.csConvIsListed, listedMarketAvg: form.csConvListedMarketAvg, allocationMethod: form.csConvAllocationMethod }),
        atIssuance: side({ prePrice: form.csIssuePrePrice, preShares: form.csIssuePreShares, newPrice: form.csIssueNewPrice, issuedShares: form.csIssueIssuedShares, forfeitedShares: form.csIssueForfeitedShares, relatedAcquired: form.csIssueRelatedAcquiredShares, ratioDenom: form.csIssueRatioDenomShares, equalIssue: form.csIssueEqualIssueShares, postHeld: form.csIssuePostHeldShares, postTotal: form.csIssuePostTotalShares, isListed: form.csIssueIsListed, listedMarketAvg: form.csIssueListedMarketAvg, allocationMethod: form.csIssueAllocationMethod }),
      };
    }
    default:
      throw new Error("증여 유형을 선택하세요");
  }
}


// prefill 어댑터는 800줄 정책으로 분리 — import 경로 보존을 위해 re-export한다.
export { buildGiftWizardPrefill } from "./gift-deemed-prefill";
