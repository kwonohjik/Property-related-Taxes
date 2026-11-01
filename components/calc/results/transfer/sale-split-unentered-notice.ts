/**
 * «구분 기재를 골랐으나 토지·건물 양도가액이 둘 다 비어 안분했다» 안내 — 판정·문장 단일 소스.
 *
 * 계획서: `docs/00-pm/sale-split-actual-both-empty.plan.md` §10 (사용자 결정 Q-1 B — 계산은 그대로 두고 흔적만 표시).
 *
 * ## 표시 조건 = 폼 한 칸 ∧ 엔진 echo 한 칸
 *
 *  - 폼 `AssetForm.saleSplitMode === "actual"` — 사용자가 「구분 기재」를 골랐다. 일반건물은 와이어에 모드를 싣지 않으므로
 *    (Q-7) 엔진은 이 사실을 모른다. `exemptionNote`와 같은 구조로 호출부가 폼에서 읽어 넘긴다.
 *  - 엔진 `saleApportionBasisKind` — 엔진이 구분 기재 **없이** 안분했고, 그때 **실제로 쓴** basis다. 표시 계층이 감정평가 서열을
 *    다시 구현하지 않는다(메모리 `feedback_engine_result_display_drift`). 구분 기재가 있으면 이 값이 없다(`saleSplitJudgment`와 배타).
 *
 * 결과 카드·신고서 양식 표 각주·상세명세서 «양도가액» note가 **같은 함수**를 불러 문장이 갈라지지 않는다.
 */
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { ApportionBasisKind } from "@/lib/tax-engine/sale-split-apportion-basis";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";
import type { AggregateMeta } from "./FilingFormTableHelpers";
import { cardSuffixOf } from "@/lib/tax-engine/general-building-share-id";
import { shareIndexOf } from "@/lib/tax-engine/general-building-share-id";

const BASIS_LABEL: Record<ApportionBasisKind, string> = {
  appraisal: "양도시 감정평가가액",
  std_price: "양도시 기준시가",
};

/** 안내 한 줄 — 엔진이 실제로 쓴 basis 종류로 문구가 갈린다. */
export function saleSplitUnenteredText(kind: ApportionBasisKind): string {
  return `구분 기재를 선택했으나 토지·건물 양도가액이 입력되지 않아 ${BASIS_LABEL[kind]} 비율로 안분했습니다 (${TRANSFER.BUNDLED_APPORTIONMENT})`;
}

/** 사용자가 「구분 기재」를 골랐는가 — 호출부가 `SplitGainDetailSection`에 넘기는 불리언의 단일 정의. */
export function isSaleSplitActual(asset: Pick<AssetForm, "saleSplitMode"> | undefined): boolean {
  return asset?.saleSplitMode === "actual";
}

/** 폼 선택 ∧ 엔진 echo가 모두 참일 때만 문장을 돌려준다. */
export function saleSplitUnenteredNotice(actual: boolean | undefined, kind: ApportionBasisKind | undefined): string | null {
  return actual && kind ? saleSplitUnenteredText(kind) : null;
}

/** `FilingFormTableAggregateHelpers`의 `findAssetByPropertyId`와 같은 규약 — 카드 id → 폼 자산. */
/**
 * 카드 id 접미사 → 폼 자산: `land#${자산id}`(함께 양도) · `land#primary`(첫 자산) · `land#1`(지분 — 접미사가 자산 인덱스).
 * 접미사가 없거나 찾지 못하면 `undefined`.
 */
export function assetOfCardSuffix(propertyId: string, assets: AssetForm[]): AssetForm | undefined {
  const suffix = cardSuffixOf(propertyId);
  if (!suffix) return undefined;
  if (suffix === "primary") return assets[0];
  const shareIdx = shareIndexOf(propertyId);
  return shareIdx !== undefined ? assets[shareIdx] : assets.find((a) => a.assetId === suffix);
}

export function assetOfProperty(
  propertyId: string,
  formData: TransferFormData | undefined,
  propertyFormMap: AggregateMeta["propertyFormMap"],
): AssetForm | undefined {
  const fromPropertyForm = propertyFormMap?.get(propertyId)?.assets[0];
  if (fromPropertyForm) return fromPropertyForm;
  const assets = formData?.assets;
  if (!assets) return undefined;
  const direct = assets.find((a) => a.assetId === propertyId);
  if (direct) return direct;
  const byCard = assetOfCardSuffix(propertyId, assets);
  if (byCard) return byCard;
  // 첫 자산은 카드 id가 "primary"(한도 초과 분리 시 "primary__appurtenant" / "primary__excess" · 이월과세 채무 부분(매입분) 조각은 "primary__purchased")다.
  const basePid = propertyId.replace(/__(appurtenant|excess|purchased)$/, "");
  if (basePid === "primary") return assets[0];
  return basePid !== propertyId ? assets.find((a) => a.assetId === basePid) : undefined;
}

/**
 * 화면(결과·신고서·명세서)에 띄울 안내 문장들.
 *
 *  - 단건: `result.splitDetail` / `result.generalBuildingValuationDetail` + `asset ?? formData.assets[0]`
 *  - 합산(aggregate): 자산별 `properties[].splitDetail`(split·컴패니언·다건) + `aggregated.generalBuildingValuationDetail`(일반건물) + `aggregated.generalBuildingDetailsByAsset`(함께 양도 일반건물)
 *  - 자산이 둘 이상 한 화면에 있는 split은 어느 자산인지 `propertyLabel`을 앞에 붙인다.
 */
export function collectSaleSplitUnenteredNotices(args: {
  result?: TransferTaxResult;
  formData?: TransferFormData;
  asset?: AssetForm;
  aggregate?: Pick<AggregateMeta, "properties" | "aggregated" | "propertyFormMap">;
}): string[] {
  const { result, formData, asset, aggregate } = args;

  if (aggregate && aggregate.properties.length > 0) {
    const lines: string[] = [];
    const many = aggregate.properties.length > 1;
    for (const p of aggregate.properties) {
      const kind = p.splitDetail?.saleApportionBasisKind;
      if (!kind) continue;
      const text = saleSplitUnenteredNotice(isSaleSplitActual(assetOfProperty(p.propertyId, formData, aggregate.propertyFormMap)), kind);
      if (text) lines.push(many ? `${p.propertyLabel}: ${text}` : text);
    }
    // 일반건물은 토지·건물 카드로 분해돼 자산이 하나다 — 폼의 일반건물 자산(없으면 첫 자산)을 본다.
    const gbKind = aggregate.aggregated.generalBuildingValuationDetail?.saleApportionBasisKind;
    if (gbKind) {
      const forms = [formData, ...(aggregate.propertyFormMap ? [...aggregate.propertyFormMap.values()] : [])];
      const assets = forms.flatMap((f) => f?.assets ?? []);
      const gbAsset = assets.find((a) => a.assetKind === "general_building") ?? assets[0];
      const text = saleSplitUnenteredNotice(isSaleSplitActual(gbAsset), gbKind);
      if (text) lines.push(text);
    }
    /*
     * 함께 양도 일반건물 — 자산별 상세(키 = 자산 id = 카드 접미사 · 단건 슬롯과 배타). 폼도 그 자산의 것을 본다(`gb-bundled-result-blocks.plan.md` C-3).
     * 라벨은 그 자산 카드 라벨의 자산 머리(「주 자산 토지(1001)」 → 「주 자산」 — `tagGbCards`가 붙인 것)다.
     */
    for (const [assetId, d] of Object.entries(aggregate.aggregated.generalBuildingDetailsByAsset ?? {})) {
      const text = saleSplitUnenteredNotice(
        isSaleSplitActual(assetOfProperty(assetId, formData, aggregate.propertyFormMap)),
        d.saleApportionBasisKind,
      );
      if (!text) continue;
      const cardLabel = aggregate.properties.find((p) => cardSuffixOf(p.propertyId) === assetId)?.propertyLabel ?? "";
      const label = cardLabel.slice(0, Math.max(0, cardLabel.lastIndexOf(" "))).trim();
      lines.push(many && label ? `${label}: ${text}` : text);
    }
    return lines;
  }

  const kind = result?.splitDetail?.saleApportionBasisKind ?? result?.generalBuildingValuationDetail?.saleApportionBasisKind;
  const text = saleSplitUnenteredNotice(isSaleSplitActual(asset ?? formData?.assets[0]), kind);
  return text ? [text] : [];
}
