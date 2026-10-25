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
 * 기본공제(법 §103①)는 **연간 1회**다. 지분마다 aggregate를 부르면 지분 수만큼 공제된다.
 * §104⑤ 비교과세도 전 자산을 함께 봐야 성립한다.
 */
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { calculateTransferTaxAggregateWithUnits } from "@/lib/tax-engine/transfer-tax-aggregate";
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
import { mapReductionsToEngine } from "./route-reductions-mapper";
import type { TransferReduction } from "@/lib/tax-engine/transfer-tax";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { GB_BG_SELF_BUILT_NOTICE } from "@/lib/tax-engine/general-building-bg-penalty-signal";
import { buildGbPartCards, tagGbCards, remapGbSwap } from "./general-building-part-cards";
import type { GbBgCarryoverUnitDraft } from "./general-building-part-cards";
import { attachGbCarryoverUnits, toGbCarryoverUnits } from "./bundled-gb-carryover-units";
import { toEngineCarryoverTaxation } from "@/lib/api/carryover-engine-input";
import type { carryoverTaxationEngineShape } from "@/lib/api/transfer-tax-building-schemas";
import type { z } from "zod";
import { judgeCarryoverEligibility } from "@/lib/tax-engine/transfer-tax-carryover-eligibility";
import {
  assertCarryoverDonorBasis,
  applyCarryoverDonorBasis,
  toTransferorBasisInfo,
} from "@/lib/tax-engine/transfer-tax-carryover-burdened-gift";
import type { SaleSplitJudgmentDetail } from "@/lib/tax-engine/types/transfer-split-gain.types";
import type { GbShareBlockEcho } from "@/lib/tax-engine/types/transfer-aggregate.types";

/**
 * 지분 판정을 **물건 전체(계약서 한 장)** 판정 하나로 싣는다 — `gb-fractional-result-blocks.plan.md` D-2(Q-1 a).
 *
 * 지분마다 계약서(100%) 금액으로 판정하므로(`sale-split-100-3-share-scale-judgment.plan.md` — 축 B는 총양도가가 계약 총액이다)
 * 전 지분의 판정 표는 같다. 그 표에서 지분 적용 가액 행(`share`)만 뺀 것이 물건 전체 판정이다.
 *
 * 🔴 계약서 판정이 아닌 지분이 있거나 결론이 갈리면 `undefined` — 블록이 계산과 다른 결론을 말하지 않게 한다.
 *    그때 화면은 지분별 판정(`shareBlockEcho`)을 그대로 그린다.
 */
export function propertySaleSplitJudgment(
  judgments: Array<SaleSplitJudgmentDetail | undefined>,
): SaleSplitJudgmentDetail | undefined {
  if (judgments.length === 0 || judgments.some((j) => !j?.share)) return undefined;
  const all = judgments as SaleSplitJudgmentDetail[];
  const first = all[0];
  if (all.some((j) => j.deemedUnclear !== first.deemedUnclear)) return undefined;
  const { share: _share, ...contract } = first;
  return contract;
}

/** 라우트가 받는 지분 1건 (Zod 통과 후). `valuation`은 물건-수준 병합이 끝난 완결 payload. */
export interface GeneralBuildingSharePayload {
  shareId: string;
  shareLabel: string;
  /** 0 < r ≤ 1. Σ = 1 은 Zod superRefine이 검증한다. */
  ownershipRatio: number;
  /** 그 지분의 토지 취득일 (M-1a). 미지정 시 건물 취득일과 동일. */
  acquisitionDate: string | Date;
  /**
   * 그 지분의 자산 단위 실지 취득가액·필요경비(× 지분율 완료) — 단건 top-level `acquisitionPrice`·`expenses`의 지분판.
   * 실가 분기가 분리 OFF 일괄 취득가액·예전 필요경비 칸으로 쓴다(`buildGbPartCards`).
   */
  acquisitionPrice?: number;
  expenses?: number;
  /**
   * 그 지분의 완결 payload. **자본적지출·양도비(§97②2호 나목)도 이 안에** 있고
   * 이미 × 지분율이 적용돼 있다 — share 레벨에 중복 필드를 두지 않는다.
   */
  valuation: Record<string, unknown>;
  /** 그 지분의 조특법 감면(Zod 통과본) — 둘째 지분부터. 첫 지분은 `primaryReductions`(최상위)가 정본이다. */
  reductions?: Parameters<typeof mapReductionsToEngine>[0];
  /** 그 지분의 부담부증여(소령 §159) 정보 — 부담부증여일 때 전 지분(⑫ `refineGbBurdenedGiftActualPath`가 누락을 400). 채무는 지분율 안분 완료, 평가액은 엔진이 지분 축소. */
  burdenedGiftInfo?: BurdenedGiftInfo;
  /**
   * 그 지분의 배우자 등 이월과세(§97의2) — **부담부증여 지분만**(⑫ 짝 강제: 이 값 ⇔ `burdenedGiftInfo.carryoverDonorBasis`).
   * 부담부증여는 A/B가 §159 안분 단계(카드 조립 전)에서 갈려 지분마다 A·B 카드를 만들고 신고 단위로 비교한다(PR-2).
   * 일반 양도 지분의 이월과세는 종전대로 `valuation`의 파트 서브객체가 싣는다.
   */
  carryoverTaxation?: z.infer<typeof carryoverTaxationEngineShape>;
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
  /**
   * 🔴 첫 지분의 조특법 감면(⑭ Date 변환 완료본 — 단건과 같은 최상위 `reductions`). 둘째 지분부터는 `share.reductions`.
   * 종전에는 이 경로만 감면 인자에 `undefined`를 넘겨, 지분을 2개로 늘린 것만으로 §77 감면이 0원이 됐다 —
   * 형제 두 경로는 F17-A(`91096fa51`)부터 `GbAssetLevelInputs.reductions`를 넘긴다
   * (계획서 `docs/00-pm/burdened-gift-bundle-residuals.plan.md` §1.2).
   */
  primaryReductions?: TransferReduction[],
  /**
   * 부담부증여(소령 §159) — **물건 전체** 증여세·§159 명세를 aggregate 에 1회 싣는다(Q-6). 지분마다 쪼개면 증여재산공제가 N번 차감된다.
   * 있으면 지분의 `burdenedGiftInfo`를 카드 빌더가 소비한다(지분 양도가액 = 총양도가 × 지분율은 쓰이지 않는다 — 양도가액은 §159가 정한다).
   * 계획서 `docs/00-pm/gb-burdened-gift-silent-drop.plan.md` PR-3.
   */
  burdened?: { wholeInfo?: BurdenedGiftInfo; date: Date },
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
  // §97②1호 가산분 결과 산식 echo — 단건 경로(`general-building-route-helper.ts`)와 같은 키를 지분 접미사 카드 id로 모은다.
  //   없으면 산식이 가산분을 「자산별 양도비」·「사용자 직접 입력」으로 적는다(`gb-extension-capex-residuals.plan.md` L1).
  const partDirectAddition: Record<string, number> = {};
  const partBeforeExtensionCapex: Record<string, number> = {};
  // 실가 분기 필요경비 산식 echo — 지분마다 금액이 달라 지분 인덱스로 싣는다(단건은 결과 상세에 그대로 · `actualExpenseEcho`).
  const shareActualExpenseEcho: Record<string, unknown> = {};
  // 결과 카드 블록 재료 — 지분마다 취득원인·평가액이 달라 지분 인덱스로 싣는다(`gb-fractional-result-blocks.plan.md` D-1).
  const shareBlockEcho: Record<string, GbShareBlockEcho> = {};

  /**
   * 부담부증여 × 이월과세(§97의2) 지분 — 요건(①괄호·②1·2호·③)을 충족하면 그 지분이 **비교 단위 하나**다(Q-1 a).
   * 판정·fail-fast는 단건 F27·묶음(`buildGbCompanionItems`)과 같은 leaf다. ⑭ 날짜는 단건·컴패니언과 같은 변환 leaf.
   */
  const carryoverOf = shares.map((share, idx) => {
    const ct = burdened && share.burdenedGiftInfo
      ? toEngineCarryoverTaxation(share.carryoverTaxation, `generalBuildingShares[${idx}].carryoverTaxation`)
      : undefined;
    const eligibility = ct ? judgeCarryoverEligibility(ct, transferDate) : undefined;
    if (!ct || !eligibility?.isEligible) return undefined;
    assertCarryoverDonorBasis(share.burdenedGiftInfo!, ct);
    return { ct, applicablePeriodYears: eligibility.applicablePeriodYears };
  });
  /** 비교 단위가 하나라도 있으면 전 지분 카드에 지분 §159 명세를 싣는다 — A가 채택되면 명세 취득 열을 지분별 합으로 바꾼다(Q-4 a). */
  const withShareBreakdown = carryoverOf.some(Boolean);

  /** 지분 하나의 한 시나리오 — 카드·표시 재료. `carryoverApplied`가 정해지면 카드에 지분 §159 명세를 싣는다. */
  const buildPiece = (
    share: GeneralBuildingSharePayload,
    idx: number,
    sharePrice: number,
    coerced: Record<string, unknown>,
    info: BurdenedGiftInfo | undefined,
    dates: { building: Date; land?: Date } | undefined,
    carryoverApplied: boolean | undefined,
  ) => {
    // (2-b) 물건 사건 게이팅 — 증축·용도변경 前/後 판정 (D4). A는 당초 증여자 취득일 기준이다(V-1 — 보유기간이 그날부터라 사건 前/後도 그날로 가른다).
    const buildingAcqDate = dates?.building ?? buildingAcqDateOf({ ...share, valuation: coerced });
    const gated = gateShareEvents(
      coerced as never,
      buildingAcqDate,
    ) as unknown as Record<string, unknown>;

    // (3) 카드 조립 — swap도 이 안에서 결정된다 ⇒ 판정 단위 = 지분 × 파트
    const landAcqDate =
      dates?.land ??
      toOptionalDate(gated.landAcquisitionDate) ??
      toDate(share.acquisitionDate, "generalBuildingShares[].acquisitionDate");
    const built = buildGbPartCards(
      gated,
      sharePrice,
      transferDate,
      buildingAcqDate,
      landAcqDate,
      share.ownershipRatio,
      // 단건 `route.ts`의 `bundledAcq`·`bundledExp`와 같은 축 — 증축 일괄값이 있으면 그것, 없으면 지분 값.
      (gated.bundledAcquisitionPrice as number | undefined) ?? share.acquisitionPrice ?? 0,
      (gated.bundledExpenses as number | undefined) ?? share.expenses ?? 0,
      // 부담부증여 — 그 지분의 §159 정보 + 지분율(A·C 지분 축소). 비부담부증여면 둘 다 undefined(종전 경로 그대로).
      info,
      burdened ? share.ownershipRatio : undefined,
      // 계약 총액(100%) — 전 지분이 같은 계약서로 §100③을 판정한다(지분끼리 결론이 갈리지 않는다).
      totalTransferPrice,
    );

    // (4) 접미사 — 카드와 swap Map을 **같은 시점에** 태깅한다
    // 접미사는 문자열이다 — 컴패니언 축이 `assetId`를 쓰므로 leaf가 일반화됐다.
    const tagged = tagGbCards(built.cards, String(idx), share.shareLabel);
    const swap = built.swap ? remapGbSwap(built.swap, String(idx)) : undefined;

    // §104③ 미등기 — 지분 경로도 토지·건물 축을 싣는다. 여기서 빠뜨리면 **지분 모드에서만**
    // 미등기가 조용히 무시된다(단독 모드는 정상이라 발견이 늦다).
    const items = buildProperties(tagged, built.nonBusinessRatio, swap, {
      land: gated.unregisteredLand as boolean | undefined,
      building: gated.unregisteredBuilding as boolean | undefined,
    }, idx === 0 ? primaryReductions : mapReductionsToEngine(share.reductions ?? []), gated.nonHeirBequest as boolean | undefined);
    const bd = built.burdenedGiftBreakdown;
    const gbAssetBurdenedGift =
      carryoverApplied !== undefined && bd
        ? {
            assetId: String(idx),
            label: carryoverApplied ? `${share.shareLabel} · 이월과세 적용(당초 증여자 기준)` : share.shareLabel,
            breakdown: bd,
            carryoverApplied,
          }
        : undefined;
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
    return {
      built,
      tagged,
      swap,
      ap,
      items: gbAssetBurdenedGift ? items.map((it) => ({ ...it, gbAssetBurdenedGift })) : items,
      holdingStart: { land: landAcqDate, building: buildingAcqDate },
    };
  };
  type SharePiece = ReturnType<typeof buildPiece>;

  const piecesB: SharePiece[] = [];
  const piecesA: Array<SharePiece | undefined> = [];
  const drafts: GbBgCarryoverUnitDraft[] = [];

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
    const info = burdened ? share.burdenedGiftInfo : undefined;
    const co = carryoverOf[idx];
    if (!co || !info) {
      piecesB.push(buildPiece(share, idx, sharePrice, coerced, info, undefined, withShareBreakdown && info ? false : undefined));
      piecesA.push(undefined);
      return;
    }
    // B = 양도인(증여받은 사람) 기준 — K-6/K-7은 증여일 평가액(`actual*`)을 실지거래가액으로 읽는다(소령 §163⑨).
    const b = buildPiece(share, idx, sharePrice, coerced, toTransferorBasisInfo(info), undefined, false);
    // A = ①1호 취득가액 치환 + ①3호 증여세 상당액(§159 안분 단계가 소비) · §95④ 단서 — 토지·건물 기산일을 당초 증여자 취득일부터.
    const donor = co.ct.donorAcquisitionDate;
    const a = buildPiece(share, idx, sharePrice, coerced, applyCarryoverDonorBasis(info, co.ct.giftTaxAmount), { building: donor, land: donor }, true);
    piecesB.push(b);
    piecesA.push(a);
    drafts.push({
      assetId: String(idx),
      assetLabel: share.shareLabel,
      cardsB: b.items,
      cardsA: a.items,
      applicablePeriodYears: co.applicablePeriodYears,
      donorAcquisitionDate: donor,
      giftTaxAmount: co.ct.giftTaxAmount,
      holdingStartB: b.holdingStart,
    });
  });

  // (5) aggregate는 **1회만** — 기본공제 250만원(법 §103①)·§104⑤ 비교과세가 전 지분에 1번 적용된다.
  //     이월과세 지분은 외부 비교 단위다 — 집계가 신고 단위 결정세액으로 A/B를 고르고 그 구간 카드를 갈아 끼운다(순차 고정점 · 카드 순 = 지분 순).
  allProperties.push(...piecesB.flatMap((p) => p.items));
  const units = toGbCarryoverUnits(drafts, allProperties, (c) => c);
  // 물건 전체 §159 명세(증여세·표시) — 첫 지분이 이월과세 단위면 양도인 기준으로 읽는다(K-6/K-7 첫 지분의 info로는 명세를 만들 수 없다 · 묶음 PR-1과 같다).
  const wholeInfo = burdened?.wholeInfo && carryoverOf[0] ? toTransferorBasisInfo(burdened.wholeInfo) : burdened?.wholeInfo;
  const calc = calculateTransferTaxAggregateWithUnits(
    {
      taxYear,
      properties: allProperties,
      annualBasicDeductionUsed: annualBasicDeductionUsed ?? 0,
      // 카드는 **한 물건의 파트**(토지/건물)라 양도일이 같다 — §103②의 자산 순서가
      // 성립하지 않아 한계세율 축을 쓴다(종전 `"MAX_BENEFIT"`과 **같은 거동**).
      basicDeductionAllocation: "PARTS_HIGHEST_RATE",
      priorReductionUsage: (priorReductionUsage ?? []) as never,
      // 신고서 단위 정정 — aggregate가 1회만 소비한다(자산별 누수는 `:163`이 strip).
      amendment,
      // 🔴 G-13: 신고서 단위 가산세도 같은 층위에서 1회만 소비한다.
      filingPenaltyDetails,
      delayedPaymentDetails,
      // 부담부증여 — 물건 단위 §159·증여세(1회). 카드별 합이 아니다(집계 M-0.5).
      ...(wholeInfo && burdened ? { burdenedGiftWholeInfo: wholeInfo, burdenedGiftDate: burdened.date } : {}),
    },
    rates,
    undefined,
    units,
  );
  const aggregated = calc.result;

  // 결과 표시 재료는 **채택된 시나리오**의 카드로 모은다 — 결정세액(A)과 산식·안분 표가 갈리지 않게 한다.
  shares.forEach((share, idx) => {
    const adoptedA = piecesA[idx] && calc.units[String(idx)]?.adoptedScenario === "A";
    const { built, tagged, swap, ap } = adoptedA ? piecesA[idx]! : piecesB[idx];
    if (swap) {
      Object.assign(partDirectAddition, Object.fromEntries(swap.addition));
      Object.assign(partBeforeExtensionCapex, Object.fromEntries(swap.beforeExtensionAddition ?? []));
    }
    if (built.actualExpenseEcho) shareActualExpenseEcho[String(idx)] = built.actualExpenseEcho;
    // 실가 분기는 판정·상속 표지가 `actualBlockEcho`에, 환산 분기는 `detailBase`(`gbOut`)에 있다. ①②③은 두 분기 모두 `detailBase`.
    const blockSrc = { ...built.detailBase, ...built.actualBlockEcho } as GbShareBlockEcho;
    shareBlockEcho[String(idx)] = {
      label: share.shareLabel,
      ownershipRatio: share.ownershipRatio,
      ...(blockSrc.saleSplitJudgment ? { saleSplitJudgment: blockSrc.saleSplitJudgment } : {}),
      ...(blockSrc.acquisitionByInheritance ? { acquisitionByInheritance: true } : {}),
      ...(blockSrc.buildingAcquisitionByInheritance ? { buildingAcquisitionByInheritance: true } : {}),
      ...(blockSrc.preDeemedAcquisition ? { preDeemedAcquisition: blockSrc.preDeemedAcquisition } : {}),
    };
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
  // 지분별 [A]/[B] 비교 echo(키 = 카드 접미사) — 결과 카드·신고서 취득일이 읽는다.
  attachGbCarryoverUnits(calc, aggregated, drafts, units);
  // 본인 신축 §114조의2 가산세(K-5/K-7)가 붙었으면 «확인 필요» 고지 — 단건·컴패니언과 같은 문구·같은 조건.
  if (burdened && allCards.some((c) => c.penaltyAxis) && !aggregated.warnings.includes(GB_BG_SELF_BUILT_NOTICE)) {
    aggregated.warnings.push(GB_BG_SELF_BUILT_NOTICE);
  }

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
    // §100③ 판정 — 물건 전체(계약서 기재액) 한 번. 지분 판정이 갈리면 비우고 지분별 판정만 남긴다(D-2).
    saleSplitJudgment: propertySaleSplitJudgment(shares.map((_, idx) => shareBlockEcho[String(idx)]?.saleSplitJudgment)),
    // §163⑨ 상속 표지·의제취득일 전 ①②③ 비교는 **지분마다** 다르다 — 첫 지분 값을 물건 전체로 싣지 않고 `shareBlockEcho`로만 싣는다(D-1).
    acquisitionByInheritance: undefined,
    buildingAcquisitionByInheritance: undefined,
    preDeemedAcquisition: undefined,
    shareBlockEcho,
    // 카드는 **전 지분 concat** — 라벨에 지분 이름이 들어 있다.
    assetCards: allCards,
    ...(lastLandStdTotal !== undefined ? { landStdTotal: lastLandStdTotal } : {}),
    ...(lastBuildingStdTotal !== undefined ? { buildingStdTotal: lastBuildingStdTotal } : {}),
    ...(Object.keys(partDirectAddition).length > 0 ? { partDirectAddition } : {}),
    ...(Object.keys(partBeforeExtensionCapex).length > 0 ? { partBeforeExtensionCapex } : {}),
    ...(Object.keys(shareActualExpenseEcho).length > 0 ? { shareActualExpenseEcho } : {}),
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
    // 결과뷰의 «부담부증여 평가 명세»·증여세 신고서 슬롯 — 컴패니언(`bundled-route.ts`)·단건과 같은 키.
    ...(aggregated.burdenedGift ? { transferBurdenedGiftBreakdown: aggregated.burdenedGift } : {}),
  };
}
