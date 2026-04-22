/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  apportionBundledSale,
  type BundledAssetInput,
} from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import { propertySchema as inputSchema } from "@/lib/api/transfer-tax-schema";

// ============================================================
// POST handler (⑫-2, ⑫-3)
// ============================================================

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 분당 30회 (C6)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer:${ip}`, { limit: 30, windowMs: 60_000 });
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

  // 단계 1: JSON 파싱
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "요청 본문을 파싱할 수 없습니다" } },
      { status: 400 },
    );
  }

  // 단계 2: Zod 검증
  const parsed = inputSchema.safeParse(body);
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

  // 단계 3: string → Date 변환
  const data = parsed.data;
  const transferDate = new Date(data.transferDate);
  const acquisitionDate = new Date(data.acquisitionDate);

  const engineInput: TransferTaxInput = {
    propertyType: data.propertyType,
    transferPrice: data.transferPrice,
    transferDate,
    acquisitionPrice: data.acquisitionPrice,
    acquisitionDate,
    expenses: data.expenses,
    useEstimatedAcquisition: data.useEstimatedAcquisition,
    standardPriceAtAcquisition: data.standardPriceAtAcquisition,
    standardPriceAtTransfer: data.standardPriceAtTransfer,
    householdHousingCount: data.householdHousingCount,
    residencePeriodMonths: data.residencePeriodMonths,
    isRegulatedArea: data.isRegulatedArea,
    wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
    isUnregistered: data.isUnregistered,
    isNonBusinessLand: data.isNonBusinessLand,
    isSuccessorRightToMoveIn: data.isSuccessorRightToMoveIn,
    acquisitionCause: data.acquisitionCause,
    decedentAcquisitionDate: data.decedentAcquisitionDate
      ? new Date(data.decedentAcquisitionDate)
      : undefined,
    donorAcquisitionDate: data.donorAcquisitionDate
      ? new Date(data.donorAcquisitionDate)
      : undefined,
    isOneHousehold: data.isOneHousehold,
    temporaryTwoHouse: data.temporaryTwoHouse
      ? {
          previousAcquisitionDate: new Date(data.temporaryTwoHouse.previousAcquisitionDate),
          newAcquisitionDate: new Date(data.temporaryTwoHouse.newAcquisitionDate),
        }
      : undefined,
    reductions: data.reductions.map((r) =>
      r.type === "public_expropriation"
        ? { ...r, businessApprovalDate: new Date(r.businessApprovalDate) }
        : r,
    ),
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    nonBusinessLandDetails: data.nonBusinessLandDetails
      ? {
          ...data.nonBusinessLandDetails,
          landType: data.nonBusinessLandDetails.landType,
          zoneType: data.nonBusinessLandDetails.zoneType,
          acquisitionDate: new Date(data.nonBusinessLandDetails.acquisitionDate),
          transferDate: new Date(data.nonBusinessLandDetails.transferDate),
          businessUsePeriods: data.nonBusinessLandDetails.businessUsePeriods.map((p) => ({
            startDate: new Date(p.startDate),
            endDate: new Date(p.endDate),
            usageType: p.usageType,
          })),
          gracePeriods: data.nonBusinessLandDetails.gracePeriods.map((g) => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            type: g.type as any,
            startDate: new Date(g.startDate),
            endDate: new Date(g.endDate),
          })),
        }
      : undefined,
    houses: data.houses
      ? data.houses.map((h) => ({
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
    sellingHouseId: data.sellingHouseId,
    marriageMerge: data.marriageMerge
      ? { marriageDate: new Date(data.marriageMerge.marriageDate) }
      : undefined,
    parentalCareMerge: data.parentalCareMerge
      ? { mergeDate: new Date(data.parentalCareMerge.mergeDate) }
      : undefined,
    // [C7 수정] 장기임대 감면 정밀 입력
    rentalReductionDetails: data.rentalReductionDetails
      ? {
          ...data.rentalReductionDetails,
          registrationDate: new Date(data.rentalReductionDetails.registrationDate),
          rentalStartDate: new Date(data.rentalReductionDetails.rentalStartDate),
          transferDate: new Date(data.rentalReductionDetails.transferDate),
          vacancyPeriods: data.rentalReductionDetails.vacancyPeriods.map((v) => ({
            startDate: new Date(v.startDate),
            endDate: new Date(v.endDate),
          })),
          rentHistory: data.rentalReductionDetails.rentHistory.map((r) => ({
            contractDate: new Date(r.contractDate),
            monthlyRent: r.monthlyRent,
            deposit: r.deposit,
            contractType: r.contractType,
          })),
        }
      : undefined,
    // [C7 수정] 신축/미분양 감면 정밀 입력
    newHousingDetails: data.newHousingDetails
      ? {
          ...data.newHousingDetails,
          acquisitionDate: new Date(data.newHousingDetails.acquisitionDate),
          transferDate: new Date(data.newHousingDetails.transferDate),
        }
      : undefined,
    // §114조의2 가산세 판정 필드
    acquisitionMethod: data.acquisitionMethod,
    appraisalValue: data.appraisalValue,
    isSelfBuilt: data.isSelfBuilt,
    buildingType: data.buildingType,
    constructionDate: data.constructionDate ? new Date(data.constructionDate) : undefined,
    extensionFloorArea: data.extensionFloorArea,
    // 1990.8.30. 이전 취득 토지 기준시가 환산 (선택)
    pre1990Land: data.pre1990Land
      ? {
          acquisitionDate: new Date(data.pre1990Land.acquisitionDate),
          transferDate: new Date(data.pre1990Land.transferDate),
          areaSqm: data.pre1990Land.areaSqm,
          pricePerSqm_1990: data.pre1990Land.pricePerSqm_1990,
          pricePerSqm_atTransfer: data.pre1990Land.pricePerSqm_atTransfer,
          grade_1990_0830: data.pre1990Land.grade_1990_0830,
          gradePrev_1990_0830: data.pre1990Land.gradePrev_1990_0830,
          gradeAtAcquisition: data.pre1990Land.gradeAtAcquisition,
          forceRatioCap: data.pre1990Land.forceRatioCap,
        }
      : undefined,
    // 다필지 분리 계산 (환지·합병 등) — 문자열 날짜 → Date 변환
    parcels: data.parcels?.map((p) => ({
      ...p,
      acquisitionDate: new Date(p.acquisitionDate),
      replottingConfirmDate: p.replottingConfirmDate ? new Date(p.replottingConfirmDate) : undefined,
    })),
    // 신고불성실·지연납부 가산세 (선택)
    filingPenaltyDetails: data.filingPenaltyDetails
      ? { ...data.filingPenaltyDetails }
      : undefined,
    delayedPaymentDetails: data.delayedPaymentDetails
      ? {
          unpaidTax: data.delayedPaymentDetails.unpaidTax,
          paymentDeadline: new Date(data.delayedPaymentDetails.paymentDeadline),
          actualPaymentDate: data.delayedPaymentDetails.actualPaymentDate
            ? new Date(data.delayedPaymentDetails.actualPaymentDate)
            : undefined,
        }
      : undefined,
  };

  // 단계 4: 세율 로드
  let rates;
  try {
    rates = await preloadTaxRates(["transfer"], transferDate);
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

  // 단계 5: 계산 실행
  try {
    // ─── 5-a. 일괄양도 분기 (소득세법 시행령 §166 ⑥) ─────────────
    // companionAssets 존재 시 안분 → 자산별 상속 취득가액 → 다건 엔진
    const companions = data.companionAssets ?? [];
    if (
      companions.length > 0 &&
      data.totalSalePrice !== undefined &&
      data.standardPriceAtTransferForApportion !== undefined
    ) {
      // (1) 주 자산 상속 보충적평가액 산정 (선택)
      let primaryFixedAcq: number | undefined;
      if (data.primaryInheritanceValuation) {
        const v = data.primaryInheritanceValuation;
        const r = calculateInheritanceAcquisitionPrice({
          inheritanceDate: new Date(v.inheritanceDate),
          assetKind: v.assetKind,
          landAreaM2: v.landAreaM2,
          publishedValueAtInheritance: v.publishedValueAtInheritance,
          marketValue: v.marketValue,
          appraisalAverage: v.appraisalAverage,
        });
        primaryFixedAcq = r.acquisitionPrice;
      }

      // (2) 컴패니언 자산별 상속 보충적평가액 산정
      const companionFixedAcq: (number | undefined)[] = companions.map((c) => {
        if (!c.inheritanceValuation) return c.fixedAcquisitionPrice;
        const v = c.inheritanceValuation;
        return calculateInheritanceAcquisitionPrice({
          inheritanceDate: new Date(v.inheritanceDate),
          assetKind: v.assetKind,
          landAreaM2: v.landAreaM2,
          publishedValueAtInheritance: v.publishedValueAtInheritance,
          marketValue: v.marketValue,
          appraisalAverage: v.appraisalAverage,
        }).acquisitionPrice;
      });

      // (3) BundledAssetInput 배열 구성
      const bundleAssets: BundledAssetInput[] = [
        {
          assetId: "primary",
          assetLabel:
            data.propertyType === "housing"
              ? "주 자산(주택)"
              : data.propertyType === "land"
                ? "주 자산(토지)"
                : "주 자산",
          assetKind:
            data.propertyType === "housing"
              ? "housing"
              : data.propertyType === "building"
                ? "building"
                : "land",
          standardPriceAtTransfer: data.standardPriceAtTransferForApportion,
          directExpenses: data.expenses,
          fixedAcquisitionPrice:
            primaryFixedAcq ??
            (data.acquisitionPrice > 0 ? data.acquisitionPrice : undefined),
        },
        ...companions.map(
          (c, i): BundledAssetInput => ({
            assetId: c.assetId,
            assetLabel: c.assetLabel,
            assetKind: c.assetKind,
            standardPriceAtTransfer: c.standardPriceAtTransfer,
            standardPriceAtAcquisition: c.standardPriceAtAcquisition,
            directExpenses: c.directExpenses,
            fixedAcquisitionPrice: companionFixedAcq[i],
          }),
        ),
      ];

      // (4) 안분 실행
      const apportionment = apportionBundledSale({
        totalSalePrice: data.totalSalePrice,
        assets: bundleAssets,
      });

      // (5) TransferTaxItemInput[] 조립 — 주 자산은 engineInput 파생, 컴패니언은 기본값 + override
      const items: TransferTaxItemInput[] = apportionment.apportioned.map((a, idx) => {
        if (a.assetId === "primary") {
          // 주 자산: engineInput을 복제 + 안분 결과로 양도·취득·필요경비 덮어쓰기
          return {
            ...engineInput,
            transferPrice: a.allocatedSalePrice,
            acquisitionPrice: a.allocatedAcquisitionPrice,
            expenses: a.allocatedExpenses,
            propertyId: "primary",
            propertyLabel: a.assetLabel,
          } satisfies TransferTaxItemInput;
        }
        // 컴패니언 자산: propertyType·기본 플래그는 companion에서, 공통은 주 자산에서 상속
        const c = companions[idx - 1]; // primary가 첫 번째
        const companionEngine: TransferTaxItemInput = {
          propertyType:
            c.assetKind === "housing"
              ? "housing"
              : c.assetKind === "building"
                ? "building"
                : "land",
          transferPrice: a.allocatedSalePrice,
          transferDate,
          acquisitionPrice: a.allocatedAcquisitionPrice,
          acquisitionDate,
          expenses: a.allocatedExpenses,
          useEstimatedAcquisition: false,
          householdHousingCount: engineInput.householdHousingCount,
          residencePeriodMonths: c.residencePeriodMonths ?? 0,
          isRegulatedArea: engineInput.isRegulatedArea,
          wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
          isUnregistered: c.isUnregistered ?? false,
          isNonBusinessLand: c.isNonBusinessLand ?? false,
          isOneHousehold: c.isOneHousehold ?? false,
          acquisitionCause: engineInput.acquisitionCause,
          decedentAcquisitionDate: engineInput.decedentAcquisitionDate,
          donorAcquisitionDate: engineInput.donorAcquisitionDate,
          reductions: c.reductions.map((r) =>
            r.type === "public_expropriation"
              ? { ...r, businessApprovalDate: new Date(r.businessApprovalDate) }
              : r,
          ),
          propertyId: c.assetId,
          propertyLabel: c.assetLabel,
        };
        return companionEngine;
      });

      // (6) 다건 엔진 호출
      const aggregated = calculateTransferTaxAggregate(
        {
          taxYear: transferDate.getFullYear(),
          properties: items,
          annualBasicDeductionUsed: data.annualBasicDeductionUsed,
        },
        rates,
      );

      return NextResponse.json(
        {
          data: {
            mode: "bundled" as const,
            apportionment,
            aggregated,
          },
        },
        { status: 200 },
      );
    }

    // ─── 5-b. 기존 단건 경로 ───────────────────────────────────
    // 신고불성실가산세의 determinedTax + 지연납부의 unpaidTax는 실제 결정세액으로 주입 필요
    // → 먼저 가산세 없이 계산하여 결정세액 확보 후, 가산세 디테일에 주입
    if (engineInput.filingPenaltyDetails || engineInput.delayedPaymentDetails) {
      const baseResult = calculateTransferTax(
        { ...engineInput, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined },
        rates,
      );
      if (engineInput.filingPenaltyDetails) {
        engineInput.filingPenaltyDetails.determinedTax = baseResult.determinedTax;
        engineInput.filingPenaltyDetails.reductionAmount = baseResult.reductionAmount;
      }
      // unpaidTax === 0이면 결정세액 전액 미납으로 가정 (자동 가산세 적용 흐름)
      if (engineInput.delayedPaymentDetails && engineInput.delayedPaymentDetails.unpaidTax === 0) {
        engineInput.delayedPaymentDetails.unpaidTax = baseResult.determinedTax;
      }
    }
    const result = calculateTransferTax(engineInput, rates);
    return NextResponse.json({ data: { mode: "single" as const, result } }, { status: 200 });
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
