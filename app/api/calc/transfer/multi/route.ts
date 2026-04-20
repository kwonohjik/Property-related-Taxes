/**
 * 양도소득세 다건 동시 양도 계산 API Route
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
import { preloadTaxRates } from "@/lib/db/tax-rates";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { multiInputSchema } from "@/lib/api/transfer-tax-schema";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

export async function POST(request: NextRequest) {
  // Rate Limiting — 분당 15회 (단건 30회의 절반)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer-multi:${ip}`, { limit: 15, windowMs: 60_000 });
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

  // 세율 로드 — 과세기간 말일(12/31) 기준 1회
  const rateDate = new Date(data.taxYear, 11, 31);
  let rates;
  try {
    rates = await preloadTaxRates(["transfer"], rateDate);
  } catch (err) {
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: { code: "TAX_RATE_NOT_FOUND", message: "세율 데이터를 로드할 수 없습니다" } },
      { status: 500 },
    );
  }

  // string → Date 변환 (건별)
  const properties: TransferTaxItemInput[] = data.properties.map((p) => {
    const base: Omit<TransferTaxInput, "annualBasicDeductionUsed" | "filingPenaltyDetails" | "delayedPaymentDetails" | "skipBasicDeduction" | "skipLossFloor"> = {
      propertyType: p.propertyType,
      transferPrice: p.transferPrice,
      transferDate: new Date(p.transferDate),
      acquisitionPrice: p.acquisitionPrice,
      acquisitionDate: new Date(p.acquisitionDate),
      expenses: p.expenses,
      useEstimatedAcquisition: p.useEstimatedAcquisition,
      standardPriceAtAcquisition: p.standardPriceAtAcquisition,
      standardPriceAtTransfer: p.standardPriceAtTransfer,
      householdHousingCount: p.householdHousingCount,
      residencePeriodMonths: p.residencePeriodMonths,
      isRegulatedArea: p.isRegulatedArea,
      wasRegulatedAtAcquisition: p.wasRegulatedAtAcquisition,
      isUnregistered: p.isUnregistered,
      isNonBusinessLand: p.isNonBusinessLand,
      isSuccessorRightToMoveIn: p.isSuccessorRightToMoveIn,
      acquisitionCause: p.acquisitionCause,
      decedentAcquisitionDate: p.decedentAcquisitionDate ? new Date(p.decedentAcquisitionDate) : undefined,
      donorAcquisitionDate: p.donorAcquisitionDate ? new Date(p.donorAcquisitionDate) : undefined,
      isOneHousehold: p.isOneHousehold,
      temporaryTwoHouse: p.temporaryTwoHouse
        ? {
            previousAcquisitionDate: new Date(p.temporaryTwoHouse.previousAcquisitionDate),
            newAcquisitionDate: new Date(p.temporaryTwoHouse.newAcquisitionDate),
          }
        : undefined,
      reductions: p.reductions.map((r) =>
        r.type === "public_expropriation"
          ? { ...r, businessApprovalDate: new Date(r.businessApprovalDate) }
          : r,
      ),
      nonBusinessLandDetails: p.nonBusinessLandDetails
        ? {
            ...p.nonBusinessLandDetails,
            acquisitionDate: new Date(p.nonBusinessLandDetails.acquisitionDate),
            transferDate: new Date(p.nonBusinessLandDetails.transferDate),
            businessUsePeriods: p.nonBusinessLandDetails.businessUsePeriods.map((bp) => ({
              startDate: new Date(bp.startDate),
              endDate: new Date(bp.endDate),
              usageType: bp.usageType,
            })),
            gracePeriods: p.nonBusinessLandDetails.gracePeriods.map((g) => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              type: g.type as any,
              startDate: new Date(g.startDate),
              endDate: new Date(g.endDate),
            })),
          }
        : undefined,
      houses: p.houses
        ? p.houses.map((h) => ({
            id: h.id,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            region: h.region as any,
            acquisitionDate: new Date(h.acquisitionDate),
            officialPrice: h.officialPrice,
            isInherited: h.isInherited,
            isLongTermRental: h.isLongTermRental,
            isApartment: h.isApartment,
            isOfficetel: h.isOfficetel,
            isUnsoldHousing: h.isUnsoldHousing,
          }))
        : undefined,
      sellingHouseId: p.sellingHouseId,
      marriageMerge: p.marriageMerge ? { marriageDate: new Date(p.marriageMerge.marriageDate) } : undefined,
      parentalCareMerge: p.parentalCareMerge ? { mergeDate: new Date(p.parentalCareMerge.mergeDate) } : undefined,
      rentalReductionDetails: p.rentalReductionDetails
        ? {
            ...p.rentalReductionDetails,
            registrationDate: new Date(p.rentalReductionDetails.registrationDate),
            rentalStartDate: new Date(p.rentalReductionDetails.rentalStartDate),
            transferDate: new Date(p.rentalReductionDetails.transferDate),
            vacancyPeriods: p.rentalReductionDetails.vacancyPeriods.map((v) => ({
              startDate: new Date(v.startDate),
              endDate: new Date(v.endDate),
            })),
            rentHistory: p.rentalReductionDetails.rentHistory.map((r) => ({
              contractDate: new Date(r.contractDate),
              monthlyRent: r.monthlyRent,
              deposit: r.deposit,
              contractType: r.contractType,
            })),
          }
        : undefined,
      newHousingDetails: p.newHousingDetails
        ? {
            ...p.newHousingDetails,
            acquisitionDate: new Date(p.newHousingDetails.acquisitionDate),
            transferDate: new Date(p.newHousingDetails.transferDate),
          }
        : undefined,
      acquisitionMethod: p.acquisitionMethod,
      appraisalValue: p.appraisalValue,
      isSelfBuilt: p.isSelfBuilt,
      buildingType: p.buildingType,
      constructionDate: p.constructionDate ? new Date(p.constructionDate) : undefined,
      extensionFloorArea: p.extensionFloorArea,
      pre1990Land: p.pre1990Land
        ? {
            acquisitionDate: new Date(p.pre1990Land.acquisitionDate),
            transferDate: new Date(p.pre1990Land.transferDate),
            areaSqm: p.pre1990Land.areaSqm,
            pricePerSqm_1990: p.pre1990Land.pricePerSqm_1990,
            pricePerSqm_atTransfer: p.pre1990Land.pricePerSqm_atTransfer,
            grade_1990_0830: p.pre1990Land.grade_1990_0830,
            gradePrev_1990_0830: p.pre1990Land.gradePrev_1990_0830,
            gradeAtAcquisition: p.pre1990Land.gradeAtAcquisition,
            forceRatioCap: p.pre1990Land.forceRatioCap,
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
  };

  try {
    // 가산세 2-pass
    if (data.filingPenaltyDetails || data.delayedPaymentDetails) {
      const baseResult = calculateTransferTaxAggregate(engineInput, rates);

      if (data.filingPenaltyDetails) {
        engineInput.filingPenaltyDetails = {
          ...data.filingPenaltyDetails,
          determinedTax: baseResult.determinedTax,
          reductionAmount: baseResult.reductionAmount,
        };
      }
      if (data.delayedPaymentDetails) {
        engineInput.delayedPaymentDetails = {
          unpaidTax: data.delayedPaymentDetails.unpaidTax === 0
            ? baseResult.determinedTax
            : data.delayedPaymentDetails.unpaidTax,
          paymentDeadline: new Date(data.delayedPaymentDetails.paymentDeadline),
          actualPaymentDate: data.delayedPaymentDetails.actualPaymentDate
            ? new Date(data.delayedPaymentDetails.actualPaymentDate)
            : undefined,
        };
      }
    }

    const result = calculateTransferTaxAggregate(engineInput, rates);
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
