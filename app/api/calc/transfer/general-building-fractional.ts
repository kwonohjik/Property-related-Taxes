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
  SHARE_ID_SEPARATOR,
  type BundledLikeApportionmentResult,
  type GeneralBuildingRouteResult,
} from "./general-building-route-cards";
import { coerceGeneralBuildingPayload } from "./general-building-route-helper";
import { buildGbPartCards, tagGbCards, remapGbSwap } from "./general-building-part-cards";
import type { GbPartCards } from "./general-building-part-cards";

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

/** 그 지분의 **건물** 취득일 — 물건 사건 前/後 판정의 기준일. */
function buildingAcqDateOf(share: GeneralBuildingSharePayload): Date {
  const v = share.valuation;
  return (
    toOptionalDate(v.buildingAcquisitionDate) ??
    toOptionalDate(v.acquisitionDate) ??
    toDate(share.acquisitionDate, "generalBuildingShares[].acquisitionDate")
  );
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
  /**
   * 신고서 단위 수정신고·경정청구 (국세기본법 §45·§45의2).
   *
   * 지분 경로는 `assetLevel` 묶음을 받지 않으므로 **단독 인자**로 받는다.
   * 다른 두 GB 경로(`-route-helper` 환산 · `-route-actual` 실가)는
   * `GbAssetLevelInputs.amendment`로 같은 값을 전달한다 — **세 경로가 갈리면 안 된다**.
   */
  amendment?: import("@/lib/tax-engine/types/transfer-amendment.types").AmendmentInput,
  /**
   * 🔴 G-02/G-13: 신고서 단위 신고불성실·납부지연 가산세 (국세기본법 §47의2~§47의4).
   *
   * `amendment`와 같은 이유로 단독 인자다. 종전에는 이 경로만 두 필드를 받지 않아
   * **지분 칸을 1개에서 2개로 늘린 것만으로 가산세가 0원**이 됐다 —
   * 형제 두 경로는 `GbAssetLevelInputs`로 이미 전달하고 있었다
   * (`-route-helper.ts:251-252` · `-route-actual.ts:664-665`).
   */
  filingPenaltyDetails?: TransferTaxItemInput["filingPenaltyDetails"],
  delayedPaymentDetails?: TransferTaxItemInput["delayedPaymentDetails"],
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
    const built = buildGbPartCards(
      gated,
      sharePrice,
      transferDate,
      buildingAcqDate,
      landAcqDate,
      share.ownershipRatio,
    );

    // (4) 접미사 — 카드와 swap Map을 **같은 시점에** 태깅한다
    // 접미사는 문자열이다 — 컴패니언 축이 `assetId`를 쓰므로 leaf가 일반화됐다.
    const tagged = tagGbCards(built.cards, String(idx), share.shareLabel);
    const swap = built.swap ? remapGbSwap(built.swap, String(idx)) : undefined;

    // §104③ 미등기 — 지분 경로도 토지·건물 축을 싣는다. 여기서 빠뜨리면 **지분 모드에서만**
    // 미등기가 조용히 무시된다(단독 모드는 정상이라 발견이 늦다).
    allProperties.push(
      ...buildProperties(tagged, built.nonBusinessRatio, swap, {
        land: gated.unregisteredLand as boolean | undefined,
        building: gated.unregisteredBuilding as boolean | undefined,
      }),
    );
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
      built.extensionStdAtTransfer,
      built.extensionStdAtAcq,
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
      // 신고서 단위 정정 — aggregate가 1회만 소비한다(자산별 누수는 `:163`이 strip).
      amendment,
      // 🔴 G-13: 신고서 단위 가산세도 같은 층위에서 1회만 소비한다.
      filingPenaltyDetails,
      delayedPaymentDetails,
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
