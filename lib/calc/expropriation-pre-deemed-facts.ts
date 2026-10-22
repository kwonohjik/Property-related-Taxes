/**
 * 의제취득일(1985.1.1.) 전 상속·증여 ③ 후보 — 영 §164⑨ 특례 칸(⑤ `ExpropriationBlock`)과 필수 게이트(⑧)가 함께 쓰는 사실
 * (계획서 docs/02-design/features/inheritance-pre-deemed-clause-b-revisit.plan.md §14 · Q-10 A).
 *
 * ③은 환산이라 분모(양도 당시 기준시가)에 §164⑨이 걸린다. 상속 자산에는 환산 토글이 없어 종전 게이트
 * (`useEstimatedAcquisition`)로는 보상액 칸이 열리지 않았다.
 *
 * ⑫는 API 본문으로 같은 판정(`isPreDeemedConversionCandidate`)을 한다. 여기서는 ④ 빌더가 만드는 조각을 넣는다 —
 * PD-1(`preDeemedConversionInputError` ↔ `refinePreDeemedAcquisitionSource`)과 같은 짝이다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isPreDeemedConversionCandidate } from "./expropriation-required-gate";
import { buildInheritedAcquisitionPayload, buildInheritedHouseValuationPayload } from "./transfer-tax-api-inheritance";
import { buildPre1990LandPayload } from "./transfer-tax-api-helpers";
import { buildCommercialBuildingValuation } from "./transfer-tax-api-commercial";
import { primaryAcquisitionModeFlags } from "./transfer-tax-api-primary-context";
import { effectiveLandAcquisitionCause } from "./transfer-land-part-cause";
import { isPreDeemedLandPart } from "@/lib/tax-engine/transfer-split-part-cause";

export interface PreDeemedExprFacts {
  preDeemedConversion: boolean;
  preDeemedSplitLand: boolean;
}

/** `splitActive` = 토지·건물 취득일 분리가 화면에서 살아 있다(④·⑧과 같은 `hasStaleSplitInput` 판정을 호출부가 넘긴다). */
export function preDeemedExprFacts(
  asset: AssetForm,
  transferDate: string | undefined,
  splitActive: boolean,
): PreDeemedExprFacts {
  return {
    preDeemedConversion: preDeemedConversionFromForm(asset, transferDate ?? ""),
    preDeemedSplitLand: splitActive && isPreDeemedLandPart(effectiveLandAcquisitionCause(asset), asset.landAcquisitionDate),
  };
}

function preDeemedConversionFromForm(asset: AssetForm, td: string): boolean {
  // 자기 서브객체로 취득가액을 만드는 자산 — ④가 `generalBuildingValuation`·`redevelopment`·`mixedUse`를 싣는다(⑫ 제외 조건).
  if (
    (asset.assetKind === "housing" && asset.isMixedUseHouse === true) ||
    asset.assetKind === "general_building" ||
    asset.assetKind === "right_to_move_in" ||
    asset.assetKind === "redevelopment_apt"
  )
    return false;
  // ④ 주 자산(`transfer-tax-api.ts` · `buildPrimaryContext`)과 같은 판정으로 조각을 만든다 — 감정·매매사례·토지등급·매매 상가 서브객체.
  const { isSalesCase, isAppraisal, hasPre1990, hasPre1990ForSec164 } = primaryAcquisitionModeFlags(asset);
  return isPreDeemedConversionCandidate({
    inheritedAcquisition: buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition as
      | { mode?: string; standardPriceAtDeemedDate?: number }
      | undefined,
    pre1990Land: hasPre1990 || hasPre1990ForSec164 ? buildPre1990LandPayload(asset, td).pre1990Land : undefined,
    inheritedHouseValuation: buildInheritedHouseValuationPayload(asset, td).inheritedHouseValuation,
    commercialBuildingValuation:
      asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition && asset.acquisitionCause !== "inheritance"
        ? buildCommercialBuildingValuation(asset, td)
        : undefined,
    acquisitionMethod: hasPre1990 ? "actual" : isSalesCase ? "salesCase" : isAppraisal ? "appraisal" : undefined,
  });
}
