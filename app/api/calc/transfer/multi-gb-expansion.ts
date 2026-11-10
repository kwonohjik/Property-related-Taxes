/**
 * ⑭ 다건 합산 — 일반건물 항목을 토지·건물 카드로 펼친다
 * (계획서 `docs/00-pm/multi-building-valuation-support.plan.md` 트랙 G · G-1·G-2·G-5).
 *
 * 단건 route는 일반건물을 엔진(`calculateTransferTax`)에 넣지 않고 파트 카드를 만들어 합산 엔진을 직접 부른다
 * (`dispatchGeneralBuilding`). 다건은 같은 카드를 **다른 자산과 한 합산에** 넣어야 하므로, 함께 양도 컴패니언이 이미 쓰는
 * 카드 함수(`buildGbCompanionItems`)로 펼친다 — 카드를 합산 엔진에 끼우면 단건과 같은 세액이다(계획서 §3.2 probe).
 *
 * 펼친 뒤 「폼 1건 = 엔진 항목 1건」에 기대던 두 곳을 맞춘다:
 * - 가산세 입력(`filingPenaltyDetails`·`delayedPaymentDetails`)은 **첫 카드에만** 싣는다 — 신고 1건의 가산세가
 *   카드 수만큼 배가되지 않게(단건 GB가 신고 단위로 1회 계산하는 것과 같은 축).
 * - 예정신고 세액(가산세 base)은 카드 묶음을 한 번에 계산하는 단위(`cardUnits`)로 넘긴다.
 */
import { buildGbCompanionItems } from "./general-building-part-cards";
import type { GbBgCarryoverUnitDraft } from "./general-building-part-cards";
import { assembleShareDetail, buildShareScenarioPieces, shareTransferPrices } from "./general-building-fractional";
import type { GeneralBuildingSharePayload } from "./general-building-fractional";
import { shareCardSuffix } from "@/lib/tax-engine/general-building-share-id";
import { calculateTransferTaxAggregateWithUnits } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { ExternalCarryoverUnit } from "@/lib/tax-engine/transfer-tax-aggregate";
import { toTransferorBasisInfo } from "@/lib/tax-engine/transfer-tax-carryover-burdened-gift";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RatesByTransferDate } from "@/lib/tax-engine/transfer-tax-item-rates";
import type { PreliminaryCardUnit } from "@/lib/tax-engine/transfer-tax-preliminary-filing";
import type { GbBundledAssetDetail } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";
import { buildBundleBurdenedGiftWhole } from "@/lib/tax-engine/transfer-tax-aggregate-burdened-gift";
import { withCardAcquisitions } from "@/lib/tax-engine/transfer-tax-aggregate-burdened-gift";
import { donorBuiltNotAppliedEcho } from "@/lib/tax-engine/transfer-tax-carryover-donor-penalty";
import type { DonorBuiltPenaltyEcho } from "@/lib/tax-engine/types/transfer-carryover.types";

export interface MultiGbSource {
  valuation?: Record<string, unknown>;
  /**
   * 지분 분할 취득(트랙 GS) — 있으면 `valuation` 대신 지분 카드로 펼친다. 단건 `calculateGeneralBuildingFractional`과 같은 지분 조각
   * (`buildSharePiece`)·같은 양도가액 분할(`shareTransferPrices`)·같은 결과 상세 조립(`assembleShareDetail`)을 쓴다.
   * 카드 id 접미사는 복합 `<자산id>.<지분번호>`다(계획서 `multi-carryover-bg-gb-shares.plan.md` Q-2 a).
   */
  shares?: {
    list: GeneralBuildingSharePayload[];
    totalTransferPrice: number;
    /** 부담부증여 — 물건 전체 §159 정보(채무 미안분 · 표시 전용). 단건 축 B `burdenedGiftWholeInfo`와 같은 값 · 결과 명세 1회. */
    burdenedGiftWholeInfo?: BurdenedGiftInfo;
  };
  ownershipRatio?: number;
  /** 공유지분 — 그 물건 전체(100%) 양도가액(§100③ 계약서 구분 기재 판정 · 단건 `contractTotalPrice`와 같은 값) */
  totalPropertyTransferPrice?: number;
}

export interface MultiGbExpansion {
  properties: TransferTaxItemInput[];
  /** 일반건물 1건의 카드 인덱스(펼친 `properties` 기준). 첫 인덱스가 가산세 입력을 가진 카드다. */
  cardUnits: number[][];
  /** 자산 id별 결과 상세(산식 재료) — 단건 슬롯 `generalBuildingValuationDetail`은 수정신고 판별자라 쓰지 않는다(일괄양도와 같은 맵). */
  detailsByAsset: Record<string, GbBundledAssetDetail>;
  /**
   * 일반건물 부담부증여 × 이월과세(§97의2) 비교 단위 재료 — 카드 순. 키는 자산 id(지분은 복합 접미사 `<자산id>.<지분번호>`).
   * 단건 F27·지분 경로·함께 부담부증여 묶음과 같은 카드 세트 A·B다. route가 `toGbCarryoverUnits`로 집계 외부 단위를 만든다.
   */
  carryoverDrafts: GbBgCarryoverUnitDraft[];
  /**
   * 지분 물건의 결과 상세를 **채택된 시나리오** 조각으로 다시 조립한다(단건 지분 경로와 같은 순서 — 집계 뒤).
   * `adoptedA(키)`는 그 비교 단위가 A로 채택됐는가. 이월과세 지분이 없는 물건은 펼칠 때 상세가 이미 정해졌다.
   */
  finalizeShareDetails: (adoptedA: (key: string) => boolean) => void;
  /**
   * 당초 증여자 신축·증축(§114조의2)을 보냈는데 이월과세가 배제(§97의2①괄호·②1·2호·③)돼 비교 단위가 없는 자산 — 단건 F27의 carryover_excluded echo와 같다.
   * A·B 비교 단위의 echo는 route가 집계 뒤 `attachGbDonorBuiltEchoes`로 만든다.
   */
  donorBuiltExcluded: Record<string, { label: string; echo: DonorBuiltPenaltyEcho }>;
}

export function expandMultiGeneralBuildings(
  items: readonly TransferTaxItemInput[],
  gbOf: (index: number) => MultiGbSource | undefined,
): MultiGbExpansion {
  const properties: TransferTaxItemInput[] = [];
  const cardUnits: number[][] = [];
  const detailsByAsset: Record<string, GbBundledAssetDetail> = {};
  const carryoverDrafts: GbBgCarryoverUnitDraft[] = [];
  const shareFinalizers: Array<(adoptedA: (key: string) => boolean) => void> = [];
  const donorBuiltExcluded: Record<string, { label: string; echo: DonorBuiltPenaltyEcho }> = {};

  items.forEach((item, index) => {
    /** 펼친 카드 묶음 1건 — 가산세 입력은 첫 카드에만 · 예정신고 단위는 그 묶음 전체. */
    const pushCards = (cards: TransferTaxItemInput[]) => {
      const start = properties.length;
      cards.forEach((card, i) =>
        properties.push(
          i === 0
            ? { ...card, filingPenaltyDetails: item.filingPenaltyDetails, delayedPaymentDetails: item.delayedPaymentDetails }
            : card,
        ),
      );
      cardUnits.push(cards.map((_, i) => start + i));
    };

    const gb = gbOf(index);
    if (!gb) {
      properties.push(item);
      return;
    }
    if (gb.shares) {
      const assetId = item.propertyId ?? `property-${index + 1}`;
      const { list, totalTransferPrice } = gb.shares;
      const prices = shareTransferPrices(list, totalTransferPrice);
      // 부담부증여(소령 §159) — 단건 축 B와 같이 지분마다 그 지분의 §159 정보로 카드를 만든다(채무 지분 안분 · 평가액은 지분율로 축소).
      //   부담부증여 × 이월과세 지분은 카드 세트 A·B를 만들어 비교 단위로 넘긴다 — 단건 지분 경로와 같은 함수(`buildShareScenarioPieces`).
      const burdened = item.transferType === "burdened_gift" ? { date: item.transferDate } : undefined;
      const ctx = { transferDate: item.transferDate, totalTransferPrice, primaryReductions: item.reductions, burdened };
      const { piecesB, piecesA, drafts, firstIsCarryover } = buildShareScenarioPieces(list, ctx, prices, (i) => shareCardSuffix(assetId, i));
      const cards = piecesB.flatMap((p) => p.items);
      // 결과 상세 — 단건 축 B 집계(`transfer-tax-aggregate-once.ts`)와 같은 두 함수: 물건 전체 §159·증여세 1회 + 취득 열은 (채택된) 지분 카드 합.
      //   첫 지분이 이월과세 단위면 물건 전체 명세는 양도인 기준으로 읽는다(단건 지분 경로와 같다).
      const wholeInfo = gb.shares.burdenedGiftWholeInfo;
      const assemble = (adopted: typeof piecesB) => {
        const detail = assembleShareDetail(list, adopted, prices).detail as unknown as GbBundledAssetDetail;
        const whole = burdened && wholeInfo
          ? withCardAcquisitions(
              buildBundleBurdenedGiftWhole({ burdenedGiftWholeInfo: firstIsCarryover ? toTransferorBasisInfo(wholeInfo) : wholeInfo, burdenedGiftDate: burdened.date } as never),
              adopted.flatMap((p) => p.items).map((card) => ({ item: card, result: {} })),
            )
          : undefined;
        detailsByAsset[assetId] = whole ? { ...detail, burdenedGiftBreakdown: whole } : detail;
      };
      assemble(piecesB);
      if (drafts.length > 0)
        shareFinalizers.push((adoptedA) =>
          assemble(piecesB.map((b, i) => (piecesA[i] && adoptedA(shareCardSuffix(assetId, i)) ? piecesA[i]! : b))),
        );
      // A 카드의 가산세 입력은 route가 B 카드(가산세 주입 뒤)에서 옮긴다(`finalUnits`).
      carryoverDrafts.push(...drafts);
      pushCards(cards);
      return;
    }
    const draftsOfItem: GbBgCarryoverUnitDraft[] = [];
    const cards = buildGbCompanionItems(
      gb.valuation ?? {},
      item,
      {
        ownershipRatio: gb.ownershipRatio,
        assetId: item.propertyId ?? `property-${index + 1}`,
        assetLabel: item.propertyLabel ?? "",
        totalPropertyTransferPrice: gb.totalPropertyTransferPrice,
        // §164⑨ 1호 — 단건 route가 `dispatchGeneralBuilding`에 넘기는 최상위 3필드(V-G3: 빠지면 환산 분모 특례가 사라진다)
        expropriation: {
          transferCause: item.transferCause,
          compensationPerSqm: item.compensationPerSqm,
          compensationBasisStdPrice: item.compensationBasisStdPrice,
        },
      },
      (assetId, detail) => {
        detailsByAsset[assetId] = detail;
      },
      // 부담부증여 × 이월과세(§97의2) — 카드 세트 A·B 비교 단위(함께 부담부증여 묶음과 같은 재료). A가 채택되면 결과 상세는 A 카드 것으로 바뀐다
      //   (`attachGbCarryoverUnits`) — A의 §159 명세도 함께 옮긴다(단건 F27은 채택 시나리오의 명세를 싣는다).
      (draft) => {
        const bgA = draft.cardsA[0]?.gbAssetBurdenedGift?.breakdown;
        draftsOfItem.push(draft.detailA && bgA ? { ...draft, detailA: { ...draft.detailA, burdenedGiftBreakdown: bgA } } : draft);
      },
    );
    // 부담부증여(소령 §159) — 카드마다 같은 자산 명세(`gbAssetBurdenedGift`)가 실린다. 자산 상세에 1회 옮겨 결과 행이 단건과 같은 명세 카드를 그린다(트랙 BG · V-BG2).
    const bg = cards[0]?.gbAssetBurdenedGift?.breakdown;
    const assetId = item.propertyId ?? `property-${index + 1}`;
    if (bg && detailsByAsset[assetId]) detailsByAsset[assetId] = { ...detailsByAsset[assetId], burdenedGiftBreakdown: bg };
    // 이월과세 배제로 비교 단위가 안 생겼는데 증여자 신축을 보냈다 — 입력을 받고도 말이 없으면 침묵 소실이라 중립 echo(단건 F27과 같다).
    const donorBuilt = item.transferType === "burdened_gift" ? item.burdenedGiftInfo?.carryoverDonorBasis?.donorBuilt : undefined;
    if (donorBuilt && draftsOfItem.length === 0)
      donorBuiltExcluded[assetId] = { label: item.propertyLabel ?? "", echo: donorBuiltNotAppliedEcho(donorBuilt, "carryover_excluded") };
    carryoverDrafts.push(...draftsOfItem);
    pushCards(cards);
  });

  return {
    properties,
    cardUnits,
    detailsByAsset,
    carryoverDrafts,
    finalizeShareDetails: (adoptedA) => shareFinalizers.forEach((f) => f(adoptedA)),
    donorBuiltExcluded,
  };
}

/**
 * 일반건물 1건의 예정신고 세액 단위 — 카드 묶음을 단건 GB route와 같은 합산으로 한 번에 계산한다
 * (같은 날 양도한 파트라 §103② 순서가 서지 않아 파트 한계세율 순 — `PARTS_HIGHEST_RATE`, 단건 `calculateGeneralBuildingTransfer`와 같다).
 *
 * 부담부증여 × 이월과세 비교 단위(`carryoverUnits` — 펼친 카드 기준 위치)는 그 물건 안에서 A·B를 비교한다 — 예정신고는 물건 1건의 신고라
 * 단건 F27·지분 경로와 같은 비교 범위다(확정신고 비교는 route의 연간 합산이 따로 한다).
 */
export function gbPreliminaryUnits(
  cardUnits: readonly number[][],
  taxYear: number,
  rates: TaxRatesMap,
  ratesByTransferDate?: RatesByTransferDate,
  carryoverUnits: readonly ExternalCarryoverUnit[] = [],
): PreliminaryCardUnit[] {
  return cardUnits.map((indices) => ({
    indices,
    calculate: (cards, annualBasicDeductionUsed) => {
      // 예정신고 세액 계산은 가산세·정정 입력을 벗긴 카드로 한다(`computePreliminaryFilingTaxes`) — A 카드도 같게.
      const local = carryoverUnits
        .filter((u) => indices.includes(u.start))
        .map((u) => ({
          ...u,
          start: indices.indexOf(u.start),
          cardsA: u.cardsA.map((c) => ({ ...c, amendment: undefined, filingPenaltyDetails: undefined, delayedPaymentDetails: undefined })),
        }));
      const r = calculateTransferTaxAggregateWithUnits(
        {
          taxYear,
          properties: cards as unknown as TransferTaxItemInput[],
          annualBasicDeductionUsed,
          basicDeductionAllocation: "PARTS_HIGHEST_RATE",
        },
        rates,
        ratesByTransferDate,
        local,
      ).result;
      return { determinedTax: r.determinedTax, reductionAmount: r.reductionAmount, ruralSurtax: r.ruralSurtax, basicDeduction: r.basicDeduction };
    },
  }));
}
