/**
 * 결과 카드 일반건물 블록(`GbResultBlocks`·`GeneralBuilding3WayTable`)이 읽는 「블록 뷰」 — 일반건물 한 물건분.
 *
 * 계획서: `docs/00-pm/gb-bundled-result-blocks.plan.md` D-2.
 *  - 단건·지분 분할: 결과 상세 슬롯(`generalBuildingValuationDetail`) 하나 → 뷰 1개. 소스는 종전 그대로다(회귀 0).
 *  - 함께 양도: 자산별 상세(`generalBuildingDetailsByAsset`)를 폼 자산 순서로 펼친다 → 일반건물 자산마다 뷰 1개.
 *    🔑 안분 표 행은 함께 양도에서 **자산** 단위라(주 자산 행 하나 — 파트 값이 아니다) 파트 취득가액은 그 자산의 파트 카드에서 읽는다(C-2).
 *  - 둘 다 없으면(저장된 옛 결과) 빈 목록 — 종전처럼 미표시.
 */
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";
import type {
  AggregateTransferResult,
  GbShareBlockEcho,
  GbSwapComparison,
  PerPropertyBreakdown,
} from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";
import { shareIndexOf } from "@/lib/tax-engine/general-building-share-id";
import { cardAcquisitionPriceWithPieces } from "@/lib/tax-engine/general-building-purchased-pieces";

export interface GbBlockView {
  /** 함께 양도 자산 id(카드 id 접미사). 단건은 `undefined`. */
  assetId?: string;
  /** 함께 양도만 — 안분 표 행 라벨(「주 자산」·「자산 2」). 단건은 소제목 없이 그린다. */
  label?: string;
  detail: GeneralBuildingOutput;
  /** 그 일반건물의 폼 자산 — 구분 기재 선택·§166⑧ 예외 근거를 읽는다(C-3). */
  asset: AssetForm | undefined;
  /** §163⑨ 블록의 파트 취득가액 — 그 파트가 없으면 `undefined`(행 생략). */
  partAcquisitionPrice: (kind: "land" | "building") => number | undefined;
  /** §97②2호 단서 발동 비교 — 미발동이면 `undefined`. */
  swapComparison?: GbSwapComparison;
  /** 지분 분할(축 B)만 — 지분별 블록 재료(지분 순서). 저장된 옛 결과는 없다(종전 표시). */
  shares?: GbShareBlockView[];
}

/** 지분 하나의 블록 뷰 — 파트 값·추계 여부는 그 지분 카드(`#key`)에서 읽는다(`gb-fractional-result-blocks.plan.md` D-3). */
export interface GbShareBlockView extends GbShareBlockEcho {
  key: string;
  partAcquisitionPrice: (kind: "land" | "building") => number | undefined;
  /** 그 지분의 파트 카드가 ③(추계)으로 계산됐는가 — ①②③ echo가 없을 때의 상속 라벨 근거. */
  partConverted: (kind: "land" | "building") => boolean;
}

/** 파트 카드 중 §163⑨ 블록의 토지분·건물분 — 증축분(건물2)은 상속 대상이 아니라 뺀다(`partConverted`와 같은 축). */
const isPartCard = (c: GeneralBuildingOutput["assetCards"][number], kind: "land" | "building") =>
  kind === "land"
    ? c.propertyType === "land"
    : c.propertyType === "general_building_unit" && !c.propertyId.includes("building2");

/**
 * 지분별 블록 뷰 — 지분 echo(키 = 지분 번호) + 그 지분의 파트 카드. 단건 축 B(`land#0`)와 연간 합산 지분(`land#<자산id>.0` · Q-2 a)이 같은 조립을 쓴다.
 * 카드는 접미사의 **지분 번호**로 고른다(`shareIndexOf`) — 연간 합산 복합 접미사의 자산 부분(`cardSuffixOf`)은 지분을 가리지 못한다.
 */
function shareBlockViews(
  shareEcho: Record<string, GbShareBlockEcho>,
  assetCards: GeneralBuildingOutput["assetCards"],
  properties: PerPropertyBreakdown[],
): GbShareBlockView[] {
  return Object.keys(shareEcho)
    .sort((a, b) => Number(a) - Number(b))
    .map((key) => {
      const partCard = (kind: "land" | "building") =>
        assetCards.find((c) => String(shareIndexOf(c.propertyId)) === key && isPartCard(c, kind));
      return {
        ...shareEcho[key],
        key,
        partAcquisitionPrice: (kind) => {
          const card = partCard(kind);
          // 채무 부분(매입분) 꼬리가 있으면 증여분 + 매입분 — 꼬리를 합치지 않으면 파트 취득가액이 증여분뿐이다.
          return card ? cardAcquisitionPriceWithPieces(properties, card.propertyId) : undefined;
        },
        partConverted: (kind) => !!partCard(kind)?.usedEstimatedAcquisition,
      } satisfies GbShareBlockView;
    });
}

export function gbBlockViewsOf(
  aggregated: AggregateTransferResult,
  apportionment: BundledApportionmentResult,
  formData: TransferFormData,
): GbBlockView[] {
  const single = aggregated.generalBuildingValuationDetail;
  if (single) {
    const shareEcho = single.shareBlockEcho;
    return [
      {
        detail: single,
        asset: formData.assets.find((a) => a.assetKind === "general_building") ?? formData.assets[0],
        partAcquisitionPrice: (kind) =>
          apportionment.apportioned.find((a) => a.assetKind === kind)?.allocatedAcquisitionPrice,
        ...(aggregated.swapApplied && aggregated.swapComparison ? { swapComparison: aggregated.swapComparison } : {}),
        ...(shareEcho ? { shares: shareBlockViews(shareEcho, single.assetCards, aggregated.properties) } : {}),
      },
    ];
  }
  const byAsset = aggregated.generalBuildingDetailsByAsset ?? {};
  const order = (id: string) => (id === "primary" ? 0 : 1 + formData.assets.findIndex((a) => a.assetId === id));
  return Object.keys(byAsset)
    .sort((a, b) => order(a) - order(b))
    .map((assetId) =>
      gbAssetBlockView(
        aggregated,
        assetId,
        apportionment.apportioned.find((a) => a.assetId === assetId)?.assetLabel ?? assetId,
        assetId === "primary" ? formData.assets[0] : formData.assets.find((a) => a.assetId === assetId),
      ),
    );
}

/**
 * 자산별 상세(`generalBuildingDetailsByAsset`)의 한 일반건물 → 블록 뷰. 함께 양도(위)와 다건 합산(`MultiGbAssetGroup`)이 같은 leaf를 쓴다.
 */
export function gbAssetBlockView(
  aggregated: AggregateTransferResult,
  assetId: string,
  label: string,
  asset: AssetForm | undefined,
): GbBlockView {
  const detail = (aggregated.generalBuildingDetailsByAsset ?? {})[assetId];
  const cards = aggregated.properties.filter((p) => cardSuffixOf(p.propertyId) === assetId);
  const acqOf = (id: string): number | undefined => cardAcquisitionPriceWithPieces(cards, id);
  return {
    assetId,
    label,
    detail,
    asset,
    partAcquisitionPrice: (kind) => {
      const card = detail.assetCards.find((c) => isPartCard(c, kind));
      return card ? acqOf(card.propertyId) : undefined;
    },
    ...(detail.swapComparison ? { swapComparison: detail.swapComparison } : {}),
    // 연간 합산 지분 분할(트랙 GS) — 자산 상세에 지분 echo가 있으면 단건 축 B와 같은 지분별 블록을 그린다.
    ...(shareEchoOf(detail) ? { shares: shareBlockViews(shareEchoOf(detail)!, detail.assetCards, cards) } : {}),
  };
}

const shareEchoOf = (detail: GeneralBuildingOutput): Record<string, GbShareBlockEcho> | undefined =>
  (detail as { shareBlockEcho?: Record<string, GbShareBlockEcho> }).shareBlockEcho;

/** 3-way 표가 읽는 그 일반건물의 파트 카드 결과 — 단건은 전 카드, 함께 양도는 같은 접미사 카드만. */
export function gbViewProperties(aggregated: AggregateTransferResult, view: GbBlockView): PerPropertyBreakdown[] {
  return view.assetId === undefined
    ? aggregated.properties
    : aggregated.properties.filter((p) => cardSuffixOf(p.propertyId) === view.assetId);
}
