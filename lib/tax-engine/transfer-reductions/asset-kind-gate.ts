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
 * ⚠ redevelopment_apt + §97 — **「시한 게이트가 이미 차단한다」는 서술은 사실이 아니었다** (CB-09).
 *   §97의3의 등록 시한은 `period-check.ts`가 `before(registrationDate, 2027-12-31)`로 판정해
 *   **열려 있고**, 조특령 §97의3② 후단은 「재개발사업·재건축사업 … 의 시행으로 임대할 수 없는
 *   경우에는 관리처분계획 인가일 전 6개월부터 준공일 후 6개월까지 계속하여 임대한 것으로 본다」로
 *   재개발 아파트가 §97의3 대상임을 **전제**한다. 즉 도달 가능한 조합이다.
 *   (축 일원화 #1245 이후 입주권은 `right_to_move_in`이라 `RENTAL_HOUSING_KINDS`에서 이미 빠진다.)
 *
 *   게이트는 그대로 두되(조문상 허용되는 조합이므로), 재개발 경로가 §97의3·§97의4의 **장기보유
 *   특별공제 특례를 계산하지 않는다**는 사실은 그 경로가 경고로 고지한다
 *   (`transfer-tax-redevelopment.ts` — `LTHD_SPECIAL_REDUCTION_IDS`).
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
/**
 * §98의2(지방 미분양주택) **조합원 경로 배제** — 결합이 구조적으로 성립하지 않는다.
 *
 * 조특법 §98의2①의 대상은 조특령이 정하는 「미분양주택」, 즉 **사업주체등이 공급했으나
 * 분양되지 않은 주택**이다. 그런데 재개발·재건축의 조합원 물량은 관리처분계획에 따라
 * **배정**되는 것이지 분양 대상이 아니므로, 조합원이 취득한 신축주택·입주권은 어떤
 * 경우에도 미분양주택에 해당할 수 없다.
 *
 * 반대 방향으로도 막힌다 — 미분양 일반분양분을 산 사람은 조합원이 아니라 취득일이
 * 잔금청산일 하나뿐이라, 소령 §166⑤의 인가전·인가후·청산금 3분기 구조 자체가 없다.
 * (승계조합원도 §166①의 「조합에 기존건물을 제공하고 취득한 조합원」이 아니라서
 *  `redevelopment-dispatch.ts`가 일반 분기로 내려보낸다.)
 *
 * ⚠️ 카테고리 게이트(`NEW_UNSOLD_HOUSING_KINDS`)는 이 두 자산종류를 허용한다 — §99 계열은
 *   조특령 §99①1호 단서가 **재개발 신축주택 변형을 명문으로 두고** 있어 정당하다.
 *   §98의2만 조문 단위로 뺀다.
 */
const UNSOLD_98_2_EXCLUDED_KINDS = new Set<ReductionAssetKind>([
  "redevelopment_apt",
  "right_to_move_in",
]);

const GB_CLAIM_ROUTE_KINDS = new Set<ReductionAssetKind>([
  "land",
  "general_building",
  "commercial_building",
]);

/**
 * §77의3 **§17 매수청구** 경로를 이 자산 종류에 걸 수 있는가.
 * `gbPurchaseRoute === "claim"` 일 때만 의미가 있다 — ⑧ validate와 ⑤ UI가 공유한다.
 *
 * 호출부(단일 소스 유지 — 새 호출부를 늘릴 때 여기 추가할 것):
 *   - ⑧ `lib/calc/transfer-tax-validate-reductions.ts:120` (최종 차단)
 *   - ⑤ `app/calc/transfer-tax/steps/Step5.tsx` 매수 경로 라디오 (입력 시점 disabled)
 *
 * ⚠ 2026-09-02(D9-06) 전까지 ⑤ 호출부가 **없었다** — 주석만 「⑤ UI가 공유한다」였고
 *   실제로는 라디오가 무조건 선택 가능해 계산 실행 시점에야 막혔다.
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
  // §98의2 × 조합원 경로 — 미분양주택 정의상 성립 불가 (위 UNSOLD_98_2_EXCLUDED_KINDS 주석)
  if (id === "unsold_98_2") return !UNSOLD_98_2_EXCLUDED_KINDS.has(assetKind);
  const cat = REDUCTION_METADATA[id as TransferReductionId]?.category ?? LEGACY_REDUCTION_CATEGORY[id];
  if (!cat) return true; // 매핑 미존재 시 차단하지 않음 (방어적 — standalone·미지 타입)
  return isReductionCategoryAllowedForAssetKind(cat, assetKind);
}
