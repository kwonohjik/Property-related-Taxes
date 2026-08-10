/**
 * 일반건물(토지+건물 일괄) × 지분(%) 분할 취득 — 지분 루프 오케스트레이터.
 *
 * 계획서: `docs/00-pm/transfer-general-building-fractional-share.plan.md` (개정 3)
 * 설계:   `docs/02-design/features/transfer-general-building-fractional-share.engine.design.md` D5
 * anchor: `__tests__/api/transfer.route.gb-fractional.predo.anchor.test.ts`
 *
 * ## 설계 요지
 *
 * 환산(경로 A)·실가(경로 B) 두 경로가 **같은 중간 산출물**(`AssetCardForAggregate[]`)로 수렴한다.
 * 그래서 **지분별로 cards를 만들어 concat한 뒤 `calculateTransferTaxAggregate`를 1회만** 부른다.
 *
 * ```
 * for each 지분 k:
 *   양도가액_k = 총양도가 × r_k        (마지막 지분이 잔액 흡수)
 *   gbv_k      = gateShareEvents(...)  (증축·용도변경 前/後 판정 — D4)
 *   cards_k    = 경로 A|B 카드 조립     (swap도 이 안에서 → 판정 단위가 지분 × 파트)
 *   propertyId += `#k`                 (지분 간 충돌·swap Map 오귀속 방지)
 * aggregate(concat(cards))             ← 기본공제 250만원·§104⑤가 1회만 적용된다
 * ```
 *
 * ## 왜 aggregate가 1회여야 하는가
 *
 * 기본공제(법 §103②)는 **연간 1회**다. 지분마다 aggregate를 부르면 지분 수만큼 공제된다.
 * §104⑤ 비교과세도 전 자산을 함께 봐야 성립한다.
 */
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { AssetCardForAggregate } from "@/lib/tax-engine/general-building-valuation";
import type { GeneralBuildingSwapDecision } from "@/lib/tax-engine/general-building-swap";
import { gateShareEvents } from "@/lib/tax-engine/general-building-share-events";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import { toDate, toOptionalDate } from "@/lib/api/date-coerce";
import {
  buildProperties,
  buildApportionment,
  type BundledLikeApportionmentResult,
  type GeneralBuildingRouteResult,
} from "./general-building-route-cards";
import {
  buildEstimatedGeneralBuildingCards,
  coerceGeneralBuildingPayload,
  type GeneralBuildingValuationPayload,
} from "./general-building-route-helper";
import {
  buildActualGeneralBuildingCards,
  type GeneralBuildingActualPricePayload,
} from "./general-building-route-actual";

/** 라우트가 받는 지분 1건 (Zod 통과 후). `valuation`은 물건-수준 병합이 끝난 완결 payload. */
export interface GeneralBuildingSharePayload {
  shareId: string;
  shareLabel: string;
  /** 0 < r ≤ 1. Σ = 1 은 Zod superRefine이 검증한다. */
  ownershipRatio: number;
  /** 그 지분의 토지 취득일 (M-1a). 미지정 시 건물 취득일과 동일. */
  acquisitionDate: string | Date;
  /**
   * 그 지분의 완결 payload. **자본적지출·양도비(§97②2호 나목)도 이 안에** 있고
   * 이미 × 지분율이 적용돼 있다 — share 레벨에 중복 필드를 두지 않는다.
   */
  valuation: Record<string, unknown>;
}

/** 지분 인덱스 접미사 — 지분이 2건 이상일 때만 붙인다(단건 회귀 0). */
const tagId = (propertyId: string, shareIdx: number) => `${propertyId}#${shareIdx}`;

/**
 * swap 결정의 `Map` 키를 접미사 붙은 propertyId로 다시 맵핑한다.
 *
 * 🔴 **카드 태깅과 반드시 같은 시점에** 해야 한다. `buildProperties`/`buildApportionment`가
 *    `swap.allocation.get(card.propertyId)`로 조회하므로, 한쪽만 접미사가 붙으면 swap이
 *    **조용히 미적용**된다(`general-building-route-cards.ts:56,62`).
 */
function remapSwap(swap: GeneralBuildingSwapDecision, shareIdx: number): GeneralBuildingSwapDecision {
  const remap = (m: Map<string, number>) =>
    new Map([...m.entries()].map(([k, v]) => [tagId(k, shareIdx), v] as const));
  return { ...swap, allocation: remap(swap.allocation), addition: remap(swap.addition) };
}

/** 카드에 지분 접미사·라벨을 입힌다. */
function tagCards(
  cards: AssetCardForAggregate[],
  shareIdx: number,
  shareLabel: string,
): AssetCardForAggregate[] {
  return cards.map((c) => ({
    ...c,
    propertyId: tagId(c.propertyId, shareIdx),
    propertyLabel: `${shareLabel} ${c.propertyLabel}`,
  }));
}

/** 그 지분의 **건물** 취득일 — 물건 사건 前/後 판정의 기준일. */
function buildingAcqDateOf(share: GeneralBuildingSharePayload): Date {
  const v = share.valuation;
  return (
    toOptionalDate(v.buildingAcquisitionDate) ??
    toOptionalDate(v.acquisitionDate) ??
    toDate(share.acquisitionDate, "generalBuildingShares[].acquisitionDate")
  );
}

interface ShareCards {
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
  usedEstimated: boolean;
  legalBasis: string;
}

/**
 * 지분 하나의 카드를 만든다 — 경로 A(환산) / 경로 B(실가) 분기는 `actualPriceMode`가 정한다.
 * `dispatchGeneralBuilding`(단건 진입점)과 **같은 축**이다.
 */
function buildShareCards(
  gbv: Record<string, unknown>,
  sharePrice: number,
  transferDate: Date,
  acquisitionDate: Date,
  landAcquisitionDate: Date,
  share: GeneralBuildingSharePayload,
): ShareCards {
  const landArea = (gbv.landArea as number) ?? 0;
  const landStdAtTransfer = ((gbv.transferLandPricePerSqm as number) ?? 0) * landArea;
  const buildingStdAtTransfer = (gbv.transferBuildingStdPrice as number) ?? 0;

  if (gbv.actualPriceMode === true) {
    const built = buildActualGeneralBuildingCards({
      ...(gbv as unknown as GeneralBuildingActualPricePayload),
      totalTransferPrice: sharePrice,
      transferDate,
      acquisitionDate,
      landAcquisitionDate,
      buildingAcquisitionDate: acquisitionDate,
    });
    return {
      cards: built.cards,
      nonBusinessRatio: built.nonBusinessRatio,
      detailBase: { ...built.nblDetail, nonBusinessRatio: built.nonBusinessRatio },
      totalStd: built.totalStd,
      landStdAtTransfer: built.landStdAtTransfer,
      landStdAtAcq: null,
      buildingStdAtTransfer: built.transferBuildingStdPrice,
      buildingStdAtAcq: null,
      usedEstimated: false,
      legalBasis: "소득세법 시행령 §166⑥ · §104의3",
    };
  }

  const payload: GeneralBuildingValuationPayload = {
    ...(gbv as unknown as GeneralBuildingValuationPayload),
    totalTransferPrice: sharePrice,
    transferDate,
    // M-1a — `acquisitionDate`는 **건물** 취득일, 토지는 별도 필드다.
    acquisitionDate,
    landAcquisitionDate,
    // 개산공제(영 §163⑥) base 축소 전용 — 기준시가·면적은 100% 유지가 정확성의 근거다.
    ownershipRatio: share.ownershipRatio,
  };
  const { gbOut, swap } = buildEstimatedGeneralBuildingCards(payload);
  const acqLandPerSqm = (gbv.acquisitionLandPricePerSqm as number) ?? 0;
  return {
    cards: gbOut.assetCards,
    nonBusinessRatio: gbOut.nonBusinessRatio,
    // 환산 경로는 `gbOut` 자체가 완전한 `GeneralBuildingOutput`이다.
    detailBase: gbOut as unknown as Record<string, unknown>,
    swap,
    totalStd: landStdAtTransfer + buildingStdAtTransfer,
    landStdAtTransfer,
    landStdAtAcq: acqLandPerSqm * landArea,
    buildingStdAtTransfer,
    buildingStdAtAcq: (gbv.acquisitionBuildingStdPrice as number) ?? 0,
    usedEstimated: true,
    legalBasis: "소득세법 시행령 §166⑥ · §176의2② · §163⑥",
  };
}

/**
 * 지분 분할 일반건물 계산.
 *
 * @param totalTransferPrice 물건 **전체(100%)** 양도가액. 지분별 양도가액은 여기서 도출한다.
 */
export function calculateGeneralBuildingFractional(
  shares: GeneralBuildingSharePayload[],
  totalTransferPrice: number,
  transferDate: Date,
  taxYear: number,
  annualBasicDeductionUsed: number | undefined,
  priorReductionUsage: unknown[],
  rates: TaxRatesMap,
): GeneralBuildingRouteResult {
  const allProperties: TransferTaxItemInput[] = [];
  const allApportioned: BundledLikeApportionmentResult["apportioned"] = [];
  const allCards: AssetCardForAggregate[] = [];
  let totalStandardAtTransfer = 0;
  let residualAbsorbedBy: string | null = null;
  let allocatedSum = 0;
  /** §166⑥ 안분 분모·NBL 명세 — 물건-수준이라 **첫 지분 것으로 충분**하다(superRefine이 동일성 강제). */
  let detailBase: Record<string, unknown> | undefined;
  let lastLandStdTotal: number | undefined;
  let lastBuildingStdTotal: number | undefined;

  // §97②2호 단서 표시 — **발동한 (지분 × 파트)만** 합산한다(설계 D5-3-1).
  //   미발동분까지 더하면 「이 금액을 나목으로 채택했다」는 표시가 실제 채택액과 어긋난다
  //   (메모리 `feedback_engine_result_display_drift`).
  let anySwapApplied = false;
  let swapEstimatedSide = 0;
  let swapDirectSide = 0;

  shares.forEach((share, idx) => {
    /**
     * (1) 지분 양도가액 — **마지막 지분이 잔액을 흡수**해 `Σ = 총양도가` 불변식을 지킨다
     *     (1/3 × 3 = 999,999,999 방지 · 메모리 `feedback_floor_residual_absorption`).
     *
     * 순서는 **지분 먼저, 그다음 §166⑥**이다(설계 D5-1) — 지분이 확정되고 그 안에서
     * 토지·건물 안분이 일어나는 것이 법 구조에 맞고, floor 절사 위치도 그렇게 고정된다.
     */
    const sharePrice =
      idx === shares.length - 1
        ? totalTransferPrice - allocatedSum
        : applyRatio(totalTransferPrice, share.ownershipRatio);
    allocatedSum += sharePrice;

    /**
     * (2) ⑭ **Date 변환 먼저** — 단건과 **같은 함수**를 쓴다.
     *
     * 🔴 이것을 건너뛰면 `conversionDate`·`extensionDate`가 문자열로 도달해
     *    `getTime is not a function`으로 500이 난다(2026-08-10 실측).
     *    변환 목록을 여기서 다시 나열하지 말 것 — `coerceGeneralBuildingPayload`가 단일 소스다.
     */
    const coerced = coerceGeneralBuildingPayload(share.valuation);

    // (2-b) 물건 사건 게이팅 — 증축·용도변경 前/後 판정 (D4)
    const buildingAcqDate = buildingAcqDateOf({ ...share, valuation: coerced });
    const gated = gateShareEvents(
      coerced as never,
      buildingAcqDate,
    ) as unknown as Record<string, unknown>;

    // (3) 카드 조립 — swap도 이 안에서 결정된다 ⇒ 판정 단위 = 지분 × 파트
    const landAcqDate =
      toOptionalDate(gated.landAcquisitionDate) ??
      toDate(share.acquisitionDate, "generalBuildingShares[].acquisitionDate");
    const built = buildShareCards(
      gated,
      sharePrice,
      transferDate,
      buildingAcqDate,
      landAcqDate,
      share,
    );

    // (4) 접미사 — 카드와 swap Map을 **같은 시점에** 태깅한다
    const tagged = tagCards(built.cards, idx, share.shareLabel);
    const swap = built.swap ? remapSwap(built.swap, idx) : undefined;

    allProperties.push(...buildProperties(tagged, built.nonBusinessRatio, swap));
    const ap = buildApportionment(
      tagged,
      built.totalStd,
      built.nonBusinessRatio,
      built.landStdAtTransfer,
      built.landStdAtAcq,
      built.buildingStdAtTransfer,
      built.buildingStdAtAcq,
      built.usedEstimated,
      built.legalBasis,
      swap,
    );
    allApportioned.push(...ap.apportioned);
    totalStandardAtTransfer += ap.totalStandardAtTransfer;
    residualAbsorbedBy = ap.residualAbsorbedBy ?? residualAbsorbedBy;

    if (swap?.swapApplied) {
      anySwapApplied = true;
      const applied = swap.perPart
        ? Object.values(swap.perPart).filter((p) => p?.swapApplied)
        : undefined;
      swapEstimatedSide += applied
        ? applied.reduce((s, p) => s + (p?.estimatedSide ?? 0), 0)
        : swap.estimatedSideTotal;
      swapDirectSide += applied
        ? applied.reduce((s, p) => s + (p?.directSide ?? 0), 0)
        : swap.directSide;
    }

    allCards.push(...tagged);
    if (detailBase === undefined) detailBase = built.detailBase;
    lastLandStdTotal = built.landStdAtTransfer;
    lastBuildingStdTotal = built.buildingStdAtTransfer;
  });

  // (5) aggregate는 **1회만** — 기본공제 250만원(법 §103②)·§104⑤ 비교과세가 전 지분에 1번 적용된다
  const aggregated = calculateTransferTaxAggregate(
    {
      taxYear,
      properties: allProperties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      basicDeductionAllocation: "MAX_BENEFIT",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
    },
    rates,
  );

  if (anySwapApplied) {
    aggregated.swapApplied = true;
    aggregated.swapComparison = {
      estimatedSide: swapEstimatedSide,
      directSide: swapDirectSide,
      chosen: "direct",
    };
  }

  /**
   * UI 자산별 산식 인라인 표시용 — 단건 경로와 **같은 키**를 채운다.
   * 미설정 시 결과 화면의 §166⑥ 안분 산식 빌더가 통째로 죽는다.
   * `assetCards`는 전 지분 concat이라 카드 라벨에 지분 이름이 들어 있다.
   */
  aggregated.generalBuildingValuationDetail = {
    ...(detailBase ?? {}),
    // 카드는 **전 지분 concat** — 라벨에 지분 이름이 들어 있다.
    assetCards: allCards,
    ...(lastLandStdTotal !== undefined ? { landStdTotal: lastLandStdTotal } : {}),
    ...(lastBuildingStdTotal !== undefined ? { buildingStdTotal: lastBuildingStdTotal } : {}),
  } as never;

  return {
    apportionment: {
      apportioned: allApportioned,
      totalStandardAtTransfer,
      residualAbsorbedBy,
      legalBasis: "소득세법 시행령 §166⑥ · 지분별 취득 (법 §98 · 영 §162①)",
      warnings: [],
    },
    aggregated,
  };
}
