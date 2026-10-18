/**
 * 「소득세법」 §104의2② 지정지역 선언(`isDesignatedArea`)을 엔진에 싣는 자산 종류 — ④ 변환(단건·다건·컴패니언)의 **단일 게이트**.
 *
 * 양도일 2009.3.16.~2015.12.31.의 비사업용 토지 §104①8호 중과 유예 판정(`judgeNblRateDeferral`)이 읽는다.
 * 선언이 닿아야 하는 곳은 «비사업용 토지로 평가되는 부분이 있는 자산»이다:
 *  - **토지** — 비사업용 토지 토글을 켠 자산, 그리고 주택 부수토지(`appurtenant_to_housing`) 컴패니언이 한도 초과로 갈라진 초과분 카드(`__excess`).
 *  - **주택** — 배율 초과 부수토지 분리 파트(`splitDetail.nonBusinessLandPart`). 파트 입력이 부모 주택 입력을 펼쳐 쓰므로 부모 값이 그대로 닿는다.
 * 일반건물은 `generalBuildingValuation` payload(`transfer-tax-api-gb.ts` `nblFields`)가 따로 싣고, 겸용은 2022.1.1. 전 양도분을 엔진이 거부한다
 * (`data/mixed-use-split-era.ts` `isMixedUseSplitTransfer`)라 유예 기간과 겹치지 않는다.
 *
 * 그 밖의 종류로 바꾸면 폼 값은 남지만(토지로 되돌리면 복귀) 엔진에는 싣지 않는다 — 화면에 없는 값이 세액을 바꾸지 않도록.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

export function nblDesignatedAreaPayload(asset: Pick<AssetForm, "assetKind" | "isDesignatedArea"> | undefined): boolean | undefined {
  if (!asset) return undefined;
  return asset.assetKind === "land" || asset.assetKind === "housing" ? asset.isDesignatedArea : undefined;
}
