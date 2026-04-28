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
import type { TransferReduction } from "@/lib/tax-engine/types/transfer.types";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  apportionBundledSale,
  type BundledAssetInput,
} from "@/lib/tax-engine/bundled-sale-apportionment";
import { calculateInheritanceAcquisitionPrice } from "@/lib/tax-engine/inheritance-acquisition-price";
import { calculateEstimatedAcquisitionPrice } from "@/lib/tax-engine/tax-utils";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { checkRateLimit, getClientIp } from "@/lib/api/rate-limit";
import {
  propertySchema as inputSchema,
} from "@/lib/api/transfer-tax-schema";
import type { inheritedAcquisitionSchema } from "@/lib/api/transfer-tax-schema-sub";
import type { z } from "zod";
import type { InheritanceAcquisitionInput } from "@/lib/tax-engine/types/inheritance-acquisition.types";

// ─── 상속 취득가액 의제: zod 입력 → 엔진 입력 변환 ──────────────

function buildInheritedAcquisition(
  ia: z.infer<typeof inheritedAcquisitionSchema>,
  transferDate: Date,
  transferPrice: number,
): InheritanceAcquisitionInput {
  const inheritanceDate = new Date(ia.inheritanceStartDate);
  const { assetKind } = ia;

  if (ia.mode === "pre-deemed") {
    return {
      inheritanceDate,
      assetKind,
      standardPriceAtDeemedDate: ia.standardPriceAtDeemedDate,
      standardPriceAtTransfer: ia.standardPriceAtTransfer,
      transferDate,
      transferPrice,
      decedentAcquisitionDate:
        ia.hasDecedentActualPrice && ia.decedentAcquisitionDate
          ? new Date(ia.decedentAcquisitionDate)
          : undefined,
      decedentActualPrice:
        ia.hasDecedentActualPrice ? ia.decedentActualPrice : undefined,
    };
  }

  // post-deemed
  return {
    inheritanceDate,
    assetKind,
    reportedValue: ia.reportedValue,
    reportedMethod: ia.reportedMethod,
    ...(ia.useSupplementaryHelper && {
      landAreaM2: ia.landAreaM2,
      publishedValueAtInheritance: ia.publishedValueAtInheritance,
    }),
  };
}

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
    reductions: data.reductions.map((r): TransferReduction => {
      if (r.type === "public_expropriation") {
        return { ...r, businessApprovalDate: new Date(r.businessApprovalDate) };
      }
      if (r.type === "self_farming") {
        return {
          ...r,
          incorporationDate: r.incorporationDate ? new Date(r.incorporationDate) : undefined,
        };
      }
      return r;
    }),
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    priorReductionUsage: data.priorReductionUsage ?? [],
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
    // 토지/건물 취득일 분리 (선택)
    landAcquisitionDate: data.landAcquisitionDate ? new Date(data.landAcquisitionDate) : undefined,
    landSplitMode: data.landSplitMode,
    landTransferPrice: data.landTransferPrice,
    buildingTransferPrice: data.buildingTransferPrice,
    landAcquisitionPrice: data.landAcquisitionPrice,
    buildingAcquisitionPrice: data.buildingAcquisitionPrice,
    landDirectExpenses: data.landDirectExpenses,
    buildingDirectExpenses: data.buildingDirectExpenses,
    landStandardPriceAtTransfer: data.landStandardPriceAtTransfer,
    buildingStandardPriceAtTransfer: data.buildingStandardPriceAtTransfer,
    standardPricePerSqmAtAcquisition: data.standardPricePerSqmAtAcquisition,
    acquisitionArea: data.acquisitionArea,
    selfOwns: data.selfOwns,
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
    // 개별주택가격 미공시 취득 환산 (§164⑤) — 문자열 날짜 → Date 변환
    preHousingDisclosure: data.preHousingDisclosure
      ? {
          ...data.preHousingDisclosure,
          firstDisclosureDate: new Date(data.preHousingDisclosure.firstDisclosureDate),
        }
      : undefined,
    // 상속 부동산 취득가액 의제 (소령 §176조의2④·§163⑨)
    inheritedAcquisition: data.inheritedAcquisition
      ? buildInheritedAcquisition(data.inheritedAcquisition, transferDate, data.transferPrice)
      : undefined,
    // 상속 주택 환산취득가 보조 입력 (§164⑤·§176조의2④) — Date 변환
    inheritedHouseValuation: data.inheritedHouseValuation
      ? {
          ...data.inheritedHouseValuation,
          inheritanceDate: new Date(data.inheritedHouseValuation.inheritanceDate),
          transferDate: new Date(data.inheritedHouseValuation.transferDate),
          firstDisclosureDate: data.inheritedHouseValuation.firstDisclosureDate
            ? new Date(data.inheritedHouseValuation.firstDisclosureDate)
            : undefined,
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
    //
    // 양도가액 결정 모드 (data.bundledSaleMode, 계약서 단위 단일 결정):
    //   - "actual":      §166⑥ 본문. 계약서에 구분 기재된 fixedSalePrice 사용.
    //   - "apportioned": §166⑥ 단서. standardPriceAtTransferForApportion 비율 안분.
    const companions = data.companionAssets ?? [];
    const isActualMode = data.bundledSaleMode === "actual";
    const bundledOk =
      companions.length > 0 &&
      data.totalSalePrice !== undefined &&
      (isActualMode
        ? data.primaryActualSalePrice !== undefined
        : data.standardPriceAtTransferForApportion !== undefined);

    if (bundledOk) {
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

      // (2) 컴패니언 자산별 취득가액 (acquisitionCause 분기)
      //   - inheritance + inheritanceValuation → 보충적평가
      //   - inheritance manual / gift / purchase(actual) → fixedAcquisitionPrice 그대로
      //   - purchase(estimated) → undefined (안분 후 사후 환산, 5단계에서 처리)
      const companionFixedAcq: (number | undefined)[] = companions.map((c) => {
        if (c.acquisitionCause === "purchase" && c.useEstimatedAcquisition) {
          return undefined;
        }
        if (c.acquisitionCause === "inheritance" && c.inheritanceValuation) {
          const v = c.inheritanceValuation;
          return calculateInheritanceAcquisitionPrice({
            inheritanceDate: new Date(v.inheritanceDate),
            assetKind: v.assetKind,
            landAreaM2: v.landAreaM2,
            publishedValueAtInheritance: v.publishedValueAtInheritance,
            marketValue: v.marketValue,
            appraisalAverage: v.appraisalAverage,
          }).acquisitionPrice;
        }
        return c.fixedAcquisitionPrice;
      });

      // (3) BundledAssetInput 배열 구성
      const primaryAssetKind: BundledAssetInput["assetKind"] =
        data.propertyType === "housing"
          ? "housing"
          : data.propertyType === "building"
            ? "building"
            : "land";
      const primaryLabel =
        data.propertyType === "housing"
          ? "주 자산(주택)"
          : data.propertyType === "land"
            ? "주 자산(토지)"
            : "주 자산";

      const bundleAssets: BundledAssetInput[] = [
        {
          assetId: "primary",
          assetLabel: primaryLabel,
          assetKind: primaryAssetKind,
          standardPriceAtTransfer: data.standardPriceAtTransferForApportion ?? 0,
          directExpenses: data.expenses,
          fixedAcquisitionPrice:
            primaryFixedAcq ??
            (data.acquisitionPrice > 0 ? data.acquisitionPrice : undefined),
          // actual 모드: 주 자산의 계약서상 양도가액 주입
          fixedSalePrice: isActualMode ? data.primaryActualSalePrice : undefined,
        },
        ...companions.map(
          (c, i): BundledAssetInput => ({
            assetId: c.assetId,
            assetLabel: c.assetLabel,
            assetKind: c.assetKind,
            standardPriceAtTransfer: c.standardPriceAtTransfer ?? 0,
            standardPriceAtAcquisition: c.standardPriceAtAcquisition,
            directExpenses: c.directExpenses,
            fixedAcquisitionPrice: companionFixedAcq[i],
            // actual 모드: 컴패니언의 계약서상 양도가액 주입
            fixedSalePrice: isActualMode ? c.fixedSalePrice : undefined,
          }),
        ),
      ];

      // (4) 안분 실행
      const apportionment = apportionBundledSale({
        totalSalePrice: data.totalSalePrice!,
        assets: bundleAssets,
      });

      // (4.5) 매매 estimated 컴패니언: 안분된 양도가액으로 환산취득가 사후 산정
      // 환산공식: 양도가 × (취득시 기준시가 ÷ 양도시 기준시가)
      const adjustedAcq = new Map<string, { price: number; used: boolean }>();
      companions.forEach((c) => {
        if (
          c.acquisitionCause === "purchase" &&
          c.useEstimatedAcquisition &&
          c.standardPriceAtAcquisition &&
          c.standardPriceAtTransfer
        ) {
          const alloc = apportionment.apportioned.find((a) => a.assetId === c.assetId);
          if (!alloc) return;
          const price = calculateEstimatedAcquisitionPrice(
            alloc.allocatedSalePrice,
            c.standardPriceAtAcquisition,
            c.standardPriceAtTransfer,
          );
          adjustedAcq.set(c.assetId, { price, used: true });
        }
      });

      // apportionment 결과에 usedEstimatedAcquisition 플래그 전파 (결과 표시용)
      apportionment.apportioned.forEach((a) => {
        const adj = adjustedAcq.get(a.assetId);
        if (adj?.used) {
          a.usedEstimatedAcquisition = true;
        }
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
        const companionAcqPrice =
          adjustedAcq.get(c.assetId)?.price ?? a.allocatedAcquisitionPrice;
        // 자산별 취득일: 상속/증여는 acquisitionDate(상속개시일/증여일), 매매는 acquisitionDate
        // 없으면 주 자산 날짜로 fallback
        const companionAcqDate = c.acquisitionDate
          ? new Date(c.acquisitionDate)
          : acquisitionDate;
        const companionDecedent =
          c.acquisitionCause === "inheritance" && c.decedentAcquisitionDate
            ? new Date(c.decedentAcquisitionDate)
            : undefined;
        const companionDonor =
          c.acquisitionCause === "gift" && c.donorAcquisitionDate
            ? new Date(c.donorAcquisitionDate)
            : undefined;
        const companionEngine: TransferTaxItemInput = {
          propertyType:
            c.assetKind === "housing"
              ? "housing"
              : c.assetKind === "building"
                ? "building"
                : "land",
          transferPrice: a.allocatedSalePrice,
          transferDate,
          acquisitionPrice: companionAcqPrice,
          acquisitionDate: companionAcqDate,
          expenses: a.allocatedExpenses,
          useEstimatedAcquisition:
            c.acquisitionCause === "purchase" && (c.useEstimatedAcquisition ?? false),
          standardPriceAtAcquisition: c.standardPriceAtAcquisition,
          standardPriceAtTransfer: c.standardPriceAtTransfer,
          householdHousingCount: engineInput.householdHousingCount,
          residencePeriodMonths: c.residencePeriodMonths ?? 0,
          isRegulatedArea: engineInput.isRegulatedArea,
          wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
          isUnregistered: c.isUnregistered ?? false,
          isNonBusinessLand: c.isNonBusinessLand ?? false,
          isOneHousehold: c.isOneHousehold ?? false,
          acquisitionCause: c.acquisitionCause,
          decedentAcquisitionDate: companionDecedent,
          donorAcquisitionDate: companionDonor,
          reductions: c.reductions.map((r): TransferReduction => {
            if (r.type === "public_expropriation") {
              return { ...r, businessApprovalDate: new Date(r.businessApprovalDate) };
            }
            if (r.type === "self_farming") {
              return {
                ...r,
                incorporationDate: r.incorporationDate ? new Date(r.incorporationDate) : undefined,
              };
            }
            return r;
          }),
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
          priorReductionUsage: data.priorReductionUsage ?? [],
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
