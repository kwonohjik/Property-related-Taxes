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
import { SHARE_ID_SEPARATOR, baseCardId } from "@/lib/tax-engine/general-building-share-id";

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

/**
 * 지분 접미사 규약은 **`lib/tax-engine/general-building-share-id.ts`가 정본**이다.
 * 여기서 재수출하는 것은 하위 호환용 — 새 소비자는 leaf에서 직접 import할 것.
 */
export { SHARE_ID_SEPARATOR, baseCardId };

/**
 * §104③ 미등기양도자산 — **토지·건물 각각**의 판정 결과.
 *
 * 일반건물은 두 부동산이 별개 등기부를 가지므로 축이 둘이다. 증축분(건물2 카드)은 건물 축을
 * 따른다(민법 §256 부합 — 표시변경등기이지 별도 소유권보존등기가 아니다).
 */
export interface GbUnregisteredAxes {
  land?: boolean;
  building?: boolean;
}

export function buildProperties(
  cards: AssetCardForAggregate[],
  nonBusinessRatio: number,
  swap?: GeneralBuildingSwapDecision,
  unregistered?: GbUnregisteredAxes,
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
      /**
       * §104③ 미등기양도자산 — **카드가 속한 부동산의 축**을 싣는다.
       *
       * 종전에는 `false` 하드코딩이라 폼에서 미등기를 켜도 엔진에 도달하지 못했다(세액 변화 0).
       * 토지·건물이 별개 등기부를 갖는 이상 자산 단위 단일 플래그로는 표현할 수 없어 축을 둘로
       * 나눴다 — `land_business`·`land_nbl`은 토지 축, `building1`·`building2`(증축)는 건물 축.
       *
       * 이 값이 `classifyRateGroup`(`transfer-tax-aggregate-helpers.ts:61`)의 최우선 분기라
       * 한쪽만 미등기면 그 카드만 §104①10호(70%) 버킷으로 갈린다.
       */
      isUnregistered: (isBuilding ? unregistered?.building : unregistered?.land) ?? false,
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
      // 🆕 건물 이월과세 (§97의2① 「토지·건물」) — 토지와 같은 축으로 넘긴다.
      //    ⚠️ 위 `isBuilding` 분기는 `acquisitionCause`·decedent/donor만 넘겨서
      //       여기서 별도로 싣지 않으면 **엔진 카드에는 있는데 단건 input에서 사라진다**(⑭ 침묵 strip).
      ...(isBuilding && card.carryoverTaxation
        ? { carryoverTaxation: card.carryoverTaxation }
        : {}),
      /**
       * 🔴 **환산 모드 이월과세의 분자·분모** (설계 D9-8).
       *
       * `calcCarryoverScenarios`는 `standardPriceAtAcquisition ÷ standardPriceAtTransfer`로
       * 환산하는데, 종전에는 GB 카드에 두 값이 **없어 취득가액이 0**이 됐다
       * (실측 43,470,000원 과대 + 비교과세가 그 틀린 A를 채택).
       *
       * 분자는 사용자 입력(증여자 취득 당시), **분모는 그 파트의 양도 당시 기준시가**로
       * 엔진이 아는 값을 쓴다 — 사용자에게 받으면 화면 산식과 계산이 갈린다.
       */
      ...(card.carryoverTaxation?.useEstimatedAcquisition &&
      card.carryoverDonorStandardPriceAtAcquisition !== undefined &&
      card.standardPriceAtTransferForCarryover !== undefined
        ? {
            standardPriceAtAcquisition: card.carryoverDonorStandardPriceAtAcquisition,
            standardPriceAtTransfer: card.standardPriceAtTransferForCarryover,
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
      // 지분 분할 카드는 `land_business#0` 꼴이라 **접미사를 벗기고** 비교해야 한다.
      const landRatio = nonBusinessRatio > 0 && isLandCard
        ? (baseCardId(card.propertyId) === "land_business" ? (1 - nonBusinessRatio) : nonBusinessRatio)
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
