/**
 * 일반건물 라우트 — **카드 → 엔진 input / 사이드바 표시** 변환 (공통 헬퍼).
 *
 * `general-building-route-helper.ts` 800줄 정책 분리(2026-08-06). 환산 경로(A)와 실가 경로(B)가
 * **함께** 쓰는 두 함수만 담는다 — 그래서 두 경로 파일이 서로를 import하지 않아도 된다(순환 회피).
 *
 * ⚠️ 두 함수는 **같은 swap 규칙**을 적용해야 한다. `buildProperties`는 세액을, `buildApportionment`는
 *    화면 표시를 만드는데 규칙이 갈리면 「표시와 계산이 다른」 상태가 된다
 *    (메모리 `feedback_engine_result_display_drift`).
 */
import type {
  TransferTaxItemInput,
  AggregateTransferResult,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingSwapDecision } from "@/lib/tax-engine/general-building-swap";

export interface BundledLikeApportionmentResult {
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

export function buildProperties(
  cards: AssetCardForAggregate[],
  nonBusinessRatio: number,
  swap?: GeneralBuildingSwapDecision,
): TransferTaxItemInput[] {
  return cards.map((card) => {
    const isBuilding = card.propertyType === "general_building_unit";
    // §97②2호 단서 swap: 배분된 카드는 환산취득가 미차감(0)·필요경비=배분나목.
    // (단건 엔진 actual 모드에서 acqCost=0, expensesApplied=expenses → gain=양도가−배분나목.)
    const swapNabok = swap?.allocation.get(card.propertyId);
    const isSwapCard = swapNabok !== undefined;
    /**
     * 실가 파트 자본적지출 **가산** — §97②**1호**는 택일이 아니라
     * 「해당 실지거래가액 + 제1항제2호·제3호의 금액」이다(O-1). 환산 파트는 여기 오지 않는다.
     */
    const directAddition = swap?.addition.get(card.propertyId) ?? 0;
    return {
      propertyId: card.propertyId,
      propertyLabel: card.propertyLabel,
      propertyType: card.propertyType,
      transferPrice: card.transferPrice,
      acquisitionPrice: isSwapCard ? 0 : card.acquisitionPrice,
      expenses: isSwapCard ? swapNabok : card.expenses + directAddition,
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
      // 단건/aggregate 엔진의 단기보유 기산점 분기(「소득세법」 제104조 제2항 — 상속은
      // 피상속인 취득일, §97의2① 이월과세는 증여자 취득일)에 사용.
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

export function buildApportionment(
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
      // 실가 파트 가산분(§97②1호) — buildProperties와 같은 규칙(표시↔엔진 드리프트 금지).
      const directAddition = swap?.addition.get(card.propertyId) ?? 0;
      return {
        assetId: card.propertyId,
        assetLabel: card.propertyLabel,
        assetKind: isLandCard ? "land" : "building",
        allocatedSalePrice: card.transferPrice,
        allocatedAcquisitionPrice: isSwapCard ? 0 : card.acquisitionPrice,
        allocatedExpenses: isSwapCard ? swapNabok : card.expenses + directAddition,
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
