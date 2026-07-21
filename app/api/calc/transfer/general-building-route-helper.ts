/**
 * 일반건물(토지+건물 일괄) 라우트 헬퍼.
 *
 * 두 경로 지원:
 * A. 환산취득가 모드: §166⑥(양도가 안분) + §176의2②(환산) + §163⑥(개산공제) + §102②(1차 통산)
 * B. 실거래가/감정가 모드: §166⑥(비율 안분) + 실거래 취득가액 비율 분할 + NBL 중과
 *
 * route.ts 800줄 분할 정책에 따라 추출.
 */

import { toOptionalDate } from "@/lib/api/date-coerce";
import {
  calculateTransferTaxAggregate,
  type TransferTaxItemInput,
  type AggregateTransferResult,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import {
  buildGeneralBuildingAssetCards,
  apportionLandByBusinessArea,
  type GeneralBuildingInput,
} from "@/lib/tax-engine/general-building-valuation";
import { getLandFootprintMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { AssetCardForAggregate, GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import { resolveGeneralBuildingSwap, type GeneralBuildingSwapDecision } from "@/lib/tax-engine/general-building-swap";
import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

/** 라우트가 받는 환산취득가 payload (Zod 통과 후 + Date 변환 포함). */
export type GeneralBuildingValuationPayload = GeneralBuildingInput;

/** 실거래가/감정가 모드 NBL 전용 payload. */
export interface GeneralBuildingActualPricePayload {
  totalTransferPrice: number;
  transferDate: Date;
  acquisitionDate: Date;
  landArea: number;
  buildingFootprintArea: number;
  transferLandPricePerSqm: number;
  transferBuildingStdPrice: number;
  zoneType?: string;
  isMetropolitan?: boolean;
  isUnregistered?: boolean;
  actualAcquisitionPrice: number;
  actualExpenses: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 토지 ㎡당 기준시가. 부담부증여 모드 시 필수. */
  acquisitionLandPricePerSqm?: number;
  /** 부담부증여 §159①1호 산식용 — 취득시 건물 기준시가 총액. 부담부증여 모드 시 필수. */
  acquisitionBuildingStdPrice?: number;
  /**
   * 부담부증여 정보 (소령 §159).
   * 제공 시 §159①1호 단서에 따라 사용자 입력 actualAcquisitionPrice를 무시하고
   * 취득시 기준시가 × 채무비율로 환산.
   */
  burdenedGiftInfo?: BurdenedGiftInfo;
  // ── 사례 35: 주택→상가 용도변경 (자산 공통 — actual 경로도 동일 분기) ──
  houseToCommercialConversion?: boolean;
  conversionDate?: Date;
  wasMultiHouseAtConversion?: boolean;
  // ── §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1) ──
  /** 토지 상속 게이트 (§163⑨). */
  acquisitionByInheritance?: boolean;
  /** 건물 상속 게이트. */
  buildingAcquisitionByInheritance?: boolean;
  /** 상속개시일 토지 평가액 (원) — 취득당시 실지거래가액 의제(§166⑥ 안분 아님). */
  inheritedLandValue?: number;
  /** 상속개시일 건물 평가액 (원). */
  inheritedBuildingValue?: number;
  // ── §95④ 단기보유 기산점 — actual 분기 기존 결측(회귀 동반 수정) ──
  /** 토지 취득원인 — 단기보유 기산점 분기(영 §95④). */
  landAcquisitionCause?: "purchase" | "inheritance" | "gift" | "carryover_gift";
  /** 상속 시 피상속인 취득일 (영 §95④). */
  decedentAcquisitionDate?: Date;
  /** 증여 시 증여자 취득일 (영 §95④). */
  donorAcquisitionDate?: Date;
}

interface BundledLikeApportionmentResult {
  apportioned: Array<{
    assetId: string;
    assetLabel: string;
    assetKind: "land" | "building";
    allocatedSalePrice: number;
    allocatedAcquisitionPrice: number;
    allocatedExpenses: number;
    displayRatio: number;
    standardPriceAtTransfer: number;
    standardPriceAtAcquisition: number;
    saleMode: "apportioned";
    usedEstimatedAcquisition: boolean;
  }>;
  totalStandardAtTransfer: number;
  residualAbsorbedBy: string | null;
  legalBasis: string;
  warnings: string[];
}

export interface GeneralBuildingRouteResult {
  apportionment: BundledLikeApportionmentResult;
  aggregated: AggregateTransferResult;
  /** 부담부증여 §159 산정 명세 (부담부증여 모드에서만 채워짐 — 증여세 통합 결과 포함). */
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
}

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────

function buildProperties(
  cards: AssetCardForAggregate[],
  nonBusinessRatio: number,
  swap?: GeneralBuildingSwapDecision,
): TransferTaxItemInput[] {
  return cards.map((card) => {
    const isBuilding = card.propertyType === "general_building_unit";
    // §97②2호 단서 swap(안 A): 배분된 카드는 환산취득가 미차감(0)·필요경비=배분나목.
    // (단건 엔진 actual 모드에서 acqCost=0, expensesApplied=expenses → gain=양도가−배분나목.)
    const swapNabok = swap?.allocation.get(card.propertyId);
    const isSwapCard = swapNabok !== undefined;
    return {
      propertyId: card.propertyId,
      propertyLabel: card.propertyLabel,
      propertyType: card.propertyType,
      transferPrice: card.transferPrice,
      acquisitionPrice: isSwapCard ? 0 : card.acquisitionPrice,
      expenses: isSwapCard ? swapNabok : card.expenses,
      transferDate: card.transferDate,
      acquisitionDate: card.acquisitionDate,
      // useEstimatedAcquisition=false: aggregate 경로에서는 이미 취득가 계산 완료.
      // 가산세 penaltyBase는 usedEstimatedAcquisition=true + estimatedBase 조합으로 전달.
      // (finalize.ts STEP 10.5에서 isEstimatedMode = useEstimatedAcquisition || usedEstimatedAcquisition)
      useEstimatedAcquisition: false,
      usedEstimatedAcquisition: card.usedEstimatedAcquisition,
      estimatedBase: card.estimatedBase,
      estimatedDeduction: card.estimatedDeduction,
      isNonBusinessLand: card.isNonBusinessLand,
      isOneHousehold: false,
      householdHousingCount: 0,
      residencePeriodMonths: 0,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      isUnregistered: false,
      reductions: [],
      // 건물 카드만 §114조의2 가산세 발동 정보 패스스루
      // 토지 카드는 소득세법 §114조의2 ① 적용 대상 아님
      acquisitionMethod: isBuilding && card.usedEstimatedAcquisition ? "estimated" : "actual",
      isSelfBuilt: isBuilding ? (card.isSelfBuilt ?? false) : false,
      // buildingAcquisitionDate → 엔진 input의 constructionDate로 단일 원천 매핑
      constructionDate: isBuilding ? card.buildingAcquisitionDate : undefined,
      // §114조의2① 증축 85㎡ 게이트: 건물2(증축) 카드의 buildingType·extensionFloorArea 패스스루.
      // 미매핑 시 buildingType=undefined → 신축 취급 → 85㎡ 게이트 미적용(오발동).
      buildingType: isBuilding ? card.buildingType : undefined,
      extensionFloorArea: isBuilding ? card.extensionFloorArea : undefined,
      // 건물 카드: buildingAcquisitionCause → acquisitionCause + decedent/donor (#6)
      // 토지 카드: landAcquisitionCause + decedent/donorAcquisitionDate (#4-a)
      // 단건/aggregate 엔진의 단기보유 기산점 분기(영 §95④)에 사용.
      ...(isBuilding && card.buildingAcquisitionCause
        ? {
            acquisitionCause: card.buildingAcquisitionCause,
            ...(card.decedentAcquisitionDate
              ? { decedentAcquisitionDate: card.decedentAcquisitionDate }
              : {}),
            ...(card.donorAcquisitionDate
              ? { donorAcquisitionDate: card.donorAcquisitionDate }
              : {}),
          }
        : !isBuilding && card.landAcquisitionCause
          ? {
              acquisitionCause: card.landAcquisitionCause,
              ...(card.decedentAcquisitionDate
                ? { decedentAcquisitionDate: card.decedentAcquisitionDate }
                : {}),
              ...(card.donorAcquisitionDate
                ? { donorAcquisitionDate: card.donorAcquisitionDate }
                : {}),
              // #7-b: 토지 이월과세 — 단건 엔진 비교과세(이월 vs 통상 max) 트리거
              ...(card.carryoverTaxation
                ? { carryoverTaxation: card.carryoverTaxation }
                : {}),
            }
          : {}),
      // 사례 35: 주택→상가 용도변경 — 자산 공통 속성, 단건 엔진 LTHD 기산일 분기
      ...(card.houseToCommercialConversion
        ? {
            houseToCommercialConversion: true,
            conversionDate: card.conversionDate,
            wasMultiHouseAtConversion: card.wasMultiHouseAtConversion ?? false,
          }
        : {}),
    } as unknown as TransferTaxItemInput;
  });
}

function buildApportionment(
  cards: AssetCardForAggregate[],
  totalStandAtTransfer: number,
  nonBusinessRatio: number,
  landStdAtTransfer: number,
  landStdAtAcq: number | null,
  buildingStdAtTransfer: number,
  buildingStdAtAcq: number | null,
  usedEstimated: boolean,
  legalBasis: string,
  /** §97②2호 단서 swap(안 A) — 발동 자산은 사이드바 표시도 취득가액0·필요경비=배분나목으로 반영
   *  (엔진 buildProperties와 동일). 미전달 시 swap 미반영(실가 경로 등). */
  swap?: GeneralBuildingSwapDecision,
): BundledLikeApportionmentResult {
  return {
    apportioned: cards.map((card) => {
      const isLandCard = card.propertyType === "land";
      const landRatio = nonBusinessRatio > 0 && isLandCard
        ? (card.propertyId === "land_business" ? (1 - nonBusinessRatio) : nonBusinessRatio)
        : 1;
      const stdAtTransfer = isLandCard ? landStdAtTransfer * landRatio : buildingStdAtTransfer;
      const stdAtAcq = isLandCard
        ? (landStdAtAcq !== null ? landStdAtAcq * landRatio : 0)
        : (buildingStdAtAcq !== null ? buildingStdAtAcq : 0);
      // swap 발동 카드: 환산취득가 미차감(0)·필요경비=배분나목 (엔진 buildProperties:118-126 정합).
      const swapNabok = swap?.allocation.get(card.propertyId);
      const isSwapCard = swapNabok !== undefined;
      return {
        assetId: card.propertyId,
        assetLabel: card.propertyLabel,
        assetKind: isLandCard ? "land" : "building",
        allocatedSalePrice: card.transferPrice,
        allocatedAcquisitionPrice: isSwapCard ? 0 : card.acquisitionPrice,
        allocatedExpenses: isSwapCard ? swapNabok : card.expenses,
        displayRatio: stdAtTransfer / totalStandAtTransfer,
        standardPriceAtTransfer: stdAtTransfer,
        standardPriceAtAcquisition: stdAtAcq,
        saleMode: "apportioned",
        usedEstimatedAcquisition: usedEstimated,
      };
    }),
    totalStandardAtTransfer: totalStandAtTransfer,
    residualAbsorbedBy: cards[0]?.propertyId ?? null,
    legalBasis,
    warnings: [],
  };
}

// ── 통합 진입점 (route.ts에서 호출) ─────────────────────────────────────

/**
 * generalBuildingValuation payload를 받아 actualPriceMode 플래그로 내부 분기.
 * route.ts 라인 수 절감 목적.
 */
export function dispatchGeneralBuilding(
  gbRaw: Record<string, unknown>,
  totalTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  actualAcquisitionPrice: number,
  actualExpenses: number,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
  /** 부담부증여 §159 정보 (옵션) — actualPriceMode 분기에서만 사용. */
  burdenedGiftInfo?: BurdenedGiftInfo,
  /**
   * §164⑨ 1호 공익수용 특례 — top-level 특례 필드 (토지 전용, 계획 D16-GB).
   * 환산 경로(calculateGeneralBuildingTransfer)에서만 적용. gbRaw가 아닌 data 최상위에서 옴.
   */
  expropriation?: {
    transferCause?: "general" | "public_expropriation";
    compensationPerSqm?: number;
    compensationBasisStdPrice?: number;
  },
): GeneralBuildingRouteResult {
  // buildingAcquisitionDate: Zod는 z.string().date()로만 검증 — Date 객체로 변환 안 됨.
  // 미변환 시 string이 buildGeneralBuildingAssetCards()의 acquisitionDate에 도달 →
  // monthsBetween(from, to)에서 from.getFullYear() TypeError 발생.
  const buildingAcqDate = toOptionalDate(gbRaw.buildingAcquisitionDate);

  // buildingAcquisitionCause: Zod 필수 강제 + normalizeAsset M-2 보완으로 항상 정의됨 보장.
  // silent fallback 제거 (정책 #1 — 자동 안분 fallback 금지).
  const buildingAcqCause = gbRaw.buildingAcquisitionCause as
    | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
  // isSelfBuilt = buildingAcquisitionCause 에서 도출 (단일 진실 원천).
  const isSelfBuilt = buildingAcqCause === "newConstruction";

  // #4-a: 토지 상속·증여 보조 필드 Date 변환
  const decedentAcqDate = toOptionalDate(gbRaw.decedentAcquisitionDate);
  const donorAcqDate = toOptionalDate(gbRaw.donorAcquisitionDate);
  // 다른 피상속인/증여자 분리: 건물 전용 보조 필드 Date 변환
  const buildingDecedentAcqDate = toOptionalDate(gbRaw.buildingDecedentAcquisitionDate);
  const buildingDonorAcqDate = toOptionalDate(gbRaw.buildingDonorAcquisitionDate);

  // #7-b: 토지 이월과세 carryoverTaxation 객체 내부 Date 변환
  const landCt = gbRaw.landCarryoverTaxation as Record<string, unknown> | undefined;
  const coercedLandCt = landCt
    ? {
        ...landCt,
        giftRegistryDate: toOptionalDate(landCt.giftRegistryDate),
        donorAcquisitionDate: toOptionalDate(landCt.donorAcquisitionDate),
      }
    : undefined;

  // ⑭ 사례 35: conversionDate Date 변환 (string → Date)
  const conversionDateCoerced = toOptionalDate(gbRaw.conversionDate);

  // ⑭ 사례 33: extensionInfo 내부 extensionDate Date 변환
  const extInfo = gbRaw.extensionInfo as Record<string, unknown> | undefined;
  const coercedExtInfo = extInfo
    ? {
        ...extInfo,
        extensionDate: toOptionalDate(extInfo.extensionDate),
      }
    : undefined;

  const coercedGbRaw: Record<string, unknown> = {
    ...gbRaw,
    ...(buildingAcqDate ? { buildingAcquisitionDate: buildingAcqDate } : {}),
    isSelfBuilt,                         // boolean 도출 (gbRaw의 isSelfBuilt 덮어씀)
    buildingAcquisitionCause: buildingAcqCause,
    ...(decedentAcqDate ? { decedentAcquisitionDate: decedentAcqDate } : {}),
    ...(donorAcqDate ? { donorAcquisitionDate: donorAcqDate } : {}),
    ...(buildingDecedentAcqDate ? { buildingDecedentAcquisitionDate: buildingDecedentAcqDate } : {}),
    ...(buildingDonorAcqDate ? { buildingDonorAcquisitionDate: buildingDonorAcqDate } : {}),
    ...(coercedLandCt ? { landCarryoverTaxation: coercedLandCt } : {}),
    ...(coercedExtInfo ? { extensionInfo: coercedExtInfo } : {}),
    // ⑭ 사례 35: 주택→상가 용도변경 필드 — Date 변환 후 GeneralBuildingInput에 주입
    ...(gbRaw.houseToCommercialConversion
      ? {
          houseToCommercialConversion: true,
          conversionDate: conversionDateCoerced,
          wasMultiHouseAtConversion: gbRaw.wasMultiHouseAtConversion ?? false,
        }
      : {}),
    // ⑭ 사례 35 후속-1: §99-164-10 환산주택가격 4필드 (number, Date 변환 불요)
    ...(gbRaw.hasFirstDisclosure
      ? {
          hasFirstDisclosure: true,
          firstDisclosurePrice: gbRaw.firstDisclosurePrice as number | undefined,
          firstDisclosureLandStdPrice: gbRaw.firstDisclosureLandStdPrice as number | undefined,
          firstDisclosureBuildingStdPrice: gbRaw.firstDisclosureBuildingStdPrice as number | undefined,
        }
      : {}),
  };

  if (coercedGbRaw.actualPriceMode === true) {
    return calculateGeneralBuildingActualTransfer(
      {
        totalTransferPrice, transferDate, acquisitionDate,
        landArea: coercedGbRaw.landArea as number,
        buildingFootprintArea: coercedGbRaw.buildingFootprintArea as number,
        transferLandPricePerSqm: coercedGbRaw.transferLandPricePerSqm as number,
        transferBuildingStdPrice: coercedGbRaw.transferBuildingStdPrice as number,
        zoneType: coercedGbRaw.zoneType as string | undefined,
        isMetropolitan: coercedGbRaw.isMetropolitan as boolean | undefined,
        isUnregistered: coercedGbRaw.isUnregistered as boolean | undefined,
        actualAcquisitionPrice,
        actualExpenses,
        // 부담부증여 §159①1호 — 취득시 기준시가 + 채무 정보 전달
        acquisitionLandPricePerSqm: coercedGbRaw.acquisitionLandPricePerSqm as number | undefined,
        acquisitionBuildingStdPrice: coercedGbRaw.acquisitionBuildingStdPrice as number | undefined,
        burdenedGiftInfo,
        // 사례 35: 주택→상가 용도변경
        houseToCommercialConversion: coercedGbRaw.houseToCommercialConversion as boolean | undefined,
        conversionDate: coercedGbRaw.conversionDate as Date | undefined,
        wasMultiHouseAtConversion: coercedGbRaw.wasMultiHouseAtConversion as boolean | undefined,
        // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1) — 명시 전달(침묵 strip 방지)
        acquisitionByInheritance: coercedGbRaw.acquisitionByInheritance as boolean | undefined,
        buildingAcquisitionByInheritance: coercedGbRaw.buildingAcquisitionByInheritance as boolean | undefined,
        inheritedLandValue: coercedGbRaw.inheritedLandValue as number | undefined,
        inheritedBuildingValue: coercedGbRaw.inheritedBuildingValue as number | undefined,
        // §95④ 단기보유 기산점 — actual 분기 기존 결측 보강 (decedentAcqDate는 :256에서 Date 변환됨)
        landAcquisitionCause: coercedGbRaw.landAcquisitionCause as
          | "purchase" | "inheritance" | "gift" | "carryover_gift" | undefined,
        decedentAcquisitionDate: coercedGbRaw.decedentAcquisitionDate as Date | undefined,
        donorAcquisitionDate: coercedGbRaw.donorAcquisitionDate as Date | undefined,
      },
      taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
    );
  }
  // ⑭ 사례 33: 증축 경로에서 actualBundledAcquisitionPrice/Expenses 주입
  // extensionInfo.actualBundledAcquisitionPrice: 토지+건물1 일괄 취득가 (route handler actualAcquisitionPrice)
  // extensionInfo.actualBundledExpenses: 토지+건물1 일괄 필요경비 (route handler actualExpenses)
  // GeneralBuildingInput.extensionInfo 타입에 필수 필드 — 미주입 시 landAcq/landExp가 NaN.
  // unknown 경유 캐스팅: coercedExtInfo 합성 타입이 GeneralBuildingInput["extensionInfo"] 서브타입과 충돌.
  const gbPayload: GeneralBuildingValuationPayload = {
    ...(coercedGbRaw as unknown as GeneralBuildingValuationPayload),
    totalTransferPrice,
    transferDate,
    acquisitionDate,
    // §164⑨ 1호 공익수용 특례 (토지 전용 — D16-GB): top-level 특례 필드 주입.
    // 환산 경로 엔진이 게이트(수용·환산·2009.02.04·보상 후보) 판정. undefined이면 무영향(회귀 0).
    ...(expropriation?.transferCause ? { transferCause: expropriation.transferCause } : {}),
    ...(expropriation?.compensationPerSqm !== undefined
      ? { compensationPerSqm: expropriation.compensationPerSqm }
      : {}),
    ...(expropriation?.compensationBasisStdPrice !== undefined
      ? { compensationBasisStdPrice: expropriation.compensationBasisStdPrice }
      : {}),
    ...(coercedExtInfo ? {
      extensionInfo: {
        ...(coercedExtInfo as unknown as NonNullable<GeneralBuildingInput["extensionInfo"]>),
        actualBundledAcquisitionPrice: actualAcquisitionPrice,
        actualBundledExpenses: actualExpenses,
      },
    } : {}),
  };

  return calculateGeneralBuildingTransfer(
    gbPayload,
    taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
  );
}

// ── 경로 A: 환산취득가 모드 ────────────────────────────────────────────

/**
 * 환산취득가 모드 — 토지·건물 2자산 aggregate.
 * @param gbv  Zod 검증·Date 변환 완료 payload
 *
 * buildingAcquisitionCause === "newConstruction" 시 isSelfBuilt=true 도출
 * (dispatchGeneralBuilding과 동일 로직 — 단위 테스트 직접 호출 경로 보호).
 */
export function calculateGeneralBuildingTransfer(
  gbv: GeneralBuildingValuationPayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  // buildingAcquisitionCause에서 isSelfBuilt 도출 (단일 진실 원천).
  // gbv.isSelfBuilt가 명시된 경우에도 buildingAcquisitionCause 우선 (deprecated 패턴 방어).
  const normalizedGbv: GeneralBuildingValuationPayload = {
    ...gbv,
    isSelfBuilt: gbv.buildingAcquisitionCause === "newConstruction",
  };
  const gbOut = buildGeneralBuildingAssetCards(normalizedGbv);
  // §97②2호 단서 swap 자산총액 판정(안 A) — 환산 카드 estimatedSide 합 vs 나목(자본+양도비).
  const swap = resolveGeneralBuildingSwap(gbOut.assetCards, gbv.capitalExpenditure, gbv.transferExpense);
  const properties = buildProperties(gbOut.assetCards, gbOut.nonBusinessRatio, swap);

  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
    },
    rates,
  );
  // UI 자산별 산식 인라인 표시용 — gbOut의 분모/분자 변수를 결과에 노출.
  // 사례 31(2-way)·33(3-way) 모두 generalBuildingValuationDetail 통해 UI 가공.
  aggregated.generalBuildingValuationDetail = gbOut;
  // §97②2호 단서 swap 발동 시 결과뷰 표시용(F10) — 자산총액 판정이라 top-level 1개로 충분.
  if (swap.swapApplied) {
    aggregated.swapApplied = true;
    aggregated.swapComparison = {
      estimatedSide: swap.estimatedSideTotal,
      directSide: swap.directSide,
      chosen: "direct",
    };
  }

  const landStdAtTransfer = gbv.transferLandPricePerSqm * gbv.landArea;
  const landStdAtAcq = gbv.acquisitionLandPricePerSqm * gbv.landArea;
  const totalStd = landStdAtTransfer + gbv.transferBuildingStdPrice;

  const apportionment = buildApportionment(
    gbOut.assetCards, totalStd, gbOut.nonBusinessRatio,
    landStdAtTransfer, landStdAtAcq,
    gbv.transferBuildingStdPrice, gbv.acquisitionBuildingStdPrice,
    true,
    "소득세법 시행령 §166⑥ · §176의2② · §163⑥",
    swap, // §97②2호 swap 발동 시 사이드바 표시 정합 (환산 경로 전용)
  );

  return { apportionment, aggregated };
}

// ── 경로 B: 실거래가/감정가 모드 ─────────────────────────────────────

/**
 * 실거래가/감정가 모드 — §166⑥ 비율로 실거래가 안분 + NBL 중과.
 *
 * 취득가액·필요경비를 양도시 기준시가 비율로 토지·건물에 안분.
 * 환산취득가(③ 취득시 기준시가)는 사용하지 않으며 개산공제도 없음.
 */
export function calculateGeneralBuildingActualTransfer(
  payload: GeneralBuildingActualPricePayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const {
    totalTransferPrice, transferDate, acquisitionDate,
    landArea, buildingFootprintArea,
    transferLandPricePerSqm, transferBuildingStdPrice,
    zoneType, isMetropolitan = false, isUnregistered = false,
    actualAcquisitionPrice, actualExpenses,
    acquisitionLandPricePerSqm, acquisitionBuildingStdPrice,
    burdenedGiftInfo,
    houseToCommercialConversion, conversionDate, wasMultiHouseAtConversion,
    acquisitionByInheritance, buildingAcquisitionByInheritance,
    inheritedLandValue, inheritedBuildingValue,
    landAcquisitionCause, decedentAcquisitionDate, donorAcquisitionDate,
  } = payload;

  // §166⑥ 안분 비율
  const landStdAtTransfer = transferLandPricePerSqm * landArea;
  const totalStd = landStdAtTransfer + transferBuildingStdPrice;
  if (totalStd <= 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
    "일반건물(실거래가): 양도시 기준시가 합계가 0이면 안분이 불가합니다.");

  const landRatioNum = landStdAtTransfer / totalStd; // 연속 부동소수 계산용

  // 부담부증여 §159①1호 분기 — 사용자 입력 actualAcquisitionPrice 무시,
  // 자산별 양도가/취득가/개산공제를 채무비율로 환산.
  // §159①1호 단서: "양도가액을 §99 기준시가로 산정한 경우 취득가액도 §99 기준시가로 산정".
  // 부담부증여는 채무액 자체가 양도가액이므로 기준시가 모드와 동치.
  let landTransfer: number;
  let buildingTransfer: number;
  let landAcq: number;
  let buildingAcq: number;
  let landExp: number;
  let buildingExp: number;
  let transferBurdenedGiftBreakdown:
    | import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown
    | undefined;

  if (burdenedGiftInfo) {
    if (!acquisitionLandPricePerSqm || !acquisitionBuildingStdPrice) {
      throw new TaxCalculationError(
        TaxErrorCode.INVALID_INPUT,
        "일반건물 부담부증여(§159①1호): 취득시 토지·건물 기준시가가 필요합니다.",
      );
    }
    const breakdown = buildBurdenedGiftBreakdown({
      landStdPriceAtTransfer: landStdAtTransfer,
      buildingStdPriceAtTransfer: transferBuildingStdPrice,
      landStdPriceAtAcquisition: acquisitionLandPricePerSqm * landArea,
      buildingStdPriceAtAcquisition: acquisitionBuildingStdPrice,
      info: burdenedGiftInfo,
      giftDate: transferDate, // 증여일 = 양도일 (의제)
      // K-4(실지취득가) 실비: actualExpenses(자본적지출+양도비)를 채무비율 안분하여 estimatedDeduction에 반영.
      capitalExpenditure: actualExpenses,
      transferExpense: 0,
    });
    landTransfer = breakdown.perAsset.land.transferPrice;
    buildingTransfer = breakdown.perAsset.building.transferPrice;
    landAcq = breakdown.perAsset.land.acquisitionPrice;
    buildingAcq = breakdown.perAsset.building.acquisitionPrice;
    landExp = breakdown.perAsset.land.estimatedDeduction; // §163⑥ 개산공제 (3%)
    buildingExp = breakdown.perAsset.building.estimatedDeduction;
    transferBurdenedGiftBreakdown = breakdown; // 증여세 통합 결과 포함 — UI 노출용
  } else if (acquisitionByInheritance && buildingAcquisitionByInheritance) {
    // §163⑨ 상속 취득가액 직접 산정 (Phase 1 = C1): 토지·건물 각 상속개시일 평가액을
    // 취득당시 실지거래가액으로 직접 배정. §166⑥ 안분 아님 (KoreanLaw: 상속은 자산별 평가액 명확
    // → "구분 불분명" 요건 미충족). 양도가액만 §166⑥ 안분 유지.
    landTransfer = Math.floor(totalTransferPrice * landRatioNum);
    buildingTransfer = totalTransferPrice - landTransfer;
    landAcq = inheritedLandValue ?? 0;
    buildingAcq = inheritedBuildingValue ?? 0;
    // 필요경비(자본적지출·양도비)는 §166⑥ 비율 안분 유지. 개산공제 아님 —
    // actual 모드는 이미 전 카드 estimatedDeduction:0(§163⑥ 미적용, §163⑨ 정합).
    landExp = Math.floor(actualExpenses * landRatioNum);
    buildingExp = actualExpenses - landExp;
  } else {
    landTransfer = Math.floor(totalTransferPrice * landRatioNum);
    buildingTransfer = totalTransferPrice - landTransfer;
    landAcq = Math.floor(actualAcquisitionPrice * landRatioNum);
    buildingAcq = actualAcquisitionPrice - landAcq;
    landExp = Math.floor(actualExpenses * landRatioNum);
    buildingExp = actualExpenses - landExp;
  }

  // NBL 판정
  let nonBusinessArea = 0;
  let nonBusinessRatio = 0;
  let isWithinNblRatio = true;

  if (isUnregistered) {
    isWithinNblRatio = false;
    nonBusinessArea = landArea;
    nonBusinessRatio = 1;
  } else {
    if (!zoneType) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
      "일반건물(실거래가): zoneType(용도지역)이 필요합니다.");
    const { multiplier } = getLandFootprintMultiplier(
      zoneType as ZoneType, isMetropolitan, "general_building",
    );
    const allowedArea = buildingFootprintArea * multiplier;
    isWithinNblRatio = landArea <= allowedArea;
    nonBusinessArea = Math.max(0, landArea - allowedArea);
    // 표시용 정밀 비율 (round 미사용 — 분할은 면적 직접)
    nonBusinessRatio = landArea > 0 ? nonBusinessArea / landArea : 0;
  }

  // 토지 카드 생성 (초과 시 사업용·비사업용 분할 — 인정면적 직접 안분, round 의존 제거)
  const cards: AssetCardForAggregate[] = [];
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const businessArea = landArea - nonBusinessArea; // 사업용 인정면적 (무허가=0)
    const landBizTransfer = apportionLandByBusinessArea(landTransfer, businessArea, landArea);
    const landBizAcq = apportionLandByBusinessArea(landAcq, businessArea, landArea);
    const landBizExp = apportionLandByBusinessArea(landExp, businessArea, landArea);
    cards.push({
      propertyId: "land_business", propertyLabel: "토지-사업용(1001)", propertyType: "land",
      transferPrice: landBizTransfer, acquisitionPrice: landBizAcq, expenses: landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
    cards.push({
      propertyId: "land_nbl", propertyLabel: "토지-비사업용초과분(1002)", propertyType: "land",
      transferPrice: landTransfer - landBizTransfer,
      acquisitionPrice: landAcq - landBizAcq,
      expenses: landExp - landBizExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate, transferDate, isNonBusinessLand: true,
    } as unknown as AssetCardForAggregate);
  } else {
    cards.push({
      propertyId: "land", propertyLabel: "토지(1001)", propertyType: "land",
      transferPrice: landTransfer, acquisitionPrice: landAcq, expenses: landExp,
      usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
      acquisitionDate, transferDate, isNonBusinessLand: false,
    } as unknown as AssetCardForAggregate);
  }
  cards.push({
    propertyId: "building", propertyLabel: "건물(3001)", propertyType: "general_building_unit",
    transferPrice: buildingTransfer, acquisitionPrice: buildingAcq, expenses: buildingExp,
    usedEstimatedAcquisition: false, estimatedBase: 0, estimatedDeduction: 0,
    acquisitionDate, transferDate, isNonBusinessLand: false,
  } as unknown as AssetCardForAggregate);

  // §95④ 단기보유 기산점 보강 (actual 분기 기존 결측 — 상속·증여 취득원인 + 피상속인/증여자 취득일).
  // 토지 카드는 landAcquisitionCause, 건물 카드는 buildingAcquisitionCause로 buildProperties가 판독.
  for (const c of cards) {
    if (c.propertyType === "land") {
      if (landAcquisitionCause) c.landAcquisitionCause = landAcquisitionCause;
      if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
      if (donorAcquisitionDate) c.donorAcquisitionDate = donorAcquisitionDate;
    } else if (buildingAcquisitionByInheritance) {
      // C1: 건물도 상속 — buildingAcquisitionCause="inheritance" + 피상속인 취득일(동일 피상속인 전제).
      c.buildingAcquisitionCause = "inheritance";
      if (decedentAcquisitionDate) c.decedentAcquisitionDate = decedentAcquisitionDate;
    }
  }

  // 사례 35: 주택→상가 용도변경 — 모든 자산 카드에 일괄 propagate
  if (houseToCommercialConversion) {
    for (const c of cards) {
      c.houseToCommercialConversion = true;
      c.conversionDate = conversionDate;
      c.wasMultiHouseAtConversion = wasMultiHouseAtConversion;
    }
  }

  const properties = buildProperties(cards, nonBusinessRatio);
  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
    },
    rates,
  );

  const apportionment = buildApportionment(
    cards, totalStd, nonBusinessRatio,
    landStdAtTransfer, null,
    transferBuildingStdPrice, null,
    false,
    "소득세법 시행령 §166⑥ · §104의3",
  );

  // UI 자산별 산식 인라인 표시용 — 실가 모드에서도 gbDetail 노출 (사례 35 등).
  // landStdTotal·buildingStdTotal로 §166⑥ 안분 산식 빌더 활성화.
  const acqLandStdTotalActual = acquisitionLandPricePerSqm
    ? Math.floor(acquisitionLandPricePerSqm * landArea)
    : undefined;
  aggregated.generalBuildingValuationDetail = {
    assetCards: cards,
    nonBusinessRatio,
    landStdTotal: landStdAtTransfer,
    buildingStdTotal: transferBuildingStdPrice,
    acqLandStdTotal: acqLandStdTotalActual,
    acqBuilding1StdTotal: acquisitionBuildingStdPrice ?? undefined,
    bundledActualAcquisitionPrice: actualAcquisitionPrice ?? undefined,
    bundledActualExpenses: actualExpenses ?? undefined,
    // §163⑨ 상속 취득가액 직접 산정 echo (결과 카드 라벨 분기용).
    ...(acquisitionByInheritance ? { acquisitionByInheritance } : {}),
    ...(buildingAcquisitionByInheritance ? { buildingAcquisitionByInheritance } : {}),
  } as GeneralBuildingOutput;

  return { apportionment, aggregated, transferBurdenedGiftBreakdown };
}
