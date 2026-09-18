/**
 * 증여로 보는 경우 — **Phase 3 추정·의제**의 폼 → 엔진 입력 변환(④ 동기화).
 * §45 재산취득자금 · §45의2 명의신탁 · §41의2 초과배당 · §41의3 상장이익 ·
 * §42 재산사용 · §42의2 조직변경 · §42의3 가치증가 · §45의5 특정법인 · §45의3 일감몰아주기.
 *
 * gift-deemed-api.ts에서 분리(800줄 정책 선제 대응) — 신규 필드 변환은 이 파일에 추가한다.
 * 해당 유형이 아니면 null을 돌려주고 호출자가 Phase 1·2 switch로 넘어간다.
 */
import type { DeemedGiftInput } from "@/lib/tax-engine/gift-deemed/types";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { DeemedFormState } from "@/components/calc/deemed-gift/shared";

export function buildPhase3DeemedInput(form: DeemedFormState): DeemedGiftInput | null {
  switch (form.type) {
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
      // ⓐ §45의5① 특정법인 해당성 신고값(직접+간접 합계). 미입력이면 «전달하지 않는다» —
      // 0을 보내면 single 모드에서 "판정 보류(unknown)"가 "미충족(no)"으로 뒤집혀 정상 계산이 죽는다.
      // 법 §45의5① 거래상대방·거래유형 (영 §34의5②④⑥⑦). 미선택이면 «보내지 않는다» —
      // 엔진이 "unknown"으로 판정을 보류하고 결과뷰가 고지한다(⑧이 제품 경로에서 강제한다).
      const counterparty = form.scCounterparty === "" ? undefined : form.scCounterparty;
      const transactionType = form.scTransactionType;
      const isPriceType = transactionType === "low_price" || transactionType === "high_price";
      const txFields = {
        counterparty,
        transactionType,
        ...(isPriceType
          ? { marketValue: parseAmount(form.scMarketValue), consideration: parseAmount(form.scConsideration) }
          : {}),
        ...(transactionType === "debt_relief"
          ? { isDissolvingWithoutResidual: form.scIsDissolvingNoResidual }
          : {}),
      };
      const groupRatioPct = parseDecimal(form.scGroupRatioPct);
      const controllingGroupRatio =
        form.scGroupRatioPct.trim() === ""
          ? undefined
          : { numer: Math.round(groupRatioPct * 100), denom: 10_000 };

      if (isRoster && form.scShareholders && form.scShareholders.length > 0) {
        const totalShares = parseAmount(form.scTotalShares);
        const shareholders = form.scShareholders.map((sh) => ({
          id: sh.id,
          name: sh.name,
          relation: sh.relation,
          shares: parseAmount(sh.shares),
          totalShares,
          isDonor: sh.isDonor,
          // 법인주주는 「지배주주와 그 친족」(법 §45의4①)이 아니다 — relation과 무관하게 지배주주등에서 뺀다
          isRelated: !sh.isCorporate && sh.relation !== "other", // "other"=타인 → 비특수관계인
          isCorporate: sh.isCorporate,
        }));
        // 간접출자관계 — 경유 법인의 특정법인 지분은 그 법인 «행»의 주식수다(중복 입력 금지, RC-L 회피)
        const sharesById = new Map(form.scShareholders.map((sh) => [sh.id, parseAmount(sh.shares)]));
        const intermediaryCorps = (form.scIntermediaryCorps ?? [])
          .filter((c) => c.corpShareholderId && sharesById.has(c.corpShareholderId))
          .map((c) => ({
            corpShareholderId: c.corpShareholderId,
            stakeInBeneficiary: { numer: sharesById.get(c.corpShareholderId) ?? 0, denom: totalShares },
            owners: c.owners
              .filter((o) => o.individualId)
              .map((o) => ({
                individualId: o.individualId,
                ratio: { numer: Math.round(parseDecimal(o.ratioPctStr) * 100), denom: 10_000 },
              })),
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
            controllingGroupRatio,
            ...txFields,
            intermediaryCorps,
          };
        } else {
          // direct: corporateTax = 직접 입력 (이월결손금 0 허용 → 0 전달)
          return {
            type: "specific_corp",
            transactionBenefit,
            corporateTax: parseAmount(form.scCorporateTax),
            shareholders,
            giftDeduction,
            controllingGroupRatio,
            ...txFields,
            intermediaryCorps,
          };
        }
      }
      // single 경로 (지분율 직접 입력)
      const singleRatio = {
        numer: Math.round(parseDecimal(form.scRatioPct) * 100),
        denom: 10_000,
      };
      if (isAuto) {
        // auto: 엔진이 §34의5④2호로 안분한다. corporateTax를 «보내지 않아야» 한다 —
        // 0을 보내면 엔진의 `input.corporateTax ?? apportion(...)`이 0을 채택해 안분이 죽는다.
        // (UI가 auto에서 직접입력 칸을 숨기므로 scCorporateTax는 항상 ""→0이다.)
        return {
          type: "specific_corp",
          transactionBenefit,
          ownershipRatio: singleRatio,
          annualIncome: parseAmount(form.scCorpIncome),
          corporateTaxComputed: parseAmount(form.scCorpTaxAssessed),
          corporateTaxCredit: parseAmount(form.scCorpTaxDeduction) || undefined,
          giftDeduction,
          controllingGroupRatio,
          ...txFields,
        };
      }
      return {
        type: "specific_corp",
        transactionBenefit,
        corporateTax: parseAmount(form.scCorporateTax),
        ownershipRatio: singleRatio,
        giftDeduction,
        controllingGroupRatio,
        ...txFields,
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
      return null;
  }
}
