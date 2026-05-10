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
  type GeneralBuildingInput,
} from "@/lib/tax-engine/general-building-valuation";
import { getLandFootprintMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";

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
}

// ── 공통 헬퍼 ──────────────────────────────────────────────────────────

function buildProperties(
  cards: AssetCardForAggregate[],
  nonBusinessRatio: number,
): TransferTaxItemInput[] {
  return cards.map((card) => {
    const isBuilding = card.propertyType === "general_building_unit";
    return {
      propertyId: card.propertyId,
      propertyLabel: card.propertyLabel,
      propertyType: card.propertyType,
      transferPrice: card.transferPrice,
      acquisitionPrice: card.acquisitionPrice,
      expenses: card.expenses,
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
      return {
        assetId: card.propertyId,
        assetLabel: card.propertyLabel,
        assetKind: isLandCard ? "land" : "building",
        allocatedSalePrice: card.transferPrice,
        allocatedAcquisitionPrice: card.acquisitionPrice,
        allocatedExpenses: card.expenses,
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

  const coercedGbRaw: Record<string, unknown> = {
    ...gbRaw,
    ...(buildingAcqDate ? { buildingAcquisitionDate: buildingAcqDate } : {}),
    isSelfBuilt,                         // boolean 도출 (gbRaw의 isSelfBuilt 덮어씀)
    buildingAcquisitionCause: buildingAcqCause,
    ...(decedentAcqDate ? { decedentAcquisitionDate: decedentAcqDate } : {}),
    ...(donorAcqDate ? { donorAcquisitionDate: donorAcqDate } : {}),
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
      },
      taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
    );
  }
  return calculateGeneralBuildingTransfer(
    {
      ...(coercedGbRaw as unknown as Omit<GeneralBuildingValuationPayload, "totalTransferPrice" | "transferDate" | "acquisitionDate">),
      totalTransferPrice, transferDate, acquisitionDate,
    },
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
  const properties = buildProperties(gbOut.assetCards, gbOut.nonBusinessRatio);

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

  const landStdAtTransfer = gbv.transferLandPricePerSqm * gbv.landArea;
  const landStdAtAcq = gbv.acquisitionLandPricePerSqm * gbv.landArea;
  const totalStd = landStdAtTransfer + gbv.transferBuildingStdPrice;

  const apportionment = buildApportionment(
    gbOut.assetCards, totalStd, gbOut.nonBusinessRatio,
    landStdAtTransfer, landStdAtAcq,
    gbv.transferBuildingStdPrice, gbv.acquisitionBuildingStdPrice,
    true,
    "소득세법 시행령 §166⑥ · §176의2② · §163⑥",
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
  } = payload;

  // §166⑥ 안분 비율
  const landStdAtTransfer = transferLandPricePerSqm * landArea;
  const totalStd = landStdAtTransfer + transferBuildingStdPrice;
  if (totalStd <= 0) throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT,
    "일반건물(실거래가): 양도시 기준시가 합계가 0이면 안분이 불가합니다.");

  const landRatioNum = landStdAtTransfer / totalStd; // 연속 부동소수 계산용

  const landTransfer = Math.floor(totalTransferPrice * landRatioNum);
  const buildingTransfer = totalTransferPrice - landTransfer;
  const landAcq = Math.floor(actualAcquisitionPrice * landRatioNum);
  const buildingAcq = actualAcquisitionPrice - landAcq;
  const landExp = Math.floor(actualExpenses * landRatioNum);
  const buildingExp = actualExpenses - landExp;

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
    nonBusinessRatio = landArea > 0
      ? Math.round((nonBusinessArea / landArea) * 10000) / 10000
      : 0;
  }

  // 토지 카드 생성 (초과 시 사업용·비사업용 분할)
  const cards: AssetCardForAggregate[] = [];
  if (!isWithinNblRatio && nonBusinessRatio > 0) {
    const businessRatio = 1 - nonBusinessRatio;
    const landBizTransfer = Math.floor(landTransfer * businessRatio);
    const landBizAcq = Math.floor(landAcq * businessRatio);
    const landBizExp = Math.floor(landExp * businessRatio);
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

  return { apportionment, aggregated };
}
