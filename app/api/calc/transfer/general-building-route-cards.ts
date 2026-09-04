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
import type { TransferReduction } from "@/lib/tax-engine/transfer-tax";
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

/**
 * 자산-수준 입력 중 **카드 조립 이후 단계**가 소비하는 것들 (F17, 2026-08-23).
 *
 * 종전에는 `dispatchGeneralBuilding`의 위치 인자를 늘려 왔는데 이미 12개라 새 값을 더하면
 * 호출부에서 순서를 틀리기 쉽다. 이 묶음은 **카드 배열이 아니라 신고 전체**에 걸리는 값이라
 * 성격도 다르다.
 */
export interface GbAssetLevelInputs {
  /** 조특법 감면 (⑭ Date 변환 완료본). 카드마다 실린다 — `buildProperties` 참조. */
  reductions?: TransferReduction[];
  /** 신고서 단위 신고불성실 가산세 (국세기본법 §47의2·§47의3). */
  filingPenaltyDetails?: import("@/lib/tax-engine/types/transfer.types").TransferTaxInput["filingPenaltyDetails"];
  /** 신고서 단위 납부지연 가산세 (국세기본법 §47의4). */
  delayedPaymentDetails?: import("@/lib/tax-engine/types/transfer.types").TransferTaxInput["delayedPaymentDetails"];
  /**
   * 배우자등 이월과세 (「소득세법」 §97의2) — **부담부증여 §159 분기 전용**(F27).
   *
   * 비-부담부증여 일반건물은 이 값을 쓰지 않는다 — 그쪽은 카드에 실린
   * `landCarryoverTaxation`·`buildingCarryoverTaxation`을 **단건 엔진**이 파트별로 처리한다
   * (④ `buildGbCarryoverPayload`가 부담부증여에서 `{}`를 반환해 두 줄기가 겹치지 않는다).
   */
  carryoverTaxation?: import("@/lib/tax-engine/types/transfer.types").TransferTaxInput["carryoverTaxation"];
  /**
   * 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2).
   *
   * ⚠️ **카드마다 실으면 안 된다** — 정정은 **신고 1건에 1회**다.
   * `filingPenaltyDetails`·`delayedPaymentDetails`와 **같은 성격**이며,
   * 엔진도 top-level에서 1회만 소비한다(`transfer-tax-aggregate.ts:386`).
   * 자산별로 흘러들지 않도록 aggregate가 `:163`에서 per-asset amendment를 strip한다.
   */
  amendment?: import("@/lib/tax-engine/types/transfer-amendment.types").AmendmentInput;
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

/**
 * 자산-수준 조특법 감면 — **카드마다 같은 배열을 싣는다**(F17, 2026-08-23).
 *
 * ## 왜 카드마다인가
 *
 * 일반건물은 하나의 자산이지만 엔진에는 토지·비사토·건물1·건물2 **카드**로 들어간다.
 * 감면은 카드별 양도소득금액에서 계산되고, `calculateTransferTaxAggregate`가
 * 유형별로 합산한 뒤 **조특법 §133② 한도를 집계 단계에서 1회** 적용한다
 * (`aggregate-reduction-limits.ts`). ⇒ 같은 배열을 4장에 실어도 한도가 4배가 되지 않는다.
 *
 * §77·§77의2의 감면율은 **보상액 비율**로만 결정되고 금액은 각 카드의 양도소득금액에서
 * 안분되므로(`public-expropriation-reduction.ts` ①), 카드마다 실어도 이중계상이 아니다.
 *
 * ## 종전 결함 (리뷰 F17)
 *
 * 여기가 `reductions: []` **하드코딩**이라, 폼에서 §77 공익수용을 선택해도 세액이 1원도
 * 바뀌지 않았다(실측 결정세액 204,930,000 → 204,930,000 · `reductionAmount` 0).
 * 클라이언트는 자산 종류와 무관하게 `reductions`를 싣고 Zod도 받으며 validate도 통과시켜,
 * 「입력은 되는데 침묵 무시」 상태였다. **같은 파일이 같은 모양의 결함을 이미 한 번 고쳤다** —
 * 바로 위 `isUnregistered`의 `false` 하드코딩이다.
 */
/**
 * 🔑 **겸용 파트 카드도 같은 규칙을 쓴다** — 그래서 `export`한다(복제 금지).
 *    겸용은 주택건물·상가건물이 `isBuilding`이다.
 */
export function reductionsForCard(
  reductions: TransferReduction[] | undefined,
  isBuilding: boolean,
): TransferReduction[] {
  if (!reductions || reductions.length === 0) return [];
  if (!isBuilding) return reductions;
  /**
   * 🔑 **§77의3은 건물 파트에서 뺀다** — 매수 경로가 대상 범위를 가르기 때문이다.
   *
   * 조특법 §77의3①은 「해당 **토지등**을 같은 법 **제17조**에 따른 토지매수의 청구 또는
   * 같은 법 **제20조**에 따른 협의매수를 통하여 … 양도함으로써 발생하는 소득」이라고
   * 두 경로를 병렬 열거하는데, 「개발제한구역의 지정 및 관리에 관한 특별조치법」에서
   * 두 경로의 대상이 다르다:
   *
   * · §17① — 「… 그 효용이 현저히 감소된 토지나 … 사실상 불가능하게 된 토지
   *   (이하 "**매수대상토지**"라 한다)」 ⇒ **토지만**
   * · §20① — 「개발제한구역의 **토지와 그 토지의 정착물**(이하 "토지등"이라 한다)」
   *   ⇒ 토지 + **건물**
   *
   * ⇒ **`purchaseRoute`(①의 §17/§20 축)가 건물 파트의 포함 여부를 가른다.**
   * `claim`(§17)일 때만 건물 파트에서 뺀다. `negotiated`(§20)·②(해제 후 공익사업법 협의매수·
   * 수용)는 「토지등」이라 건물분도 대상이다.
   *
   * ⚠️ 축이 없던 때(F17-A)는 **무조건 제외**였다 — 근거 없이 건물분까지 감면하는 것보다
   *    입증된 범위로 좁히는 쪽이 맞았기 때문이다. 축이 생긴 지금은 §20 납세자의 건물분을
   *    부당하게 깎지 않는다. `purchaseRoute` 미상(②가 아닌데 값이 없음)은 ⑧이 차단하므로
   *    여기 도달하지 않지만, 도달하면 **좁은 쪽(제외)** 으로 남긴다.
   */
  return reductions.filter(
    (r) => !(r.type === "gb_designated_land" && r.branch === "in_zone" && r.purchaseRoute !== "negotiated"),
  );
}

export function buildProperties(
  cards: AssetCardForAggregate[],
  nonBusinessRatio: number,
  swap?: GeneralBuildingSwapDecision,
  unregistered?: GbUnregisteredAxes,
  /** 자산-수준 조특법 감면 (⑭ Date 변환 완료본 — `mapReductionsToEngine` 출력). */
  reductions?: TransferReduction[],
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
      reductions: reductionsForCard(reductions, isBuilding),
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
  /**
   * 증축분(건물2) 기준시가 — **증축 케이스에서만** 전달한다.
   *
   * 🔴 미전달이면 건물2 카드가 건물1 값을 그대로 쓴다(2026-08-12 사용자 지적 전까지의 동작).
   *    카드 분류가 `propertyType === "land"` **2분류**뿐이라 건물1·건물2가 같은 슬롯에
   *    떨어졌기 때문이다 — 화면에 증축건물(3002) 기준시가가 건물(3001)과 같은 값으로 뜨고,
   *    호출부의 `totalStd`에도 증축분이 빠져 **비율 합이 100%를 넘었다**(실측 102.29%).
   *
   * ⚠️ 세액에는 영향이 없다 — `allocatedSalePrice`는 엔진 카드(`card.transferPrice`)를
   *    그대로 싣고, 그 값은 §166⑥ 3-way 안분으로 이미 정확히 계산돼 있다. 표시 전용 결함이다.
   */
  extensionStdAtTransfer?: number,
  extensionStdAtAcq?: number,
): BundledLikeApportionmentResult {
  return {
    apportioned: cards.map((card) => {
      const isLandCard = card.propertyType === "land";
      // 지분 분할 카드는 `land_business#0` 꼴이라 **접미사를 벗기고** 비교해야 한다.
      const landRatio = nonBusinessRatio > 0 && isLandCard
        ? (baseCardId(card.propertyId) === "land_business" ? (1 - nonBusinessRatio) : nonBusinessRatio)
        : 1;
      /* 증축분(건물2)은 건물1과 **다른 기준시가**를 쓴다 — 종전에는 `isLandCard` 2분류라
         둘이 같은 슬롯에 떨어졌다(위 `extensionStdAtTransfer` 주석). 지분 분할 카드는
         `building2#0` 꼴이라 접미사를 벗기고 비교한다(`land_business`와 같은 규칙). */
      const isExtensionCard = baseCardId(card.propertyId) === "building2";
      const stdAtTransfer = isLandCard
        ? landStdAtTransfer * landRatio
        : isExtensionCard
          ? (extensionStdAtTransfer ?? 0)
          : buildingStdAtTransfer;
      const stdAtAcq = isLandCard
        ? (landStdAtAcq !== null ? landStdAtAcq * landRatio : 0)
        : isExtensionCard
          ? (extensionStdAtAcq ?? 0)
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
