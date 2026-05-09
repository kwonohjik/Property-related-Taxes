/**
 * 일반건물(토지+건물 일괄) 환산취득가 라우트 헬퍼.
 *
 * 시행령 §166⑥(양도가 안분) + §176의2④(자산별 환산) + §163⑥(자산별 개산공제) + §102②(1차 통산).
 * 사용자는 단건으로 입력하지만 엔진 내부에서 토지·건물 2자산으로 분해 후 aggregate.
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
import type { TaxRatesMap } from "@/lib/db/tax-rates";

/** 라우트가 받는 valuation payload (Zod 통과 후 + Date 변환 포함). */
export type GeneralBuildingValuationPayload = GeneralBuildingInput;

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
    usedEstimatedAcquisition: true;
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

/**
 * 일반건물 단건 입력 → 토지·건물 2자산 aggregate 결과 + UI 호환 안분 결과.
 *
 * @param gbv  Zod 검증·Date 변환을 마친 generalBuildingValuation 페이로드
 * @param taxYear  과세연도 (양도일 연도)
 * @param annualBasicDeductionUsed  연중 사용한 기본공제 누계
 * @param priorReductionUsage  연중 사용한 감면 누계
 * @param rates  세율 맵
 */
export function calculateGeneralBuildingTransfer(
  gbv: GeneralBuildingValuationPayload,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const gbOut = buildGeneralBuildingAssetCards(gbv);

  // TransferTaxItemInput 필수 필드 모두 채움.
  // 환산취득가는 buildGeneralBuildingAssetCards에서 이미 산정 완료 → aggregate에는 "일반 모드(실가)"로
  // acquisitionPrice = 환산값, expenses = 개산공제로 단순 차감. useEstimatedAcquisition: false 고정
  // (true 시 엔진이 환산을 재시도 → 취득가액 0 표시 버그). estimatedBase·estimatedDeduction은 결과 표시용.
  // 일반건물은 1세대1주택·조정대상지역 비과세/중과 미해당 → 모두 false 고정.
  const properties: TransferTaxItemInput[] = gbOut.assetCards.map((card) => ({
    propertyId: card.propertyId,
    propertyLabel: card.propertyLabel,
    propertyType: card.propertyType,
    transferPrice: card.transferPrice,
    acquisitionPrice: card.acquisitionPrice,
    expenses: card.expenses,
    transferDate: card.transferDate,
    acquisitionDate: card.acquisitionDate,
    useEstimatedAcquisition: false,
    usedEstimatedAcquisition: true,
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

  const totalStandardAtTransfer =
    gbv.transferLandPricePerSqm * gbv.landArea + gbv.transferBuildingStdPrice;

  // 토지 기준시가 합계 (안분 분모 — land_business + land_nbl 합산)
  const landStdAtTransfer = gbv.transferLandPricePerSqm * gbv.landArea;
  const landStdAtAcq = gbv.acquisitionLandPricePerSqm * gbv.landArea;

  const apportionment: BundledLikeApportionmentResult = {
    apportioned: gbOut.assetCards.map((card) => {
      const isLandCard = card.propertyType === "land";
      // land_business + land_nbl 분할 시 각 카드 비율로 기준시가 안분
      const landRatio = gbOut.nonBusinessRatio > 0 && isLandCard
        ? (card.propertyId === "land_business"
          ? (1 - gbOut.nonBusinessRatio)
          : gbOut.nonBusinessRatio)
        : 1;
      const stdAtTransfer = isLandCard ? landStdAtTransfer * landRatio : gbv.transferBuildingStdPrice;
      const stdAtAcq = isLandCard ? landStdAtAcq * landRatio : gbv.acquisitionBuildingStdPrice;
      return {
        assetId: card.propertyId,
        assetLabel: card.propertyLabel,
        assetKind: isLandCard ? "land" : "building",
        allocatedSalePrice: card.transferPrice,
        allocatedAcquisitionPrice: card.acquisitionPrice,
        allocatedExpenses: card.expenses,
        displayRatio: stdAtTransfer / totalStandardAtTransfer,
        standardPriceAtTransfer: stdAtTransfer,
        standardPriceAtAcquisition: stdAtAcq,
        saleMode: "apportioned",
        usedEstimatedAcquisition: true,
      };
    }),
    totalStandardAtTransfer,
    residualAbsorbedBy: gbOut.assetCards[0]?.propertyId ?? null,
    legalBasis: "소득세법 시행령 §166⑥ · §176의2④ · §163⑥",
    warnings: [],
  };

  return { apportionment, aggregated };
}
