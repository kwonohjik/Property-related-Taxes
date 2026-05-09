/**
 * 일반건물(토지+건물 일괄) 라우트 헬퍼.
 *
 * 두 경로 지원:
 * A. 환산취득가 모드: §166⑥(양도가 안분) + §176의2④(환산) + §163⑥(개산공제) + §102②(1차 통산)
 * B. 실거래가/감정가 모드: §166⑥(비율 안분) + 실거래 취득가액 비율 분할 + NBL 중과
 *
 * route.ts 800줄 분할 정책에 따라 추출.
 */

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
  return cards.map((card) => ({
    propertyId: card.propertyId,
    propertyLabel: card.propertyLabel,
    propertyType: card.propertyType,
    transferPrice: card.transferPrice,
    acquisitionPrice: card.acquisitionPrice,
    expenses: card.expenses,
    transferDate: card.transferDate,
    acquisitionDate: card.acquisitionDate,
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
  } as unknown as TransferTaxItemInput));
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
  if (gbRaw.actualPriceMode === true) {
    return calculateGeneralBuildingActualTransfer(
      {
        totalTransferPrice, transferDate, acquisitionDate,
        landArea: gbRaw.landArea as number,
        buildingFootprintArea: gbRaw.buildingFootprintArea as number,
        transferLandPricePerSqm: gbRaw.transferLandPricePerSqm as number,
        transferBuildingStdPrice: gbRaw.transferBuildingStdPrice as number,
        zoneType: gbRaw.zoneType as string | undefined,
        isMetropolitan: gbRaw.isMetropolitan as boolean | undefined,
        isUnregistered: gbRaw.isUnregistered as boolean | undefined,
        actualAcquisitionPrice,
        actualExpenses,
      },
      taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
    );
  }
  return calculateGeneralBuildingTransfer(
    {
      ...(gbRaw as unknown as Omit<GeneralBuildingValuationPayload, "totalTransferPrice" | "transferDate" | "acquisitionDate">),
      totalTransferPrice, transferDate, acquisitionDate,
    },
    taxYear, annualBasicDeductionUsed, priorReductionUsage, rates,
  );
}

// ── 경로 A: 환산취득가 모드 ────────────────────────────────────────────

/**
 * 환산취득가 모드 — 토지·건물 2자산 aggregate.
 * @param gbv  Zod 검증·Date 변환 완료 payload
 */
export function calculateGeneralBuildingTransfer(
  gbv: GeneralBuildingValuationPayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const gbOut = buildGeneralBuildingAssetCards(gbv);
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
    "소득세법 시행령 §166⑥ · §176의2④ · §163⑥",
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
