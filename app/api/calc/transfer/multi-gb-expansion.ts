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
import { assembleShareDetail, buildSharePiece, shareTransferPrices } from "./general-building-fractional";
import type { GeneralBuildingSharePayload } from "./general-building-fractional";
import { coerceGeneralBuildingPayload } from "./general-building-route-helper";
import { shareCardSuffix } from "@/lib/tax-engine/general-building-share-id";
import { calculateTransferTaxAggregate } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type { RatesByTransferDate } from "@/lib/tax-engine/transfer-tax-item-rates";
import type { PreliminaryCardUnit } from "@/lib/tax-engine/transfer-tax-preliminary-filing";
import type { GbBundledAssetDetail } from "@/lib/tax-engine/types/transfer-aggregate.types";

export interface MultiGbSource {
  valuation?: Record<string, unknown>;
  /**
   * 지분 분할 취득(트랙 GS) — 있으면 `valuation` 대신 지분 카드로 펼친다. 단건 `calculateGeneralBuildingFractional`과 같은 지분 조각
   * (`buildSharePiece`)·같은 양도가액 분할(`shareTransferPrices`)·같은 결과 상세 조립(`assembleShareDetail`)을 쓴다.
   * 카드 id 접미사는 복합 `<자산id>.<지분번호>`다(계획서 `multi-carryover-bg-gb-shares.plan.md` Q-2 a).
   */
  shares?: { list: GeneralBuildingSharePayload[]; totalTransferPrice: number };
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
}

export function expandMultiGeneralBuildings(
  items: readonly TransferTaxItemInput[],
  gbOf: (index: number) => MultiGbSource | undefined,
): MultiGbExpansion {
  const properties: TransferTaxItemInput[] = [];
  const cardUnits: number[][] = [];
  const detailsByAsset: Record<string, GbBundledAssetDetail> = {};

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
      const ctx = { transferDate: item.transferDate, totalTransferPrice, primaryReductions: item.reductions };
      const pieces = list.map((share, i) =>
        buildSharePiece(ctx, share, i, shareCardSuffix(assetId, i), prices[i], coerceGeneralBuildingPayload(share.valuation), undefined, undefined, undefined));
      detailsByAsset[assetId] = assembleShareDetail(list, pieces, prices).detail as unknown as GbBundledAssetDetail;
      pushCards(pieces.flatMap((p) => p.items));
      return;
    }
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
    );
    // 부담부증여(소령 §159) — 카드마다 같은 자산 명세(`gbAssetBurdenedGift`)가 실린다. 자산 상세에 1회 옮겨 결과 행이 단건과 같은 명세 카드를 그린다(트랙 BG · V-BG2).
    const bg = cards[0]?.gbAssetBurdenedGift?.breakdown;
    const assetId = item.propertyId ?? `property-${index + 1}`;
    if (bg && detailsByAsset[assetId]) detailsByAsset[assetId] = { ...detailsByAsset[assetId], burdenedGiftBreakdown: bg };
    pushCards(cards);
  });

  return { properties, cardUnits, detailsByAsset };
}

/**
 * 일반건물 1건의 예정신고 세액 단위 — 카드 묶음을 단건 GB route와 같은 합산으로 한 번에 계산한다
 * (같은 날 양도한 파트라 §103② 순서가 서지 않아 파트 한계세율 순 — `PARTS_HIGHEST_RATE`, 단건 `calculateGeneralBuildingTransfer`와 같다).
 */
export function gbPreliminaryUnits(
  cardUnits: readonly number[][],
  taxYear: number,
  rates: TaxRatesMap,
  ratesByTransferDate?: RatesByTransferDate,
): PreliminaryCardUnit[] {
  return cardUnits.map((indices) => ({
    indices,
    calculate: (cards, annualBasicDeductionUsed) => {
      const r = calculateTransferTaxAggregate(
        {
          taxYear,
          properties: cards as unknown as TransferTaxItemInput[],
          annualBasicDeductionUsed,
          basicDeductionAllocation: "PARTS_HIGHEST_RATE",
        },
        rates,
        ratesByTransferDate,
      );
      return { determinedTax: r.determinedTax, reductionAmount: r.reductionAmount, ruralSurtax: r.ruralSurtax, basicDeduction: r.basicDeduction };
    },
  }));
}
