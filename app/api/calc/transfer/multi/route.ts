/**
 * 양도소득세 연간 합산 과세 계산 API Route
 *
 * POST /api/calc/transfer/multi
 *
 * Layer 1 (Orchestrator):
 *   Rate Limiting → Zod 검증 → preloadTaxRates (과세기간 말일) → calculateTransferTaxAggregate → 반환
 *
 * 가산세 2-pass:
 *   1차: filingPenalty·delayedPayment 없이 계산 → determinedTax 확보
 *   2차: determinedTax 주입 후 가산세 포함 재계산
 */

import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { multiInputSchema } from "@/lib/api/transfer-tax-schema";
import { mapHousesToEngine, mapGracePeriodToEngine } from "@/lib/api/transfer-route-multi-house";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { mapReductionsToEngine } from "../route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import { computePreliminaryFilingTaxes } from "@/lib/tax-engine/transfer-tax-preliminary-filing";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";

export async function POST(request: NextRequest) {
  // Rate Limiting — 분당 15회 (단건 30회의 절반)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer-multi:${ip}`, { limit: 15, windowMs: 60_000, bypass: shouldBypassRateLimit(request) });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." } },
      {
        status: 429,
        headers: {
          "X-RateLimit-Limit": String(rl.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
        },
      },
    );
  }

  // JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // Zod 검증
  const parsed = multiInputSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return NextResponse.json(
      {
        error: {
          code: TaxErrorCode.INVALID_INPUT,
          message: "입력값이 올바르지 않습니다",
          fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // 세율 로드 — 과세기간 말일(12/31) 기준 1회 (Supabase 미도달 시 로컬 fallback)
  const rateDate = new Date(data.taxYear, 11, 31);
  let rates;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(["transfer"], rateDate);
      if (rates.size === 0) rates = loadFallbackTransferRates(rateDate);
    } catch (err) {
      console.warn(
        "[POST /api/calc/transfer/multi] preloadTaxRates 실패, 로컬 세율 fallback 사용:",
        err,
      );
      rates = loadFallbackTransferRates(rateDate);
    }
  } else {
    rates = loadFallbackTransferRates(rateDate);
  }

  // string → Date 변환 (건별)
  const properties: TransferTaxItemInput[] = data.properties.map((p) => {
    const base: Omit<TransferTaxInput, "annualBasicDeductionUsed" | "skipBasicDeduction" | "skipLossFloor"> = {
      propertyType: p.propertyType,
      transferPrice: p.transferPrice,
      // ⑭ 12억 안분 분모용 총 물건 양도가액 — 지분 모드 전용(⑬이 지분 모드에서만 전송).
      //    누락하면 지분 자산의 §95③ 고가주택 안분 분모가 지분 양도가액이 되어 안분이 틀린다.
      totalPropertyTransferPrice: p.totalPropertyTransferPrice,
      transferDate: toDate(p.transferDate, "transferDate"),
      acquisitionPrice: p.acquisitionPrice,
      acquisitionDate: toDate(p.acquisitionDate, "acquisitionDate"),
      // ⑭ 자산-수준 매매계약일 — §99의3 등 매매계약일 기준 조문 시한 판정용 (per-asset 단건 엔진 honor)
      assetContractDate: toOptionalDate(p.assetContractDate),
      // P5 모드 2 (⑭): 보유 감면주택 주택수 제외 — 세대 단위 공통이라 전 자산 주입
      specialHouseExclusions: (data.specialHouseExclusions ?? []).map((e) => ({
        article: e.article,
        houseAcquisitionDate: toOptionalDate(e.houseAcquisitionDate),
        houseContractDate: toOptionalDate(e.houseContractDate),
        requirementsConfirmed: e.requirementsConfirmed,
      })),
      expenses: p.expenses,
      // ⑭ §97② 단서 swap 분리 입력 — 미명시 시 undefined (swap 비활성)
      capitalExpenditure: p.capitalExpenditure,
      transferExpense: p.transferExpense,
      // ⑭ §89①4호 가목 1세대1입주권 — 조합원입주권 수 (right_to_move_in 자산 전용)
      householdRightCount: p.householdRightCount,
      useEstimatedAcquisition: p.useEstimatedAcquisition,
      standardPriceAtAcquisition: p.standardPriceAtAcquisition,
      // 개산공제(§163⑥) base 축소 — 기준시가는 raw, 엔진이 개산공제에서만 적용
      ownershipRatio: p.ownershipRatio,
      standardPriceAtTransfer: p.standardPriceAtTransfer,
      // ⑭ §164⑧ 동일조정기간 환산 — 누락 시 침묵 strip
      sameAdjustmentPeriod: p.sameAdjustmentPeriod,
      householdHousingCount: p.householdHousingCount,
      residencePeriodMonths: p.residencePeriodMonths,
      isRegulatedArea: p.isRegulatedArea,
      wasRegulatedAtAcquisition: p.wasRegulatedAtAcquisition,
      isUnregistered: p.isUnregistered,
      isNonBusinessLand: p.isNonBusinessLand,
      isSuccessorRightToMoveIn: p.isSuccessorRightToMoveIn,
      acquisitionCause: p.acquisitionCause,
      decedentAcquisitionDate: toOptionalDate(p.decedentAcquisitionDate),
      decedentSameHouseholdBeforeInheritance: p.decedentSameHouseholdBeforeInheritance,
      decedentCohabitationHoldingStartDate: toOptionalDate(p.decedentCohabitationHoldingStartDate),
      decedentCohabitationResidenceMonths: p.decedentCohabitationResidenceMonths,
      donorAcquisitionDate: toOptionalDate(p.donorAcquisitionDate),
      isOneHousehold: p.isOneHousehold,
      temporaryTwoHouse: p.temporaryTwoHouse
        ? {
            previousAcquisitionDate: toDate(p.temporaryTwoHouse.previousAcquisitionDate, "temporaryTwoHouse.previousAcquisitionDate"),
            newAcquisitionDate: toDate(p.temporaryTwoHouse.newAcquisitionDate, "temporaryTwoHouse.newAcquisitionDate"),
            // ⑭ §155⑯·⑱ — boolean·enum이라 Date 변환은 없지만 명시 전달하지 않으면 침묵 strip된다
            //    (단건 정본 `app/api/calc/transfer/engine-input.ts:102-107`).
            publicInstitutionRelocation: p.temporaryTwoHouse.publicInstitutionRelocation,
            relocatedSigunguCode: p.temporaryTwoHouse.relocatedSigunguCode,
            newHouseSigunguCode: p.temporaryTwoHouse.newHouseSigunguCode,
            disposalDelayReason: p.temporaryTwoHouse.disposalDelayReason,
          }
        : undefined,
      // ⑭ §155⑧ 수도권 밖 부득이 — resolvedDate는 string이라 Date 변환 필수(미제공 = 미해소).
      unavoidableOutsideCapitalHouse: p.unavoidableOutsideCapitalHouse
        ? {
            reason: p.unavoidableOutsideCapitalHouse.reason,
            resolvedDate: toOptionalDate(p.unavoidableOutsideCapitalHouse.resolvedDate),
          }
        : undefined,
      // ⑭ §155⑦ 농어촌주택 — acquisitionDate만 Date 변환 대상. 나머지는 boolean·number라 그대로 통과.
      ruralHouse: p.ruralHouse
        ? {
            ...p.ruralHouse,
            acquisitionDate: toOptionalDate(p.ruralHouse.acquisitionDate),
          }
        : undefined,
      // ⑭ §155④⑤ 합가 후 첫 양도 — 엔진 게이트가 `=== true`를 요구(transfer-tax-exemption.ts).
      isFirstTransferredInMerge: p.isFirstTransferredInMerge,
      // ⑭ §156의2⑤ 대체주택 비과세 특례 — string 일자 → Date 변환 (date-coerce)
      replacementHouse: p.replacementHouse
        ? {
            businessApprovalDate: toDate(p.replacementHouse.businessApprovalDate, "replacementHouse.businessApprovalDate"),
            completionDate: toDate(p.replacementHouse.completionDate, "replacementHouse.completionDate"),
            replacementResidenceMonths: p.replacementHouse.replacementResidenceMonths,
            willResideNewHouse: p.replacementHouse.willResideNewHouse,
          }
        : undefined,
      // 감면 매핑 — 단건 route와 공용 (rental §97 시리즈 Date 변환 포함, 2026-06-11)
      reductions: mapReductionsToEngine(p.reductions),
      // ⑭ NBL 정밀판정: 단건 route와 동일 공용 헬퍼 (raw 평면 → nested + Date)
      nonBusinessLandDetails: buildNblEngineInput(p.nonBusinessLandRaw),
      // ⑭ 다건도 단건과 동일 공용 헬퍼 — P2 특례(인구감소·부득이사유·장기임대 등) + ⑬ 소형신축/미분양 전 필드 도달 (선재 strip 갭 해소)
      houses: mapHousesToEngine(p.houses),
      sellingHouseId: p.sellingHouseId,
      // ⑭ 다주택 중과 한시 유예/경과조치 — 단건 route와 동일 공용 헬퍼(Date 변환). 자산별 gracePeriod.
      gracePeriod: mapGracePeriodToEngine(p.gracePeriod),
      marriageMerge: p.marriageMerge ? { marriageDate: toDate(p.marriageMerge.marriageDate, "marriageMerge.marriageDate") } : undefined,
      // ⑭ §154① 단서 — string 일자 → Date 변환 (date-coerce)
      oneHouseExemptionProviso: p.oneHouseExemptionProviso
        ? {
            reason: p.oneHouseExemptionProviso.reason,
            departureDate: toOptionalDate(p.oneHouseExemptionProviso.departureDate),
            expropriationDate: toOptionalDate(p.oneHouseExemptionProviso.expropriationDate),
            businessApprovalDate: toOptionalDate(p.oneHouseExemptionProviso.businessApprovalDate),
          }
        : undefined,
      parentalCareMerge: p.parentalCareMerge ? { mergeDate: toDate(p.parentalCareMerge.mergeDate, "parentalCareMerge.mergeDate") } : undefined,
      rentalReductionDetails: p.rentalReductionDetails
        ? {
            ...p.rentalReductionDetails,
            registrationDate: toDate(p.rentalReductionDetails.registrationDate, "rentalReductionDetails.registrationDate"),
            rentalStartDate: toDate(p.rentalReductionDetails.rentalStartDate, "rentalReductionDetails.rentalStartDate"),
            transferDate: toDate(p.rentalReductionDetails.transferDate, "rentalReductionDetails.transferDate"),
            vacancyPeriods: p.rentalReductionDetails.vacancyPeriods.map((v) => ({
              startDate: toDate(v.startDate, "vacancyPeriods.startDate"),
              endDate: toDate(v.endDate, "vacancyPeriods.endDate"),
            })),
            rentHistory: p.rentalReductionDetails.rentHistory.map((r) => ({
              contractDate: toDate(r.contractDate, "rentHistory.contractDate"),
              monthlyRent: r.monthlyRent,
              deposit: r.deposit,
              contractType: r.contractType,
            })),
          }
        : undefined,
      newHousingDetails: p.newHousingDetails
        ? {
            ...p.newHousingDetails,
            acquisitionDate: toDate(p.newHousingDetails.acquisitionDate, "newHousingDetails.acquisitionDate"),
            transferDate: toDate(p.newHousingDetails.transferDate, "newHousingDetails.transferDate"),
          }
        : undefined,
      acquisitionMethod: p.acquisitionMethod,
      appraisalValue: p.appraisalValue,
      // ⑭ 매매사례가액 추계(§176의2③1호) — 형제 모드 appraisalValue와 동일 층위.
      //    누락 시 salesCase 모드에서 엔진이 `similarSalesValue ?? acquisitionPrice`(=0)로 후퇴해
      //    취득가액이 통째로 0이 된다(⑬은 이미 전송, ⑫Zod도 수락 — 여기서만 침묵 strip됐다).
      similarSalesValue: p.similarSalesValue,
      isSelfBuilt: p.isSelfBuilt,
      buildingType: p.buildingType,
      constructionDate: toOptionalDate(p.constructionDate),
      extensionFloorArea: p.extensionFloorArea,
      pre1990Land: p.pre1990Land
        ? {
            acquisitionDate: toDate(p.pre1990Land.acquisitionDate, "pre1990Land.acquisitionDate"),
            transferDate: toDate(p.pre1990Land.transferDate, "pre1990Land.transferDate"),
            areaSqm: p.pre1990Land.areaSqm,
            pricePerSqm_1990: p.pre1990Land.pricePerSqm_1990,
            pricePerSqm_atTransfer: p.pre1990Land.pricePerSqm_atTransfer,
            grade_1990_0830: p.pre1990Land.grade_1990_0830,
            gradePrev_1990_0830: p.pre1990Land.gradePrev_1990_0830,
            gradeAtAcquisition: p.pre1990Land.gradeAtAcquisition,
            forceRatioCap: p.pre1990Land.forceRatioCap,
          }
        : undefined,
      parcels: p.parcels?.map((parcel) => ({
        ...parcel,
        acquisitionDate: toDate(parcel.acquisitionDate, "parcels.acquisitionDate"),
        replottingConfirmDate: toOptionalDate(parcel.replottingConfirmDate),
      })),
      // 자산별 가산세 — 단건 엔진이 자산별 결정세액 기준으로 계산.
      filingPenaltyDetails: p.filingPenaltyDetails,
      delayedPaymentDetails: p.delayedPaymentDetails
        ? {
            unpaidTax: p.delayedPaymentDetails.unpaidTax,
            paymentDeadline: toDate(p.delayedPaymentDetails.paymentDeadline, "delayedPaymentDetails.paymentDeadline"),
            actualPaymentDate: toOptionalDate(p.delayedPaymentDetails.actualPaymentDate),
          }
        : undefined,
      // ⑭ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — Date 변환 (단건 route 패턴 동일)
      rentalHousingException: p.rentalHousingException
        ? {
            applyException: p.rentalHousingException.applyException,
            scenario: p.rentalHousingException.scenario,
            rentalUnits: p.rentalHousingException.rentalUnits.map((u) => ({
              businessRegistrationDate: toDate(u.businessRegistrationDate, "rentalUnits.businessRegistrationDate"),
              rentalRegistrationDate: toDate(u.rentalRegistrationDate, "rentalUnits.rentalRegistrationDate"),
              rentalCategory: u.rentalCategory,
              rentalAcquisitionType: u.rentalAcquisitionType,
              isApartment: u.isApartment,
              region: u.region,
              isExcluded918Rule: u.isExcluded918Rule,
              hasContractDepositProof: u.hasContractDepositProof,
              isExcludedShortToLongChange: u.isExcludedShortToLongChange,
              standardPriceAtRentalStart: u.standardPriceAtRentalStart,
              acquisitionOfficialPrice: u.acquisitionOfficialPrice,
              isNationalSizeHousing: u.isNationalSizeHousing,
              landAreaM2: u.landAreaM2,
              totalFloorAreaM2: u.totalFloorAreaM2,
              hasMinimum2Units: u.hasMinimum2Units,
              hasMinimum5UnitsInCity: u.hasMinimum5UnitsInCity,
              firstSaleContractDate: toOptionalDate(u.firstSaleContractDate),
              rentalMonths: u.rentalMonths,
              rentalAutoTermination: u.rentalAutoTermination,
              requirementsConfirmed: u.requirementsConfirmed,
            })),
            priorResidenceTransferDate: toOptionalDate(p.rentalHousingException.priorResidenceTransferDate),
            standardPriceAtAcquisition: p.rentalHousingException.standardPriceAtAcquisitionForPhrp,
            standardPriceAtPriorTransfer: p.rentalHousingException.standardPriceAtPriorTransfer,
            standardPriceAtTransfer: p.rentalHousingException.standardPriceAtTransferForPhrp,
          }
        : undefined,
    };

    return {
      ...base,
      propertyId: p.propertyId,
      propertyLabel: p.propertyLabel,
    };
  });

  // 엔진 입력 구성 (가산세 제외 1차)
  const engineInput: AggregateTransferInput = {
    taxYear: data.taxYear,
    properties,
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    basicDeductionAllocation: data.basicDeductionAllocation,
    // 확정신고 기납부세액 정산 (§111③) — filing-level. finalInput 스프레드로 2-pass 모두 반영.
    priorPaidTax: data.priorPaidTax,
    priorPaidLocalTax: data.priorPaidLocalTax,
    // ⑭ §133 5년 누적 한도 — aggregate M-8(applyFiveYearLimits)에서 소비.
    // optional 필드라 TypeScript가 누락을 감지하지 못함 — 누락 시 5년 capping 상시 비활성.
    priorReductionUsage: data.priorReductionUsage ?? [],
    // [B5] 신고서 단위 수정신고·경정청구 — 단건 route(:308~)와 동형 Date 변환.
    // amendment ⊥ 자산별 가산세라 2-pass에서 무해(§7.4). finalInput 스프레드로 2차 pass에 반영.
    amendment: data.amendment
      ? {
          originalDeterminedTax: data.amendment.originalDeterminedTax,
          applyUnderReportingPenalty: data.amendment.applyUnderReportingPenalty,
          underReportingReason: data.amendment.underReportingReason,
          underReductionMode: data.amendment.underReductionMode,
          statutoryFilingDeadline: toOptionalDate(data.amendment.statutoryFilingDeadline),
          amendedFilingDate: toOptionalDate(data.amendment.amendedFilingDate),
          priorAssessmentNotified: data.amendment.priorAssessmentNotified,
          applyLatePaymentPenalty: data.amendment.applyLatePaymentPenalty,
          amendedPaymentDate: toOptionalDate(data.amendment.amendedPaymentDate),
          correctionKind: data.amendment.correctionKind,
          claimReasonType: data.amendment.claimReasonType,
          posteriorEventDate: toOptionalDate(data.amendment.posteriorEventDate),
        }
      : undefined,
  };

  try {
    // 자산별 가산세 2-pass — 자산별 단건 엔진 호출 시 결정세액을 사전 계산해 주입.
    // 1차: 가산세 미주입 상태로 자산별 결정세액 산출.
    const baseResult = calculateTransferTaxAggregate(engineInput, rates);

    /**
     * 🔴 가산세 base는 **예정신고 세액**이다 — 집계 1차 pass의 자산별 standalone 값이 아니다(F03).
     *
     * 종전에는 `baseResult.properties[idx].determinedTax`를 그대로 넣었는데, 그 값은
     * `skipBasicDeduction: true`로 계산된다(집계가 §103 기본공제를 신고 단위로 따로 배분한다).
     * 그래서 **기본공제가 빠진 세액**이 base가 됐다 — 실측 200,000(0.85%) 과대.
     *
     * 「국세기본법」 §47의2①의 base는 「그 신고로 납부하여야 할 세액」이고 괄호가 **예정신고를
     * 포함**한다. 그 세액은 「소득세법」 §107①이 정한 (양도차익 − 장특 − **기본공제**) × 세율이다.
     * 기본공제 배분 순서는 §103②이 「먼저 양도한 자산부터 순서대로」로 **명문화**했다.
     */
    const preliminary = computePreliminaryFilingTaxes(
      engineInput.properties as unknown as TransferTaxInput[],
      rates,
      engineInput.annualBasicDeductionUsed,
      calculateTransferTax,
    );

    // 자산별 결정세액·미납세액 주입 후 2차 계산 (가산세 자산별 합산 반영).
    const enrichedProperties = engineInput.properties.map((p, idx) => {
      const pre = preliminary.get(idx);
      const breakdown = baseResult.properties[idx];
      const determinedTax = pre?.determinedTax ?? breakdown?.determinedTax ?? 0;
      const reductionAmount = pre?.reductionAmount ?? breakdown?.reductionAmount ?? 0;
      const enriched: TransferTaxItemInput = { ...p };
      if (p.filingPenaltyDetails) {
        enriched.filingPenaltyDetails = {
          ...p.filingPenaltyDetails,
          determinedTax,
          reductionAmount,
        };
      }
      if (p.delayedPaymentDetails) {
        enriched.delayedPaymentDetails = {
          ...p.delayedPaymentDetails,
          unpaidTax:
            p.delayedPaymentDetails.unpaidTax === 0
              ? determinedTax
              : p.delayedPaymentDetails.unpaidTax,
        };
      }
      return enriched;
    });

    const finalInput: AggregateTransferInput = { ...engineInput, properties: enrichedProperties };
    const result = calculateTransferTaxAggregate(finalInput, rates);
    return NextResponse.json({ data: result }, { status: 200 });
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message: "계산 중 오류가 발생했습니다" } },
      { status: 500 },
    );
  }
}
