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
  GbSwapComparison,
  PerPropertyBreakdown,
} from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";

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
}

/** 파트 카드 중 §163⑨ 블록의 토지분·건물분 — 증축분(건물2)은 상속 대상이 아니라 뺀다(`partConverted`와 같은 축). */
const isPartCard = (c: GeneralBuildingOutput["assetCards"][number], kind: "land" | "building") =>
  kind === "land"
    ? c.propertyType === "land"
    : c.propertyType === "general_building_unit" && !c.propertyId.includes("building2");

export function gbBlockViewsOf(
  aggregated: AggregateTransferResult,
  apportionment: BundledApportionmentResult,
  formData: TransferFormData,
): GbBlockView[] {
  const single = aggregated.generalBuildingValuationDetail;
  if (single) {
    return [
      {
        detail: single,
        asset: formData.assets.find((a) => a.assetKind === "general_building") ?? formData.assets[0],
        partAcquisitionPrice: (kind) =>
          apportionment.apportioned.find((a) => a.assetKind === kind)?.allocatedAcquisitionPrice,
        ...(aggregated.swapApplied && aggregated.swapComparison ? { swapComparison: aggregated.swapComparison } : {}),
      },
    ];
  }
  const byAsset = aggregated.generalBuildingDetailsByAsset ?? {};
  const order = (id: string) => (id === "primary" ? 0 : 1 + formData.assets.findIndex((a) => a.assetId === id));
  return Object.keys(byAsset)
    .sort((a, b) => order(a) - order(b))
    .map((assetId) => {
      const detail = byAsset[assetId];
      const cards = aggregated.properties.filter((p) => cardSuffixOf(p.propertyId) === assetId);
      const acqOf = (id: string): number | undefined => cards.find((p) => p.propertyId === id)?.acquisitionPrice;
      return {
        assetId,
        label: apportionment.apportioned.find((a) => a.assetId === assetId)?.assetLabel ?? assetId,
        detail,
        asset: assetId === "primary" ? formData.assets[0] : formData.assets.find((a) => a.assetId === assetId),
        partAcquisitionPrice: (kind) => {
          const card = detail.assetCards.find((c) => isPartCard(c, kind));
          return card ? acqOf(card.propertyId) : undefined;
        },
        ...(detail.swapComparison ? { swapComparison: detail.swapComparison } : {}),
      };
    });
}

/** 3-way 표가 읽는 그 일반건물의 파트 카드 결과 — 단건은 전 카드, 함께 양도는 같은 접미사 카드만. */
export function gbViewProperties(aggregated: AggregateTransferResult, view: GbBlockView): PerPropertyBreakdown[] {
  return view.assetId === undefined
    ? aggregated.properties
    : aggregated.properties.filter((p) => cardSuffixOf(p.propertyId) === view.assetId);
}
