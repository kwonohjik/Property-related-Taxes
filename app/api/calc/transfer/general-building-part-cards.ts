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
import { extensionBundledInjection } from "./general-building-route-helper";
import type { GeneralBuildingValuationPayload } from "./general-building-route-helper";
import { buildActualGeneralBuildingCards } from "./general-building-route-actual";
import type { GeneralBuildingActualPricePayload } from "./general-building-route-actual";
import { coerceGeneralBuildingPayload } from "./general-building-route-helper";
import { buildProperties } from "./general-building-route-cards";
import { resolveGbPreDeemedRoute } from "@/lib/tax-engine/general-building-pre-deemed";
import { scaleDeclaredSaleSplitToShare } from "@/lib/tax-engine/general-building-entry";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { TaxCalculationError, TaxErrorCode } from "@/lib/tax-engine/tax-errors";

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
  gbvIn: Record<string, unknown>,
  /** 이 자산(또는 지분)에 귀속된 양도가액. 자산 간 안분은 **호출부가 이미 끝냈다**. */
  partTransferPrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  landAcquisitionDate: Date,
  /** 개산공제(영 §163⑥) base 축소 전용. 컴패니언(단독 소유)은 1 또는 미전달. */
  ownershipRatio: number | undefined,
  /**
   * 자산(또는 지분) 단위 실지 취득가액·필요경비 — 단건 `route.ts`의 `bundledAcq`·`bundledExp`와 같은 자리다.
   *
   * 🔴 종전에는 이 두 값이 없었다. 실가 분기는 필요경비가 `undefined × 비율` = NaN으로 500이 나고,
   *    자본적지출이 있으면 분리 OFF 자산 단위 취득가액이 0이 됐다(2026-10-20 실측 —
   *    계획서 `docs/00-pm/gb-parts-actual-acq-exp.plan.md` §1). 환산 분기는 증축 원건물 주입을 같이 한다.
   */
  actualAcquisitionPrice: number,
  actualExpenses: number,
  /**
   * 부담부증여(소령 §159) — 있으면 **실가 카드 경로가 §159로 취득가액·개산공제를 채무비율 안분**한다(단건 `dispatchGeneralBuilding`과 같은 소비처).
   *
   * 🔴 종전에는 이 인자가 없어 컴패니언 GB 카드가 일반 양도로 계산됐다(취득가액 0 · 양도차익 = 채무액 전부 — 계획서 §2.2).
   * 환산 payload 는 이 값을 읽지 않으므로 **실가가 아니면 던진다** — 침묵 무시 금지(⑫ `refineGbBurdenedGiftActualPath`가 입구에서 먼저 400).
   * 의제취득일 전 상속·증여 재선택(PR-4)은 건너뛴다 — 부담부증여는 §159가 취득가액을 정한다(단건 `dispatchCoercedGeneralBuilding`과 같다).
   */
  burdenedGiftInfo?: BurdenedGiftInfo,
): GbPartCards {
  const estimatedPayloadOf = (raw: Record<string, unknown>): GeneralBuildingValuationPayload => ({
    ...(raw as unknown as GeneralBuildingValuationPayload),
    totalTransferPrice: partTransferPrice,
    transferDate,
    // M-1a — `acquisitionDate`는 **건물** 취득일, 토지는 별도 필드다.
    acquisitionDate,
    landAcquisitionDate,
    // 개산공제(영 §163⑥) base 축소 전용 — 기준시가·면적은 100% 유지가 정확성의 근거다.
    ownershipRatio,
    // 증축 원건물 일괄 실가 — 단건과 같은 주입(엔진이 키의 존재로 원건물 모드를 고른다).
    ...extensionBundledInjection(raw, actualAcquisitionPrice, actualExpenses),
  });
  // 공유 지분 — 계약서 구분 기재 양도가액(100% 기준)을 이 지분의 양도가액에 맞춘다(단건 `dispatchGeneralBuilding`과 같은 leaf).
  const gbvShare = scaleDeclaredSaleSplitToShare(gbvIn, ownershipRatio);
  // 의제취득일 전 상속·증여 파트 — 단건 `dispatchCoercedGeneralBuilding`과 같은 재선택(PR-4).
  const preDeemed = burdenedGiftInfo
    ? { raw: gbvShare, echo: undefined }
    : resolveGbPreDeemedRoute(gbvShare, actualExpenses, (r) =>
        buildEstimatedGeneralBuildingCards(estimatedPayloadOf(r)).gbOut.acquisition);
  const gbv = preDeemed.raw;
  if (burdenedGiftInfo && gbv.actualPriceMode !== true) {
    throw new TaxCalculationError(
      TaxErrorCode.INVALID_INPUT,
      "일반건물 부담부증여(소령 §159)는 실지 경로로만 계산됩니다. 환산취득가·증축 입력은 부담부증여에서 쓰이지 않습니다.",
    );
  }
  const echo = preDeemed.echo ? { preDeemedAcquisition: preDeemed.echo } : {};
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
      actualAcquisitionPrice,
      actualExpenses,
      ...(burdenedGiftInfo ? { burdenedGiftInfo } : {}),
    });
    return {
      cards: built.cards,
      nonBusinessRatio: built.nonBusinessRatio,
      detailBase: {
        ...built.nblDetail,
        nonBusinessRatio: built.nonBusinessRatio,
        // 구분 기재 없이 안분했을 때 basis 종류 — 지분(축 B) 실가 분기도 단건과 같이 싣는다(표시 전용 echo).
        ...(built.saleApportionBasisKind ? { saleApportionBasisKind: built.saleApportionBasisKind } : {}),
        ...echo,
      },
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

  const { gbOut, swap } = buildEstimatedGeneralBuildingCards(estimatedPayloadOf(gbv));
  const acqLandPerSqm = (gbv.acquisitionLandPricePerSqm as number) ?? 0;
  return {
    cards: gbOut.assetCards,
    nonBusinessRatio: gbOut.nonBusinessRatio,
    // 환산 경로는 `gbOut` 자체가 완전한 `GeneralBuildingOutput`이다.
    detailBase: { ...(gbOut as unknown as Record<string, unknown>), ...echo },
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

/**
 * ⑭ **일반건물 컴패니언 — 1건이 토지·건물(+증축) 파트 카드로 펼쳐진다** (`bundled-split-helpers.ts`에서 옮김 · 800줄 정책).
 *
 * 🔑 **2단 안분이다.** 자산 간 안분(§166⑥ 키)은 5-a가 이미 끝냈고(`engine.transferPrice` = 그 자산의 몫),
 *    **자산 안에서 토지·건물로 나누는 분모**(양도시 토지 기준시가 + 건물 기준시가 + 증축분)는
 *    GB 엔진이 정한다. 축 B(지분 분할)가 `총계약가 × 지분율`을 같은 자리에 넣는 것과
 *    **완전히 같은 형태**이며, 두 축이 `buildGbPartCards` **한 leaf를 공유**한다.
 *
 * ⚠️ 종전에는 route 5-a-3(`:471`)이 이 계산을 했는데, 5-a가 `return`해 버려 **도달조차
 *    하지 않았다**(설계문서 `transfer-bundled-subengine-hosting.design.md` §1). 그래서
 *    ⑧이 함께양도를 막고 있었다 — 「전용 경로가 없다」가 아니라 「경로가 실행되지 않는다」였다.
 *
 * 🔴 카드 태깅과 swap Map 재맵핑은 **같은 시점에** 해야 한다 — 한쪽만 접미사가 붙으면
 *    `buildProperties`가 `swap.allocation.get(card.propertyId)`에서 조용히 미스한다.
 */
export function buildGbCompanionItems(
  generalBuildingValuation: Record<string, unknown>,
  /** 컴패니언 엔진 입력 — 5-a 안분 결과·Date 변환·감면 매핑이 끝난 값. */
  engine: Pick<
    TransferTaxItemInput,
    "transferPrice" | "transferDate" | "acquisitionDate" | "acquisitionPrice" | "expenses" | "reductions" | "burdenedGiftInfo" | "transferType"
  >,
  src: { ownershipRatio?: number; assetId: string; assetLabel: string },
): TransferTaxItemInput[] {
  const gbv = coerceGeneralBuildingPayload(generalBuildingValuation);
  const bldAcqDate = (gbv.buildingAcquisitionDate as Date | undefined) ?? engine.acquisitionDate;
  const landAcqDate = (gbv.landAcquisitionDate as Date | undefined) ?? engine.acquisitionDate;
  const built = buildGbPartCards(
    gbv,
    engine.transferPrice,
    engine.transferDate,
    bldAcqDate,
    landAcqDate,
    src.ownershipRatio,
    /*
     * 자산 단위 실지 취득가액·필요경비 — 단건 `route.ts`의 `bundledAcq`·`bundledExp`와 같은 축이다:
     * 증축 일괄값(`bundledAcquisitionPrice`·`bundledExpenses`)이 있으면 그것, 없으면 그 자산의 엔진 입력값
     * (5-a가 정한 취득가액 · 직접 경비 + 공통 양도비 몫 — 다른 컴패니언과 같은 소스).
     */
    (gbv.bundledAcquisitionPrice as number | undefined) ?? engine.acquisitionPrice ?? 0,
    (gbv.bundledExpenses as number | undefined) ?? engine.expenses ?? 0,
    // ⑭ 부담부증여(§159) — 컴패니언 엔진 입력의 `burdenedGiftInfo`(⑫→`bundled-split-helpers.ts:547`·주 자산은 `engineInput`)를 카드 빌더까지 운반한다.
    //    `transferType` 표지와 함께 있을 때만(단건 `route.ts`가 읽는 조건과 같다). 신고 단위 채무 재배분(`assumedDebtOverride`)은 info 안에 있다.
    engine.transferType === "burdened_gift" ? engine.burdenedGiftInfo : undefined,
  );
  const tagged = tagGbCards(built.cards, src.assetId, src.assetLabel);
  const swap = built.swap ? remapGbSwap(built.swap, src.assetId) : undefined;
  return buildProperties(
    tagged,
    built.nonBusinessRatio,
    swap,
    // §104③ 미등기 — 축 B와 **같은 축**을 싣는다. 빠뜨리면 컴패니언에서만 조용히 무시된다.
    {
      land: gbv.unregisteredLand as boolean | undefined,
      building: gbv.unregisteredBuilding as boolean | undefined,
    },
    engine.reductions,
    gbv.nonHeirBequest as boolean | undefined,
  );
}
