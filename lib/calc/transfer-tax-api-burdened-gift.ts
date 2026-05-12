/**
 * 부담부증여(burdened gift) API 변환 헬퍼.
 *
 * AssetForm의 bg* 필드 + gb* 자산별 기준시가 필드 → 엔진 BurdenedGiftInfo로 변환.
 * 14개 동기화 지점 ⑬ — callTransferTaxAPI body spread (TypeScript 미감지 영역).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface BurdenedGiftInfoPayload {
  valuationMode: "sangjeungbeop_standard" | "sangjeungbeop_market";
  lendingDepositTotal: number;
  mortgageDebtAmount: number;
  annualRentTotal: number;
  mortgageSetAmount?: number;
  marketValueAtTransfer?: number;
  marketValueAtAcquisition?: number;
  landStdPriceAtTransfer: number;
  buildingStdPriceAtTransfer: number;
  landStdPriceAtAcquisition: number;
  buildingStdPriceAtAcquisition: number;
}

/**
 * Phase 1: propertyType === "general_building" 한정 — 토지·건물 기준시가는 gb* 필드에서 도출.
 * acquisitionCause === "burdened_gift" + assetKind === "general_building" 시에만 호출.
 */
export function buildBurdenedGiftInfo(primary: AssetForm): BurdenedGiftInfoPayload {
  const landArea = parseFloat(primary.gbLandArea) || 0;
  const landStdAtTransfer = (parseAmount(primary.gbTransferLandPricePerSqm) || 0) * landArea;
  const landStdAtAcquisition = (parseAmount(primary.gbAcqLandPricePerSqm) || 0) * landArea;
  return {
    valuationMode: primary.bgValuationMode || "sangjeungbeop_standard",
    lendingDepositTotal: parseAmount(primary.bgLendingDepositTotal) || 0,
    mortgageDebtAmount: parseAmount(primary.bgMortgageDebtAmount) || 0,
    annualRentTotal: parseAmount(primary.bgAnnualRentTotal) || 0,
    mortgageSetAmount: primary.bgMortgageSetAmount
      ? parseAmount(primary.bgMortgageSetAmount)
      : undefined,
    marketValueAtTransfer: primary.bgMarketValueAtTransfer
      ? parseAmount(primary.bgMarketValueAtTransfer)
      : undefined,
    marketValueAtAcquisition: primary.bgMarketValueAtAcquisition
      ? parseAmount(primary.bgMarketValueAtAcquisition)
      : undefined,
    landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
    buildingStdPriceAtTransfer: parseAmount(primary.gbTransferBuildingValue) || 0,
    landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
    buildingStdPriceAtAcquisition: parseAmount(primary.gbAcqBuildingValue) || 0,
  };
}
