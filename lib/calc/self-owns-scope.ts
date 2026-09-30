/**
 * 「토지·건물 소유자 다름」(`selfOwns`, 소령 §166⑥·§168②) 입력 축의 **적용 범위** 단일 소스 (M2 · 2026-09-30).
 *
 * ## 왜 필요한가 — ⑤만 자산 종류를 보고 ④·⑧은 보지 않았다
 *
 * 토글의 유일한 쓰기 지점(`AssetOwnershipSplitSection`)은 주택·건물이고 겸용주택이 아닐 때만 렌더된다.
 * 그런데 주택에서 켠 뒤 종류를 토지로 바꾸면 `selfOwns`가 남고(끄는 칸이 사라진다), ④는 자산 종류를
 * 보지 않고 전송했다. 실측(2026-09-30):
 *
 * | 경로 | 결과 |
 * |---|---|
 * | 단건 | ⑫ 「소유자 분리는 주택·건물에만」 **400** — ⑧은 통과시켰으므로 화면에서 고칠 수 없는 막다른 길 |
 * | 다건 | ⑫에 그 검사가 없어 **200** — 엔진 `calcSplitGain`은 propertyType 게이트로 무시(세액 동일) |
 *
 * ⇒ 술어를 leaf로 뽑아 ⑤·④·⑧·⑥이 **같은 것**을 쓴다(`feedback_shared_predicate_argument_parity`).
 *    범위 밖이면 저장값과 무관하게 「소유자 같음」(`both`)으로 읽는다 — 값은 지우지 않는다(종류를 되돌리면 복원).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/** 토지·건물 분리 계산이 가능한 자산 종류 — 엔진 `calcSplitGain`의 propertyType 게이트와 동일. */
export function isLandBuildingSplitable(assetKind: string | undefined): boolean {
  return assetKind === "housing" || assetKind === "building";
}

/** ⑤ `AssetOwnershipSplitSection` 렌더 게이트와 같은 것 — 겸용주택은 자체 4부분 안분이 축을 지배한다. */
export function selfOwnsSplitApplicable(asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse">): boolean {
  return isLandBuildingSplitable(asset.assetKind) && !asset.isMixedUseHouse;
}

/**
 * ④·⑧·⑥이 읽는 **유효** 소유 축 — 범위 밖의 잔재는 `both`다. 범위 안이면 저장값을 **그대로** 돌려준다
 * (미설정 처리는 호출부의 종전 규칙을 바꾸지 않기 위해 각자에 둔다).
 */
export function effectiveSelfOwns(
  asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">,
): AssetForm["selfOwns"] | undefined {
  return selfOwnsSplitApplicable(asset) ? asset.selfOwns : "both";
}
