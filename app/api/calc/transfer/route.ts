/**
 * 양도소득세 계산 API Route
 *
 * Layer 1 (Orchestrator):
 *   Zod 입력 검증 → preloadTaxRates → calculateTransferTax → 결과 반환
 *
 * POST /api/calc/transfer
 */

import { NextRequest, NextResponse } from "next/server";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { mapReductionsToEngine } from "./route-reductions-mapper";
import { buildNblEngineInput } from "@/lib/calc/non-business-land-request";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { calculateHoldingPeriod } from "@/lib/tax-engine/tax-utils";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { dispatchGeneralBuilding } from "./general-building-route-helper";
import {
  resolveHousingContextFromCompanion,
  buildCompanionEngineInputs,
  prepareBundledApportionment,
} from "./bundled-split-helpers";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import { mapHousesToEngine, mapGracePeriodToEngine, mapPresaleRightsToEngine } from "@/lib/api/transfer-route-multi-house";
import { checkRateLimit, getClientIp, shouldBypassRateLimit } from "@/lib/api/rate-limit";
import {
  propertySchema as inputSchema,
} from "@/lib/api/transfer-tax-schema";
import { buildInheritedAcquisition } from "./route-inherited-acquisition";
import { toRentalHousingExceptionEngineInput } from "./_rental-engine-input";

// ============================================================
// POST handler (⑫-2, ⑫-3)
// ============================================================

export async function POST(request: NextRequest) {
  // 단계 0: Rate Limiting — 분당 30회 (C6)
  const ip = getClientIp(request);
  const rl = checkRateLimit(`transfer:${ip}`, { limit: 30, windowMs: 60_000, bypass: shouldBypassRateLimit(request) });
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
      // path가 빈 배열인 경우(superRefine top-level issue 등) "_root" 키로 변환 — 빈 문자열 키는 console에서 `{}`로 표시되어 디버깅 어려움
      const key = issue.path.length > 0 ? issue.path.join(".") : "_root";
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    // 서버 측 전체 issue 로그 — 클라이언트 콘솔 외에 서버 로그도 남김 (Vercel 로그 추적용)
    console.error("[transfer-tax route] zod validation failed", {
      issueCount: parsed.error.issues.length,
      issues: parsed.error.issues.map((i) => ({
        path: i.path,
        message: i.message,
        code: i.code,
      })),
    });
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

  // 단계 3: string → Date 변환 (`lib/api/date-coerce.ts` 헬퍼 — invalid 시 명확한 에러 메시지)
  const data = parsed.data;
  const transferDate = toDate(data.transferDate, "transferDate");
  const acquisitionDate = toDate(data.acquisitionDate, "acquisitionDate");
  // Round 9 (2026-05-06): 자산-수준 매매계약일 string → Date 변환
  const assetContractDate = toOptionalDate(data.assetContractDate);

  const engineInput: TransferTaxInput = {
    propertyType: data.propertyType,
    transferPrice: data.transferPrice,
    /** 지분 모드: 12억 안분 분모용 총 물건 양도가액 (단독 소유는 undefined) */
    totalPropertyTransferPrice: data.totalPropertyTransferPrice,
    transferDate,
    acquisitionPrice: data.acquisitionPrice,
    acquisitionDate,
    assetContractDate,
    expenses: data.expenses,
    /** §97② 단서 swap 분리 입력 — 미명시 시 undefined 유지 (swap 비활성, legacy expenses 사용) */
    capitalExpenditure: data.capitalExpenditure,
    transferExpense: data.transferExpense,
    useEstimatedAcquisition: data.useEstimatedAcquisition,
    standardPriceAtAcquisition: data.standardPriceAtAcquisition,
    standardPriceAtTransfer: data.standardPriceAtTransfer,
    // ⑭ §164⑨ 특례 (TS 미감지 침묵 strip 주의): 1호 per-sqm(가~다목)·2호 공매경락·1호 주택총액(라목)
    transferCause: data.transferCause,
    standardPricePerSqmAtTransfer: data.standardPricePerSqmAtTransfer,
    transferArea: data.transferArea,
    compensationPerSqm: data.compensationPerSqm, compensationBasisStdPrice: data.compensationBasisStdPrice,
    isAuctionTransfer: data.isAuctionTransfer, auctionPrice: data.auctionPrice, // 2호
    housingCompensationTotal: data.housingCompensationTotal, housingCompensationBasisTotal: data.housingCompensationBasisTotal, // 1호 주택총액
    splitLandCompensationTotal: data.splitLandCompensationTotal, splitLandCompensationBasisTotal: data.splitLandCompensationBasisTotal, // 1호 건물 split 토지분(P6)
    householdHousingCount: data.householdHousingCount,
    // ⑭ 사례 36 §89①4호 가목 1세대1입주권 비과세 — 조합원입주권 보유 수 (TypeScript 미감지 영역)
    // optional: right_to_move_in 이외 자산 유형에서는 미전달 → 엔진 fallback (householdRightCount ?? 0)
    householdRightCount: data.householdRightCount,
    residencePeriodMonths: data.residencePeriodMonths,
    isRegulatedArea: data.isRegulatedArea,
    wasRegulatedAtAcquisition: data.wasRegulatedAtAcquisition,
    // ⑭ 법정동코드 — Zod 통과 시 string(10), 미제공 시 undefined (Date 변환 불필요)
    regionCode: data.regionCode,
    isUnregistered: data.isUnregistered,
    isNonBusinessLand: data.isNonBusinessLand,
    isSuccessorRightToMoveIn: data.isSuccessorRightToMoveIn,
    acquisitionCause: data.acquisitionCause,
    decedentAcquisitionDate: toOptionalDate(data.decedentAcquisitionDate),
    decedentSameHouseholdBeforeInheritance: data.decedentSameHouseholdBeforeInheritance,
    decedentCohabitationHoldingStartDate: toOptionalDate(data.decedentCohabitationHoldingStartDate),
    decedentCohabitationResidenceMonths: data.decedentCohabitationResidenceMonths,
    donorAcquisitionDate: toOptionalDate(data.donorAcquisitionDate),
    carryoverTaxation: data.carryoverTaxation
      ? {
          giftRegistryDate: new Date(data.carryoverTaxation.giftRegistryDate),
          donorAcquisitionDate: new Date(data.carryoverTaxation.donorAcquisitionDate),
          donorAcquisitionPrice: data.carryoverTaxation.donorAcquisitionPrice,
          useEstimatedAcquisition: data.carryoverTaxation.useEstimatedAcquisition,
          giftTaxAmount: data.carryoverTaxation.giftTaxAmount,
          donorCapitalExpenditure: data.carryoverTaxation.donorCapitalExpenditure,
          giftDateValuation: data.carryoverTaxation.giftDateValuation,
          exclusionDeclared: data.carryoverTaxation.exclusionDeclared,
        }
      : undefined,
    isOneHousehold: data.isOneHousehold,
    temporaryTwoHouse: data.temporaryTwoHouse
      ? {
          previousAcquisitionDate: new Date(data.temporaryTwoHouse.previousAcquisitionDate),
          newAcquisitionDate: new Date(data.temporaryTwoHouse.newAcquisitionDate),
        }
      : undefined,
    // ⑭ §156의2⑤ 대체주택 비과세 특례 — string 일자 → Date 변환 (date-coerce)
    replacementHouse: data.replacementHouse
      ? {
          businessApprovalDate: toDate(data.replacementHouse.businessApprovalDate, "replacementHouse.businessApprovalDate"),
          completionDate: toDate(data.replacementHouse.completionDate, "replacementHouse.completionDate"),
          replacementResidenceMonths: data.replacementHouse.replacementResidenceMonths,
          willResideNewHouse: data.replacementHouse.willResideNewHouse,
        }
      : undefined,
    // 감면 매핑 — route-reductions-mapper.ts로 분리 (800줄 정책, 2026-06-11)
    reductions: mapReductionsToEngine(data.reductions),
    annualBasicDeductionUsed: data.annualBasicDeductionUsed,
    priorReductionUsage: data.priorReductionUsage ?? [],
    // P5 모드 2 (⑭): string 일자 → Date 변환
    specialHouseExclusions: (data.specialHouseExclusions ?? []).map((e) => ({
      article: e.article,
      houseAcquisitionDate: e.houseAcquisitionDate ? new Date(e.houseAcquisitionDate) : undefined,
      houseContractDate: e.houseContractDate ? new Date(e.houseContractDate) : undefined,
      requirementsConfirmed: e.requirementsConfirmed,
    })),
    // ⑭ NBL 정밀판정: raw 평면 → mapAssetToNblInput(nested + Date 일괄) 공용 헬퍼 (origin/master #223·#224)
    nonBusinessLandDetails: buildNblEngineInput(data.nonBusinessLandRaw),
    // ⑭ 다주택 중과 houses[]·presaleRights — Date 변환 + 9유형/P2 필드 매핑 헬퍼 (800줄 정책)
    houses: mapHousesToEngine(data.houses),
    presaleRights: mapPresaleRightsToEngine(data.presaleRights),
    sellingHouseId: data.sellingHouseId,
    gracePeriod: mapGracePeriodToEngine(data.gracePeriod),
    marriageMerge: data.marriageMerge
      ? { marriageDate: new Date(data.marriageMerge.marriageDate) }
      : undefined,
    parentalCareMerge: data.parentalCareMerge
      ? { mergeDate: new Date(data.parentalCareMerge.mergeDate) }
      : undefined,
    isFirstTransferredInMerge: data.isFirstTransferredInMerge,
    generalHouseGiftedFromDecedentWithin2yr: data.generalHouseGiftedFromDecedentWithin2yr,
    // ⑭ §154① 단서 — string 일자 → Date 변환 (date-coerce)
    oneHouseExemptionProviso: data.oneHouseExemptionProviso
      ? {
          reason: data.oneHouseExemptionProviso.reason,
          departureDate: toOptionalDate(data.oneHouseExemptionProviso.departureDate),
          expropriationDate: toOptionalDate(data.oneHouseExemptionProviso.expropriationDate),
          businessApprovalDate: toOptionalDate(data.oneHouseExemptionProviso.businessApprovalDate),
        }
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
    // ⑭ 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 엔진에 전달 (TypeScript 미감지 영역)
    similarSalesValue: data.similarSalesValue,
    isSelfBuilt: data.isSelfBuilt,
    buildingType: data.buildingType,
    constructionDate: toOptionalDate(data.constructionDate),
    extensionFloorArea: data.extensionFloorArea,
    // ⑭ Phase 2 증축 — 침묵 strip 방지 명시 매핑
    extensionStdPriceAtAcquisition: data.extensionStdPriceAtAcquisition,
    // 토지/건물 취득일 분리 (선택)
    landAcquisitionDate: toOptionalDate(data.landAcquisitionDate),
    landSplitMode: data.landSplitMode,
    // ⑭ 파트별 취득 모드 + 양도 분리 모드 — TypeScript 미감지 영역(엔진 명시 입력, §9 M2)
    landAcqMode: data.landAcqMode,
    buildingAcqMode: data.buildingAcqMode,
    isSeparateAcquisition: data.isSeparateAcquisition,
    // 개산공제(§163⑥) base 축소 — 기준시가는 raw, 엔진이 개산공제에서만 적용
    ownershipRatio: data.ownershipRatio,
    buildingStandardPriceAtAcquisition: data.buildingStandardPriceAtAcquisition,
    saleSplitMode: data.saleSplitMode,
    landSalesCaseValue: data.landSalesCaseValue,
    buildingSalesCaseValue: data.buildingSalesCaseValue,
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
    // ⑭ 상속 상가 §164⑥ 취득당시 기준시가 보조 입력 (§163⑨2호 max) — 숫자 payload(Date 변환 불요)
    ...(data.commercialInheritanceValuation ? { commercialInheritanceValuation: data.commercialInheritanceValuation } : {}),
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
    // 수정신고(경정) — Date 변환 (toOptionalDate 정책)
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
          // 경정청구 — §45의2 (correctionKind·claimReasonType 통과, posteriorEventDate Date 변환)
          correctionKind: data.amendment.correctionKind,
          claimReasonType: data.amendment.claimReasonType,
          posteriorEventDate: toOptionalDate(data.amendment.posteriorEventDate),
        }
      : undefined,
    // ⑭ 장기임대주택 거주주택 비과세 특례 (소령 §155⑳) — Date 변환 필수
    // 주의: toDate()/toOptionalDate() 헬퍼 사용 (lib/api/date-coerce.ts 정책)
    rentalHousingException: toRentalHousingExceptionEngineInput(data.rentalHousingException),
    // ⑭ 사례 28 — 부수토지 한도 산정 (영 §154⑦). occupancyApprovalDate 등은 UI에서 acquisitionDate로 변환됨.
    buildingFootprintArea: data.buildingFootprintArea,
    isUrbanArea: data.isUrbanArea,
    appurtenantLandZone: data.appurtenantLandZone,
    // ⑭ 부수토지 일체과세 판정 (§89①3호·영§154⑦) — landNature는 Zod 검증되나 매핑 누락 시 엔진 미도달.
    // primaryContextForCompanionRate가 설정된 bundled 토지-primary에서 resolveCompanionLandRate가
    // landNature !== "appurtenant_to_housing"(undefined 포함)이면 applied=false로 일체과세 미발동.
    landNature: data.landNature,
    // ⑭ 상업용건물·오피스텔 환산취득가 서브객체 (TypeScript 미감지 — 명시 매핑 필수)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...(data.commercialBuildingValuation ? { commercialBuildingValuation: data.commercialBuildingValuation as any } : {}),
    // ⑭ 일반건물 환산취득가 (TypeScript 미감지). ⑭ 부담부증여 §159 — Date 변환 없음.
    ...(data.burdenedGiftInfo ? { burdenedGiftInfo: data.burdenedGiftInfo } : {}),
    // ⑭ 재개발/재건축 (시행령 §166) — Date 4개 변환 (approvalDate/settlementSaleDate/firstDisclosureDate/completionDate)
    ...(data.redevelopment ? { redevelopment: { ...data.redevelopment, approvalDate: new Date(data.redevelopment.approvalDate), settlementSaleDate: toOptionalDate(data.redevelopment.settlementSaleDate), firstDisclosureDate: toOptionalDate(data.redevelopment.firstDisclosureDate), completionDate: toOptionalDate(data.redevelopment.completionDate) } } : {}),
    // ⑭ Phase 2 (2026-05-12): transferType 패스스루 — 양도 형태 (양도자 관점)
    // "burdened_gift" 시 엔진 §159 분기 활성. 미지정 시 "regular" 자동 보정.
    ...(data.transferType !== undefined ? { transferType: data.transferType } : {}),
    // ⑭ 가업상속공제 §97의2④ (TypeScript 미감지 — 명시 매핑 필수). inheritanceDate: string 그대로.
    ...(data.familyBusinessInheritance ? { familyBusinessInheritance: data.familyBusinessInheritance } : {}),
    ...(data.generalBuildingValuation ? (() => {
      const buildingAcq = toOptionalDate(data.generalBuildingValuation.buildingAcquisitionDate);
      // #4-a: 토지 상속·증여 보조 필드 Date 변환
      const decedentAcq = toOptionalDate(data.generalBuildingValuation.decedentAcquisitionDate);
      const donorAcq = toOptionalDate(data.generalBuildingValuation.donorAcquisitionDate);
      return {
        generalBuildingValuation: {
          ...data.generalBuildingValuation,
          totalTransferPrice: data.transferPrice,               // 최상위 양도가액 주입
          transferDate,                                          // 이미 Date 변환됨
          acquisitionDate,                                       // 이미 Date 변환됨
          // ⑭ 건물 취득일 string → Date 변환 (소득세법 §114조의2 ① 5년 기산점)
          ...(buildingAcq ? { buildingAcquisitionDate: buildingAcq } : {}),
          ...(decedentAcq ? { decedentAcquisitionDate: decedentAcq } : {}),
          ...(donorAcq ? { donorAcquisitionDate: donorAcq } : {}),
        },
      };
    })() : {}),
  };

  // 단계 4: 세율 로드 (Supabase 미도달 시 로컬 세율 fallback — 양도세 계산 지속)
  //   재산세·종부세 route와 동일한 graceful 정책. 양도세 엔진은 rates 필수(throw)이므로
  //   undefined 대신 항상 유효한 TaxRatesMap을 보장 (loadFallbackTransferRates).
  let rates;
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    try {
      rates = await preloadTaxRates(["transfer"], transferDate);
      // 테이블 존재하나 비어있는 경우(시딩 전)도 로컬 fallback
      if (rates.size === 0) rates = loadFallbackTransferRates(transferDate);
    } catch (err) {
      console.warn(
        "[POST /api/calc/transfer] preloadTaxRates 실패, 로컬 세율 fallback 사용:",
        err,
      );
      rates = loadFallbackTransferRates(transferDate);
    }
  } else {
    // 환경변수 미설정 — 로컬 개발/오프라인 (CLAUDE.md: graceful 통과)
    rates = loadFallbackTransferRates(transferDate);
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
    // 지분 모드 식별: primary 또는 모든 companion이 totalPropertyTransferPrice를 가지면 ratio×total로 자동 안분.
    // 별도 안분 키(actual 가액 또는 양도시 기준시가)가 불필요하므로 bundled flow 진입 허용.
    const primaryIsFractional = data.totalPropertyTransferPrice !== undefined;
    const allCompanionsFractional =
      companions.length > 0 && companions.every((c) => c.totalPropertyTransferPrice !== undefined);
    const isFractionalBundle = primaryIsFractional || allCompanionsFractional;
    // 완전 지분 모드: primary·전 companion 모두 fractional (같은 물건 지분 분할).
    // 이때만 각 자산의 확정 양도가액(총계약가×ratio)을 fixedSalePrice로 주입한다.
    // 혼합(primary만 지분 등)은 비지분 자산의 fixedSalePrice가 미계산이므로 기존 경로 유지.
    const isFullFractionalBundle = primaryIsFractional && allCompanionsFractional;
    const bundledOk =
      companions.length > 0 &&
      data.totalSalePrice !== undefined &&
      (
        // 지분 모드: ratio×total 자동 안분 → 안분 키 불필요
        isFractionalBundle ||
        // actual 모드: primary 명시 가액 필요
        (isActualMode && data.primaryActualSalePrice !== undefined) ||
        // apportioned 모드: 안분 키 (양도시 기준시가) 필요
        (!isActualMode && data.standardPriceAtTransferForApportion !== undefined)
      );

    if (bundledOk) {
      // (1)~(4.5) 안분 준비·실행 — bundled-split-helpers.ts로 추출 (800줄 정책)
      const { apportionment, adjustedAcq } = prepareBundledApportionment(
        {
          propertyType: data.propertyType,
          totalSalePrice: data.totalSalePrice,
          standardPriceAtTransferForApportion: data.standardPriceAtTransferForApportion,
          expenses: data.expenses,
          acquisitionPrice: data.acquisitionPrice,
          primaryActualSalePrice: data.primaryActualSalePrice,
          primaryInheritanceValuation: data.primaryInheritanceValuation,
        },
        companions,
        { isActualMode, isFullFractionalBundle },
      );

      // (5) TransferTaxItemInput[] 조립 — 주 자산은 engineInput 파생, 컴패니언은 기본값 + override
      // G-2: companion이 한도 초과 split 대상이면 flatMap으로 두 자산([appurtenant, excess])을 생성.
      //      split 조건: newConstruction + land + areaM2 있음 + excessArea > 0 + 수동 오버라이드 없음
      const primaryHp = calculateHoldingPeriod(acquisitionDate, transferDate);

      // 사례 28 자동 분기 양방향 확장 + 폼-수준 사용자 모드 (헬퍼)
      const housingCtxFromCompanion =
        engineInput.propertyType !== "housing"
          ? resolveHousingContextFromCompanion(
              companions,
              transferDate,
              data.buildingFootprintArea,
              data.isUrbanArea,
              data.bundledSaleMode,
              data.appurtenantLandZone,
            )
          : undefined;

      const primaryCtxForSplit =
        engineInput.buildingFootprintArea !== undefined ||
        engineInput.manualHoldingPeriodOverride !== undefined
          ? {
              propertyType: engineInput.propertyType,
              holdingMonths: primaryHp.years * 12 + primaryHp.months,
              buildingFootprintArea: engineInput.buildingFootprintArea,
              isUrbanArea: engineInput.isUrbanArea,
              appurtenantLandZone: engineInput.appurtenantLandZone,
              bundledSaleMode: data.bundledSaleMode,
            }
          : housingCtxFromCompanion;

      // 사례 28 — primary가 land이고 housingCtxFromCompanion이 있으면 primaryCtx 주입 (양방향 자동 분기)
      // landNature는 개별 자산에 명시 입력되므로 폼-수준 userModeOverride 불필요.
      if (engineInput.propertyType === "land") {
        if (housingCtxFromCompanion && !engineInput.primaryContextForCompanionRate) {
          engineInput.primaryContextForCompanionRate = {
            propertyType: housingCtxFromCompanion.propertyType,
            holdingMonths: housingCtxFromCompanion.holdingMonths,
            buildingFootprintArea: housingCtxFromCompanion.buildingFootprintArea,
            isUrbanArea: housingCtxFromCompanion.isUrbanArea,
            appurtenantLandZone: housingCtxFromCompanion.appurtenantLandZone,
            bundledSaleMode: housingCtxFromCompanion.bundledSaleMode,
          };
        }
      }

      const items: TransferTaxItemInput[] = apportionment.apportioned.flatMap((a, idx) => {
        if (a.assetId === "primary") {
          // 주 자산: engineInput을 복제 + 안분 결과로 양도·취득·필요경비 덮어쓰기
          // 지분 모드: data.totalPropertyTransferPrice는 engineInput에서 이미 상속됨 (...engineInput).
          return [{
            ...engineInput,
            transferPrice: a.allocatedSalePrice,
            acquisitionPrice: a.allocatedAcquisitionPrice,
            expenses: a.allocatedExpenses,
            propertyId: "primary",
            propertyLabel: a.assetLabel,
          } satisfies TransferTaxItemInput];
        }
        // 컴패니언 자산 빌드 + 한도 초과 split — bundled-split-helpers.ts로 추출
        const c = companions[idx - 1];
        return buildCompanionEngineInputs(c, a, {
          primaryCtxForSplit,
          primaryAcquisitionDate: acquisitionDate,
          transferDate,
          primaryAcquisitionCause: data.acquisitionCause,
          primaryEngineInput: {
            householdHousingCount: engineInput.householdHousingCount,
            isRegulatedArea: engineInput.isRegulatedArea,
            wasRegulatedAtAcquisition: engineInput.wasRegulatedAtAcquisition,
            propertyType: engineInput.propertyType,
            buildingFootprintArea: engineInput.buildingFootprintArea,
            isUrbanArea: engineInput.isUrbanArea,
            appurtenantLandZone: engineInput.appurtenantLandZone,
          },
          bundledSaleMode: data.bundledSaleMode,
          adjustedAcqPrice: adjustedAcq.get(c.assetId)?.price,
        });
      });

      // (6) 다건 엔진 호출
      const aggregated = calculateTransferTaxAggregate(
        {
          taxYear: transferDate.getFullYear(),
          properties: items,
          annualBasicDeductionUsed: data.annualBasicDeductionUsed,
          priorReductionUsage: data.priorReductionUsage ?? [],
          // [A1] 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
          amendment: engineInput.amendment,
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

    // ─── 5-a-2. 겸용주택 분리계산 경로 (sodt §160①단서, 2022.1.1 이후) ───
    if (data.propertyType === "mixed-use-house" && data.mixedUse) {
      const phdInput = data.mixedUse.preHousingDisclosure
        ? {
            ...data.mixedUse.preHousingDisclosure,
            firstDisclosureDate: new Date(
              data.mixedUse.preHousingDisclosure.firstDisclosureDate,
            ),
          }
        : undefined;
      const mixedAsset = {
        ...data.mixedUse,
        isMixedUseHouse: true as const,
        landAcquisitionDate: new Date(data.mixedUse.landAcquisitionDate),
        buildingAcquisitionDate: new Date(data.mixedUse.buildingAcquisitionDate),
        preHousingDisclosure: phdInput,
        partialUsageChange: data.mixedUse.partialUsageChange
          ? {
              ...data.mixedUse.partialUsageChange,
              // date-coerce: 빈문자열·invalid → undefined 가드 (API 변환에서 new Date() 제거 후 route 단일 변환)
              usageChangeDate: toOptionalDate(data.mixedUse.partialUsageChange.usageChangeDate),
            }
          : undefined,
      };
      const mixedResult = calcMixedUseTransferTax(
        data.transferPrice,
        new Date(data.transferDate),
        mixedAsset,
        rates,
        // 신고서 단위 수정신고·경정청구 — engineInput.amendment는 상단(:308~)에서 Date 변환 완료.
        // ⚠️ raw data.amendment 전달 금지: Zod 출력은 string이라 §48② 감면율 판정(isAfter)이 침묵 오작동.
        engineInput.amendment,
      );
      return NextResponse.json(
        { data: { mode: "mixed-use" as const, result: mixedResult } },
        { status: 200 },
      );
    }

    // ─── 5-a-3. 일반건물(토지+건물 일괄) — actualPriceMode 플래그로 내부 분기 ───
    if (data.propertyType === "general_building" && data.generalBuildingValuation) {
      const gbv = data.generalBuildingValuation as Record<string, unknown>;
      // 증축 케이스(bundledAcquisitionPrice 포함 시): 환산취득가 모드에서 acquisitionPrice=0이므로
      // generalBuildingValuation.bundledAcquisitionPrice를 실제 취득가·필요경비로 사용.
      // 비증축(사례 31·32): 환산취득가는 기준시가 비율로 엔진이 직접 계산하므로 0이어도 무방.
      const bundledAcq = (gbv.bundledAcquisitionPrice as number | undefined) ?? engineInput.acquisitionPrice ?? 0;
      // 부담부증여 K-4(실지취득가 안분)는 개산공제 미적용 — 자본적지출+양도비를 actualExpenses로 전달.
      // (general-building-route-helper가 buildBurdenedGiftBreakdown.capitalExpenditure로 넘겨 채무비율 안분.)
      const isBurdenedGiftActualGb =
        data.transferType === "burdened_gift" &&
        data.burdenedGiftInfo?.acquisitionMethod === "actual";
      const bundledExp = isBurdenedGiftActualGb
        ? (engineInput.capitalExpenditure ?? 0) + (engineInput.transferExpense ?? 0)
        : (gbv.bundledExpenses as number | undefined) ?? engineInput.expenses ?? 0;
      // 부담부증여 §159 — actualPriceMode 분기에서 §159①1호 환산 적용용 정보 전달.
      // BurdenedGiftInfo 타입은 string Date 허용이지만, 엔진 buildBurdenedGiftBreakdown은 필드 그대로 사용.
      const burdenedGiftInfoForGb =
        data.transferType === "burdened_gift" && data.burdenedGiftInfo
          ? data.burdenedGiftInfo
          : undefined;
      const { apportionment, aggregated, transferBurdenedGiftBreakdown } = dispatchGeneralBuilding(
        gbv,
        data.transferPrice, transferDate, acquisitionDate,
        bundledAcq, bundledExp,
        transferDate.getFullYear(), data.annualBasicDeductionUsed,
        data.priorReductionUsage ?? [], rates,
        burdenedGiftInfoForGb,
        // ⑭ §164⑨ 1호 공익수용 특례 (토지 전용 — D16-GB): top-level 특례 필드 전달.
        {
          transferCause: data.transferCause,
          compensationPerSqm: data.compensationPerSqm,
          compensationBasisStdPrice: data.compensationBasisStdPrice,
        },
      );
      return NextResponse.json(
        {
          data: {
            mode: "bundled" as const,
            apportionment,
            aggregated,
            // 부담부증여 §159·증여세 통합 명세 (부담부증여 모드에서만 포함, 사이드바·결과 카드 표시용)
            ...(transferBurdenedGiftBreakdown ? { transferBurdenedGiftBreakdown } : {}),
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
    // 서버 콘솔에 풀 스택 출력 — dev 터미널에서 즉시 원인 식별
    console.error("[/api/calc/transfer] engine error:", err);
    if (err instanceof TaxCalculationError) {
      return NextResponse.json(
        { error: { code: err.code, message: err.message } },
        { status: 500 },
      );
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    return NextResponse.json(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: errMsg || "계산 중 오류가 발생했습니다",
          // 스택은 비운영 환경에서만 노출 (운영 내부 경로·구현 정보 노출 차단)
          ...(process.env.NODE_ENV !== "production" ? { stack: errStack } : {}),
        },
      },
      { status: 500 },
    );
  }
}
