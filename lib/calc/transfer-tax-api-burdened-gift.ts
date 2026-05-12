/**
 * 부담부증여(burdened gift) API 변환 헬퍼.
 *
 * AssetForm의 bg* 필드 + propertyType별 기준시가 필드 → 엔진 BurdenedGiftInfo로 변환.
 * 14개 동기화 지점 ⑬ — callTransferTaxAPI body spread (TypeScript 미감지 영역).
 *
 * Phase 2 (2026-05-12): assetKind 분기로 housing·land·building·general_building 4종 지원.
 * 근거: 디자인 문서 `transfer-tax-burdened-gift-phase2.engine.design.md` Step 2.5.
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
  /** 증여재산 평가용 양도시 건물 기준시가 (상증법 §61 — 층별 가감율 적용). */
  giftBuildingStdPriceAtTransfer?: number;
  // Phase 3: 증여세 통합 입력
  donorRelation?:
    | "spouse"
    | "lineal_ascendant_adult"
    | "lineal_ascendant_minor"
    | "lineal_descendant"
    | "other_relative";
  isMinorDonee?: boolean;
  isGenerationSkip?: boolean;
  isFiledOnTime?: boolean;
  priorGiftsWithin10Years?: Array<{
    giftDate: string;
    giftAmount: number;
    giftTaxPaid: number;
  }>;
  /** 양도시 토지 기준시가 (housing·building 시 0, 합산은 land+building) */
  landStdPriceAtTransfer: number;
  /** 양도시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtTransfer: number;
  /** 취득시 토지 기준시가 (A 산정용 — §159①1호 괄호 단서 기준시가 모드) */
  landStdPriceAtAcquisition: number;
  /** 취득시 건물 기준시가. housing 시 주택 단일 공시가격 통째로. land 시 0. */
  buildingStdPriceAtAcquisition: number;
}

/**
 * Phase 2: assetKind 분기로 propertyType별 기준시가 도출.
 * - general_building: gb* 필드 (토지/건물 분리)
 * - housing/building: standardPriceAtTransfer / standardPriceAtAcq (단일 공시가격)
 * - land: standardPriceAtTransfer / standardPriceAtAcq 또는 개별공시지가×면적
 *
 * 호출 조건: primary.transferType === "burdened_gift" (acquisitionCause === "burdened_gift" 레거시도 normalize에서 이전됨)
 */
export function buildBurdenedGiftInfo(primary: AssetForm): BurdenedGiftInfoPayload {
  const common = {
    valuationMode: (primary.bgValuationMode || "sangjeungbeop_standard") as
      | "sangjeungbeop_standard"
      | "sangjeungbeop_market",
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
    // 증여재산 평가용 건물 기준시가 (층별 가감율 적용 — 미입력 시 양도세용 값 fallback)
    giftBuildingStdPriceAtTransfer: primary.bgGiftBuildingStdPriceAtTransfer
      ? parseAmount(primary.bgGiftBuildingStdPriceAtTransfer)
      : undefined,
    // Phase 3: 증여세 통합 입력 (빈 문자열·미선택 시 undefined로 → 엔진 default 사용)
    donorRelation: primary.bgDonorRelation ? primary.bgDonorRelation : undefined,
    isMinorDonee: primary.bgIsMinorDonee || undefined,
    isGenerationSkip: primary.bgIsGenerationSkip || undefined,
    isFiledOnTime: primary.bgIsFiledOnTime === false ? false : undefined,
    // Phase 3 후속: 10년 이내 사전증여 (giftDate·giftAmount 필수, giftTaxPaid 0 허용)
    priorGiftsWithin10Years:
      primary.bgPriorGifts && primary.bgPriorGifts.length > 0
        ? primary.bgPriorGifts
            .filter((p) => p.giftDate && parseAmount(p.giftAmount) > 0)
            .map((p) => ({
              giftDate: p.giftDate,
              giftAmount: parseAmount(p.giftAmount) || 0,
              giftTaxPaid: parseAmount(p.giftTaxPaid) || 0,
            }))
        : undefined,
  };

  // ── general_building: 사례 34 패턴 (Phase 1 그대로) ──
  if (primary.assetKind === "general_building") {
    const landArea = parseFloat(primary.gbLandArea) || 0;
    const landStdAtTransfer = (parseAmount(primary.gbTransferLandPricePerSqm) || 0) * landArea;
    const landStdAtAcquisition = (parseAmount(primary.gbAcqLandPricePerSqm) || 0) * landArea;
    return {
      ...common,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: parseAmount(primary.gbTransferBuildingValue) || 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: parseAmount(primary.gbAcqBuildingValue) || 0,
    };
  }

  // ── land: 토지만 (개별공시지가 × 면적 또는 standardPriceAt*) ──
  if (primary.assetKind === "land") {
    // standardPriceAtTransfer 가 입력되어 있으면 우선 사용 (사용자 명시 입력)
    // 그 외 standardPricePerSqmAt* × 면적으로 자동 계산
    const transferArea = parseFloat(primary.transferArea) || 0;
    const acqArea = parseFloat(primary.acquisitionArea) || 0;
    const landStdAtTransfer =
      parseAmount(primary.standardPriceAtTransfer) ||
      (parseAmount(primary.standardPricePerSqmAtTransfer) || 0) * transferArea;
    const landStdAtAcquisition =
      parseAmount(primary.standardPriceAtAcq) ||
      (parseAmount(primary.standardPricePerSqmAtAcq) || 0) * acqArea;
    return {
      ...common,
      landStdPriceAtTransfer: Math.floor(landStdAtTransfer),
      buildingStdPriceAtTransfer: 0,
      landStdPriceAtAcquisition: Math.floor(landStdAtAcquisition),
      buildingStdPriceAtAcquisition: 0,
    };
  }

  // ── housing / building / commercial_building: 단일 공시가격(주택공시가격·건물기준시가·호별고시가 통합) ──
  // 토지·건물 분리 없이 buildingStdPrice 자리에 통째로 넣어 엔진 sum에서 그대로 사용.
  // F-3 (2026-05-12): commercial_building도 단일 기준시가 fallback 패턴 적용.
  //   cb*·호별고시가는 환산취득가(useEstimatedAcquisition) 전용 — 부담부증여 모드에서는 사용자가
  //   standardPriceAtTransfer / standardPriceAtAcq에 상증법 §61 평가액 직접 입력.
  return {
    ...common,
    landStdPriceAtTransfer: 0,
    buildingStdPriceAtTransfer: parseAmount(primary.standardPriceAtTransfer) || 0,
    landStdPriceAtAcquisition: 0,
    buildingStdPriceAtAcquisition: parseAmount(primary.standardPriceAtAcq) || 0,
  };
}
