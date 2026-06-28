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
  const cat = REDUCTION_METADATA[id as TransferReductionId]?.category ?? LEGACY_REDUCTION_CATEGORY[id];
  if (!cat) return true; // 매핑 미존재 시 차단하지 않음 (방어적 — standalone·미지 타입)
  return isReductionCategoryAllowedForAssetKind(cat, assetKind);
}
