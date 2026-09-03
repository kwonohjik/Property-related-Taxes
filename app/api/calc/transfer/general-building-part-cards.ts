/**
 * 일반건물(토지+건물 일괄) — **파트 카드 빌더 단일 소스**.
 *
 * 「양도가액 하나를 받아 토지·건물(+증축) 카드로 나눈다」는 규칙은 두 호출부가 공유한다:
 *
 * | 호출부 | 넘기는 양도가액 |
 * |---|---|
 * | 축 B 지분 분할 (`general-building-fractional.ts`) | 총계약가 × 지분율 |
 * | 컴패니언 함께양도 (`bundled-split-helpers.ts`) | 5-a가 §166⑥ 키로 안분한 그 자산의 몫 |
 *
 * 🔑 **2단 안분이다.** 자산 간 안분(5-a 또는 지분율)은 호출부가 하고, **자산 안에서
 *    토지·건물로 나누는 분모**(양도시 토지 기준시가 + 건물 기준시가 + 증축 기준시가)는
 *    이 함수가 부르는 GB 엔진이 정한다. 두 호출부가 같은 함수를 쓰므로 경로에 따라
 *    같은 물건이 다른 값이 되는 일이 없다.
 *
 * ⚠️ 종전에는 이 함수가 `general-building-fractional.ts`의 **비공개 지역 함수**였다.
 *    컴패니언 축을 열면서 복제하지 않고 leaf로 승격했다 — `general-building-route-cards.ts`에
 *    두면 순환이 된다(route-helper·route-actual이 그 파일을 import한다).
 */
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingSwapDecision } from "@/lib/tax-engine/general-building-swap";
import { SHARE_ID_SEPARATOR } from "@/lib/tax-engine/general-building-share-id";
import { buildEstimatedGeneralBuildingCards } from "./general-building-route-helper";
import type { GeneralBuildingValuationPayload } from "./general-building-route-helper";
import { buildActualGeneralBuildingCards } from "./general-building-route-actual";
import type { GeneralBuildingActualPricePayload } from "./general-building-route-actual";

export interface GbPartCards {
  cards: AssetCardForAggregate[];
  nonBusinessRatio: number;
  /**
   * 결과 카드용 명세 — **물건-수준**이라 전 지분 동일하다.
   * `GeneralBuildingValuationDetailCard`가 `buildingFootprintArea`·`allowedLandArea`를
   * **가드 없이** 읽으므로(`.toFixed(2)`) 반드시 채워야 한다.
   */
  detailBase: Record<string, unknown>;
  swap?: GeneralBuildingSwapDecision;
  totalStd: number;
  landStdAtTransfer: number;
  landStdAtAcq: number | null;
  buildingStdAtTransfer: number;
  buildingStdAtAcq: number | null;
  /**
   * 증축분(건물2) 기준시가 — 증축이 없으면 0.
   * 표시용 안분 표에서 건물2 행이 건물1 값을 쓰지 않게 한다(2026-08-12 · 단건 경로와 같은 축).
   */
  extensionStdAtTransfer: number;
  extensionStdAtAcq: number;
  usedEstimated: boolean;
  legalBasis: string;
}

/**
 * 한 자산(또는 한 지분)의 파트 카드를 만든다 — 경로 A(환산) / 경로 B(실가) 분기는 `actualPriceMode`가 정한다.
 * `dispatchGeneralBuilding`(단건 진입점)과 **같은 축**이다.
 */
export function buildGbPartCards(
  gbv: Record<string, unknown>,
  /** 이 자산(또는 지분)에 귀속된 양도가액. 자산 간 안분은 **호출부가 이미 끝냈다**. */
  partTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  landAcquisitionDate: Date,
  /** 개산공제(영 §163⑥) base 축소 전용. 컴패니언(단독 소유)은 1 또는 미전달. */
  ownershipRatio: number | undefined,
): GbPartCards {
  const landArea = (gbv.landArea as number) ?? 0;
  const landStdAtTransfer = ((gbv.transferLandPricePerSqm as number) ?? 0) * landArea;
  const buildingStdAtTransfer = (gbv.transferBuildingStdPrice as number) ?? 0;
  /* 증축분(건물2) — 두 분기 공통. 엔진 §166⑥ 분모와 같은 구성으로 표시 분모를 맞춘다. */
  const ext = gbv.extensionInfo as
    | { transferExtensionBuildingStdPrice?: number; acquisitionExtensionBuildingStdPrice?: number }
    | undefined;
  const extensionStdAtTransfer = ext?.transferExtensionBuildingStdPrice ?? 0;
  const extensionStdAtAcq = ext?.acquisitionExtensionBuildingStdPrice ?? 0;

  if (gbv.actualPriceMode === true) {
    const built = buildActualGeneralBuildingCards({
      ...(gbv as unknown as GeneralBuildingActualPricePayload),
      totalTransferPrice: partTransferPrice,
      transferDate,
      acquisitionDate,
      landAcquisitionDate,
      buildingAcquisitionDate: acquisitionDate,
    });
    return {
      cards: built.cards,
      nonBusinessRatio: built.nonBusinessRatio,
      detailBase: { ...built.nblDetail, nonBusinessRatio: built.nonBusinessRatio },
      totalStd: built.totalStd + extensionStdAtTransfer,
      landStdAtTransfer: built.landStdAtTransfer,
      landStdAtAcq: null,
      buildingStdAtTransfer: built.transferBuildingStdPrice,
      buildingStdAtAcq: null,
      extensionStdAtTransfer,
      extensionStdAtAcq,
      usedEstimated: false,
      legalBasis: "소득세법 시행령 §166⑥ · §104의3",
    };
  }

  const payload: GeneralBuildingValuationPayload = {
    ...(gbv as unknown as GeneralBuildingValuationPayload),
    totalTransferPrice: partTransferPrice,
    transferDate,
    // M-1a — `acquisitionDate`는 **건물** 취득일, 토지는 별도 필드다.
    acquisitionDate,
    landAcquisitionDate,
    // 개산공제(영 §163⑥) base 축소 전용 — 기준시가·면적은 100% 유지가 정확성의 근거다.
    ownershipRatio,
  };
  const { gbOut, swap } = buildEstimatedGeneralBuildingCards(payload);
  const acqLandPerSqm = (gbv.acquisitionLandPricePerSqm as number) ?? 0;
  return {
    cards: gbOut.assetCards,
    nonBusinessRatio: gbOut.nonBusinessRatio,
    // 환산 경로는 `gbOut` 자체가 완전한 `GeneralBuildingOutput`이다.
    detailBase: gbOut as unknown as Record<string, unknown>,
    swap,
    totalStd: landStdAtTransfer + buildingStdAtTransfer + extensionStdAtTransfer,
    landStdAtTransfer,
    landStdAtAcq: acqLandPerSqm * landArea,
    buildingStdAtTransfer,
    buildingStdAtAcq: (gbv.acquisitionBuildingStdPrice as number) ?? 0,
    extensionStdAtTransfer,
    extensionStdAtAcq,
    usedEstimated: true,
    legalBasis: "소득세법 시행령 §166⑥ · §176의2② · §163⑥",
  };
}

/**
 * 카드 id 접미사 — 같은 aggregate 안에서 파트 카드 id가 충돌하지 않게 한다.
 *
 * | 호출부 | 접미사 |
 * |---|---|
 * | 축 B 지분 분할 | 지분 인덱스(`0`·`1`…) — 지분 2건 이상일 때만 |
 * | 컴패니언 함께양도 | 그 컴패니언의 `assetId` |
 *
 * 구분자는 `general-building-route-cards.ts`가 정본이다(`baseCardId`가 같은 문자로 벗긴다).
 * 여기서 `"#"`를 다시 쓰면 한쪽만 바뀌었을 때 소비자가 조용히 매칭에 실패한다.
 */
const tagId = (propertyId: string, suffix: string) =>
  `${propertyId}${SHARE_ID_SEPARATOR}${suffix}`;

/**
 * swap 결정의 `Map` 키를 접미사 붙은 propertyId로 다시 맵핑한다.
 *
 * 🔴 **카드 태깅과 반드시 같은 시점에** 해야 한다. `buildProperties`/`buildApportionment`가
 *    `swap.allocation.get(card.propertyId)`로 조회하므로, 한쪽만 접미사가 붙으면 swap이
 *    **조용히 미적용**된다(`general-building-route-cards.ts:56,62`).
 */
export function remapGbSwap(
  swap: GeneralBuildingSwapDecision,
  suffix: string,
): GeneralBuildingSwapDecision {
  const remap = (m: Map<string, number>) =>
    new Map([...m.entries()].map(([k, v]) => [tagId(k, suffix), v] as const));
  return { ...swap, allocation: remap(swap.allocation), addition: remap(swap.addition) };
}

/** 카드에 접미사·라벨을 입힌다. **swap 재맵핑과 반드시 같은 시점에** 부를 것. */
export function tagGbCards(
  cards: AssetCardForAggregate[],
  suffix: string,
  labelPrefix: string,
): AssetCardForAggregate[] {
  return cards.map((c) => ({
    ...c,
    propertyId: tagId(c.propertyId, suffix),
    propertyLabel: `${labelPrefix} ${c.propertyLabel}`,
  }));
}

