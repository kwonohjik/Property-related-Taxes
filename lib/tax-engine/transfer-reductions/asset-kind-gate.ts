/**
 * 자산 종류(주택) 게이트 — 양도세 감면 카테고리별 적용 가능 자산 판정
 *
 * 장기임대(§97)·신축(§99)·미분양(§98·§99의2) 감면은 모두 "주택" 양도에만 적용된다.
 * UI 토글 활성화·validation 양쪽이 동일 판정을 쓰도록 단일 소스로 둔다
 * (정책: single-source-engine-helper · mirror-pattern).
 *
 * 카테고리별 집합 차이 (사용자 확정 2026-06-29):
 *   - rental(§97): { housing, redevelopment_apt } — 입주권·분양권은 물리적 임대 불가로 배제.
 *   - new_housing(§99)·unsold(§98·§99의2): + 입주권·분양권 — 분양권 취득→완공 후 양도 흐름 포함.
 *
 * ⚠ redevelopment_apt + §97: redevSubject==="right"(입주권)이면 임대 불가지만, §97 시리즈는
 *   임대개시·등록 시한(~2000.12.31 / ~2018 / ~2027)이 재개발·재건축 시나리오를 시한 게이트에서
 *   이미 차단하므로 redevSubject 수준 분기는 도입하지 않는다 (실효 없는 복잡도).
 */

import { REDUCTION_METADATA } from "./metadata";
import type { TransferReductionId, ReductionCategory } from "./types";

/**
 * 자산 종류 union — `AssetForm["assetKind"]`(lib/stores/calc-wizard-asset.ts)와 동일하게 유지.
 * ⚠ AssetForm에 자산 종류를 추가하면 이 union과 아래 집합도 함께 갱신할 것
 *   (drift 시 호출부에서 TS 에러로 검출됨).
 */
export type ReductionAssetKind =
  | "housing"
  | "land"
  | "building"
  | "right_to_move_in"
  | "presale_right"
  | "commercial_building"
  | "general_building"
  | "redevelopment_apt";

const RENTAL_HOUSING_KINDS = new Set<ReductionAssetKind>(["housing", "redevelopment_apt"]);
const NEW_UNSOLD_HOUSING_KINDS = new Set<ReductionAssetKind>([
  "housing",
  "right_to_move_in",
  "presale_right",
  "redevelopment_apt",
]);

/**
 * 조특법 §69① — 「… 대통령령으로 정하는 방법으로 직접 경작한 **토지** 중 대통령령으로 정하는
 * **토지**의 양도로 인하여 발생하는 소득 …」. 조문이 대상을 토지로 명시하므로 토지만이다.
 *
 * ⚠ standalone 4조문은 **대상 자산이 서로 다르다** — 카테고리 단위로는 표현되지 않는다.
 *   §77(공익수용)·§77의2(대토보상)는 「토지등」이라 정착물(건물)을 포함하고(조특법 §77의2①
 *   「… 취득한 **토지등**을 …」), §77의3은 매수 경로에 따라 갈린다(GB_CLAIM_ROUTE_KINDS 참조).
 *   그래서 게이트를 카테고리가 아니라 **조문 id 단위**로 내린다.
 */
const SELF_FARMING_KINDS = new Set<ReductionAssetKind>(["land"]);

/**
 * 조특법 §77의3① **§17 경로**(토지매수의 청구) 허용 자산.
 *
 * §77의3①은 「해당 토지등을 같은 법 **제17조**에 따른 토지매수의 청구 **또는** 같은 법
 * **제20조**에 따른 협의매수를 통하여」라 하여 한 항 안에 두 경로를 담는데, 두 경로의 **대상
 * 범위가 다르다**:
 * - 개발제한구역법 §17① — 「… 그 효용이 현저히 감소된 토지나 … 사실상 불가능하게 된 토지
 *   (이하 "**매수대상토지**"라 한다)의 소유자 … **그 토지**의 매수를 청구할 수 있다」 ⇒ **토지만**
 * - 개발제한구역법 §20① — 「개발제한구역의 **토지와 그 토지의 정착물**(이하 "토지등"이라 한다)을
 *   매수할 수 있다」 ⇒ 건물 포함
 *
 * ⇒ §17 경로에서는 건물분이 대상이 아니다. 토지 파트가 **독립 계산되는** 자산만 허용한다
 *   (일반건물·상가건물은 토지/건물 파트로 분해되므로 건물 파트만 카드 단계에서 제외하면 되고,
 *   주택·입주권·분양권은 파트가 갈리지 않아 안분 없이는 토지분을 뽑을 수 없다 —
 *   자동 안분 fallback 금지 정책에 따라 차단한다).
 *
 * ②(해제 후 협의매수·수용)는 공익사업법 경로라 「토지등」 그대로이므로 이 게이트 대상이 아니다.
 */
const GB_CLAIM_ROUTE_KINDS = new Set<ReductionAssetKind>([
  "land",
  "general_building",
  "commercial_building",
]);

/**
 * §77의3 **§17 매수청구** 경로를 이 자산 종류에 걸 수 있는가.
 * `gbPurchaseRoute === "claim"` 일 때만 의미가 있다 — ⑧ validate와 ⑤ UI가 공유한다.
 */
export function isGbClaimRouteAllowedForAssetKind(assetKind: ReductionAssetKind): boolean {
  return GB_CLAIM_ROUTE_KINDS.has(assetKind);
}

/** 카테고리 단위 게이트 — UI 카테고리 활성/카운터 판정용 */
export function isReductionCategoryAllowedForAssetKind(
  category: ReductionCategory,
  assetKind: ReductionAssetKind,
): boolean {
  switch (category) {
    case "rental":
      return RENTAL_HOUSING_KINDS.has(assetKind);
    case "new_housing":
    case "unsold_housing":
      return NEW_UNSOLD_HOUSING_KINDS.has(assetKind);
    case "standalone":
      return true; // 자경(§69)·공익수용(§77) — 주택 게이트 없음
  }
}

/**
 * 레거시 평면 감면 타입(AssetReductionForm) → 카테고리 매핑.
 * 23개 신규 조문 체계 이전의 폼 타입으로, REDUCTION_METADATA에 없으나 모두 주택 감면이다.
 * (long_term_rental=장기임대 §97 / new_housing=신축 §99 / unsold_housing=미분양 §98)
 */
const LEGACY_REDUCTION_CATEGORY: Record<string, ReductionCategory> = {
  long_term_rental: "rental",
  new_housing: "new_housing",
  unsold_housing: "unsold_housing",
};

/**
 * 조문 id 단위 게이트 — validation 선택 조문별 검증용.
 * id는 폼 감면 타입(TransferReductionId + 레거시 평면 타입)을 받으므로 string으로 넓힌다.
 */
export function isReductionAllowedForAssetKind(
  id: string,
  assetKind: ReductionAssetKind,
): boolean {
  // 조문 단위 예외가 카테고리 판정보다 먼저다 — standalone은 카테고리로 묶이지만 §69만 토지 전용이다.
  if (id === "self_farming") return SELF_FARMING_KINDS.has(assetKind);
  const cat = REDUCTION_METADATA[id as TransferReductionId]?.category ?? LEGACY_REDUCTION_CATEGORY[id];
  if (!cat) return true; // 매핑 미존재 시 차단하지 않음 (방어적 — standalone·미지 타입)
  return isReductionCategoryAllowedForAssetKind(cat, assetKind);
}
