/**
 * 자산 종류(주택) 게이트 — 양도세 감면 카테고리별 적용 가능 자산 판정
 *
 * 장기임대(§97)·신축(§99)·미분양(§98·§99의2) 감면은 모두 "주택" 양도에만 적용된다.
 * UI 토글 활성화·validation 양쪽이 동일 판정을 쓰도록 단일 소스로 둔다
 * (정책: single-source-engine-helper · mirror-pattern).
 *
 * 카테고리별 집합 차이 (사용자 확정 2026-06-29):
 *   - rental(§97): { housing, redevelopment_apt } — 입주권·분양권은 물리적 임대 불가로 배제.
 *     예외: §97의3 × 조합원입주권은 조문 단위로 연다(G-7 · `hasArticleExceptionInCategory`).
 *   - new_housing(§99)·unsold(§98의4·§98의9): + 입주권·분양권. (§98의8·§99의2는 조문 단위로 주택만 — `UNSOLD_SPONSOR_FIRST_CONTRACT_EXTRA_IDS`)
 *   - §98·§98의2·§98의3·§98의5·§98의6·§98의7: 주택(housing)만 — 조문 단위 예외(`UNSOLD_98_SERIES_HOUSING_ONLY_IDS`, US-44).
 *     완공 뒤 양도는 assetKind가 housing이다. presale_right는 완공 전 권리 자체의 양도다.
 *
 * ⚠ redevelopment_apt + §97 — **「시한 게이트가 이미 차단한다」는 서술은 사실이 아니었다** (CB-09).
 *   §97의3의 등록 시한은 `period-check.ts`가 `before(registrationDate, 2027-12-31)`로 판정해
 *   **열려 있고**, 조특령 §97의3② 후단은 「재개발사업·재건축사업 … 의 시행으로 임대할 수 없는
 *   경우에는 관리처분계획 인가일 전 6개월부터 준공일 후 6개월까지 계속하여 임대한 것으로 본다」로
 *   재개발 아파트가 §97의3 대상임을 **전제**한다. 즉 도달 가능한 조합이다.
 *   (축 일원화 #1245 이후 입주권은 `right_to_move_in`이라 `RENTAL_HOUSING_KINDS`에서 이미 빠진다.)
 *
 *   게이트는 그대로 두되(조문상 허용되는 조합이므로), 재개발 경로가 §97의3·§97의4의 **장기보유
 *   특별공제 특례는 재개발 경로의 Step A.8b가 계산한다**
 *   (`transfer-tax-redevelopment-steps.ts`·`transfer-tax-redevelopment-lthd.ts`).
 *   §98의2는 조합원 취득 자산이라 「적용 대상 아님」으로 고지한다(`transfer-tax-redevelopment.ts`).
 */

import { REDUCTION_METADATA } from "./metadata";
import { UNSOLD_99_2_DECREE } from "../legal-codes/transfer-house";
import type { TransferReductionId, ReductionCategory } from "./types";
import { RENTAL_973_RIGHT_TO_MOVE_IN_ID } from "./rental-97-3-right-after-auto-cancel";

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
 * §98의2(지방 미분양주택) **조합원 경로 배제**(D5-05) — 아래 `UNSOLD_98_SERIES_HOUSING_ONLY_IDS`에 흡수됐다(US-44).
 * 근거: 조합원 물량은 관리처분계획에 따라 **배정**되므로 미분양주택이 될 수 없고, 미분양 일반분양분을 산 사람은
 * 조합원이 아니라 소령 §166⑤의 인가전·인가후·청산금 3분기 구조 자체가 없다.
 * ⚠️ 카테고리 게이트(`NEW_UNSOLD_HOUSING_KINDS`)는 조합원 경로를 허용한다 — §99 계열은 조특령 §99①1호 단서가
 *   재개발 신축주택 변형을 명문으로 두고 있어 정당하다. §98 시리즈만 조문 단위로 뺀다.
 */

/**
 * §98·§98의2·§98의3·§98의5·§98의6·§98의7 — **완공된 미분양주택 자체의 양도에만** (US-44 · 사용자 결정 2026-11-06 Q-4 「모두 막는다」).
 *
 * - 조합원 경로(재개발APT·조합원입주권): 대상은 「사업주체(등)와 최초로 매매계약을 체결하고 취득」한 미분양주택이다
 *   (법 §98의3①·§98의5①·§98의6①·§98의7①, 조특령 §98①2호·§98의2①·§98의3①·§98의4①·§98의5②·§98의6①).
 *   조합원 몫은 관리처분계획에 따라 배정되므로 미분양주택이 될 수 없고, 승계 입주권 취득자는 최초 계약자가 아니다
 *   (재산세과-686, 서울고법 2018누71351). 종전주택이 이 조문의 미분양주택이었다가 재건축된 원조합원 사례는
 *   감면 승계를 다룬 정면 해석이 없어 계산기 범위 밖으로 두고 안내만 한다(`assetKindGateReason`).
 * - 분양권(presale_right): 조문은 「미분양주택을 … 양도」다. 완공 전 권리 양도는 소득세법 §94①2호가목 자산이라
 *   주택 양도가 아니다(재재산46014-219·재일46014-1570). 이 차단으로 §98의2·§98의3·§98의5·§98의6 세율 특칙이
 *   분양권 60%(§104①1호 괄호)를 지우던 경로(F-14)도 닫힌다.
 * - 완공 뒤 양도는 assetKind가 housing이므로 영향이 없다.
 *
 * ⚠ §98의2의 조합원 경로 배제(`UNSOLD_98_2_EXCLUDED_KINDS`, D5-05)는 이 집합에 흡수된다.
 *   §98의8·§99의2는 2026-11-11 같은 이유로 뒤따라 막았다(`UNSOLD_SPONSOR_FIRST_CONTRACT_EXTRA_IDS`). §98의4·§98의9는 이유가 없어 카테고리 게이트를 그대로 탄다.
 */
export const UNSOLD_98_SERIES_HOUSING_ONLY_IDS: ReadonlySet<string> = new Set([
  "unsold_98",
  "unsold_98_2",
  "unsold_98_3",
  "unsold_98_5",
  "unsold_98_6",
  "unsold_98_7",
]);
const UNSOLD_98_SERIES_ALLOWED_KINDS = new Set<ReductionAssetKind>(["housing"]);

/**
 * §98의8·§99의2 — 위 6조문과 같은 이유로 조합원 경로·분양권을 막는다(사용자 결정 2026-11-11, US-77 후속 점검).
 * 둘 다 「사업주체 등과 **최초로 매매계약을 체결**하고 취득」한 주택이 대상이다.
 *  - §98의8①: 「…사업주체 등 대통령령으로 정하는 자와 2015년 1월 1일부터 2015년 12월 31일까지 최초로 매매계약을 체결하고…」(MST 284389)
 *  - §99의2①·령 §99의2①: 신축주택등은 사업주체 등이 공급하는 주택이고, 자기건설 주택 중 정비조합 조합원이 관리처분계획에 따라 취득하는 주택은
 *    8호 가목에서 명문으로 뺀다(MST 288915). 같은 조 ⑦은 5년간 양도소득금액을 령 §40① 준용으로만 정해 재개발 변형(종전주택 기준시가)이 없다.
 * 종전에는 «이번 결정 범위 밖»이라 카테고리 게이트를 탔다 — 재개발APT가 §99의2를 고르면 5년 이내 100% 세액감면·5년 후 소득금액 공제가,
 * §98의8을 고르면 5년간 발생분 50% 차감이 일반 주택과 똑같이 적용됐다(2026-11-11 mock 실측).
 * ⚠ `UNSOLD_98_SERIES_HOUSING_ONLY_IDS`에 섞지 않는다 — 두 집합의 근거 강도가 다르다(6조문은 부수토지 해석례가 직접 근거, 이 둘은 유추).
 *   부수토지 분리 차단(US-34, `transfer-tax-validate-asset.ts`)은 2026-11-11 두 집합을 모두 키로 쓰되 안내 문구로 그 차이를 밝힌다.
 * §98의4(비거주자 10% — 사업주체 최초 계약 요건 없음)·§98의9(주택 수 제외)는 이 이유가 없어 대상이 아니다.
 */
export const UNSOLD_SPONSOR_FIRST_CONTRACT_EXTRA_IDS: ReadonlySet<string> = new Set(["unsold_98_8", "unsold_99_2"]);

/** 엔진 propertyType 중 위 조문이 막히는 값 — API 직접 호출 방어용(`stripAssetKindGatedReductions`). */
const UNSOLD_98_SERIES_BLOCKED_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  "redevelopment_apt",
  "right_to_move_in",
  "presale_right",
]);

/**
 * 조문마다 대상 주택의 문언이 다르다 — 사유 문구는 조문 원문 표현을 따른다(조특법 MST 284389 · 조특령 MST 288915).
 * - §98: 조특령 §98①2호 「주택건설사업자로부터 최초로 분양받은 주택으로서 … 완공된 후 다른 자가 입주한 사실이 없는 주택」
 * - §98의2: 법 ① 「취득…한 수도권 밖의 미분양주택」, 조특령 §98의2① — 1호 선착순 공급 · 2호 최초 매매계약
 * - §98의3·§98의5·§98의6·§98의7: 「사업주체(등)와 최초로 매매계약을 체결하고(하거나 그 계약에 따라) 취득」
 * 조합원 경로는 §98의3②1호가 자기건설 확장에서 「정비사업조합의 조합원이 해당 관리처분계획에 따라 취득하는 주택」을 명문으로 뺀다.
 */
const GATED_SUBJECT: Record<string, string> = {
  unsold_98: "주택건설사업자로부터 최초로 분양받은 미분양 국민주택",
  unsold_98_2: "사업주체가 공급한 수도권 밖의 미분양주택(선착순 공급분 또는 사업주체와 최초로 매매계약을 체결한 주택)",
  unsold_98_3: "사업주체와 최초로 매매계약을 체결하고 취득한 미분양주택",
  unsold_98_5: "사업주체 등과 최초로 매매계약을 체결하고 취득한 미분양주택",
  unsold_98_6: "사업주체등과 최초로 매매계약을 체결하고 취득한 준공후미분양주택",
  unsold_98_7: "사업주체 등과 최초로 매매계약을 체결하거나 그 계약에 따라 취득한 미분양주택",
  unsold_98_8: "사업주체 등과 최초로 매매계약을 체결하고 취득한 준공후미분양주택",
  unsold_99_2: "사업주체 등이 공급하는 신축주택·미분양주택과 최초로 매매계약을 체결하고 취득한 주택",
};

/** 자산별 이유 문구가 다른 조문 — 기본 문구는 «미분양주택이 아닙니다»라 §99의2(신축주택 포함)에는 맞지 않는다. */
const REDEVELOPMENT_NOTE_OVERRIDE: Record<string, string> = {
  unsold_99_2:
    `재개발·재건축 조합원 아파트·조합원입주권은 관리처분계획에 따라 배정·승계된 것이라 사업주체가 공급하는 신축주택등이 아닙니다(${UNSOLD_99_2_DECREE.D99_2_REQ} — 조합원이 관리처분계획에 따라 취득하는 주택은 자기건설 주택에서 제외).`,
};

/**
 * 조문 게이트에 걸린 이유 — ⑤ 비활성 사유·⑧ 차단 메시지·엔진 고지가 같은 문구를 쓴다.
 * **재개발APT·조합원입주권·분양권에서만** 값을 돌려준다. 토지·건물 등 비주택 자산은 카테고리 게이트의
 * 「주택 양도에만 적용」 사유가 맞으므로 undefined다(⑤·⑧이 그 문구를 쓴다).
 */
export function assetKindGateReason(id: string, assetKind: ReductionAssetKind | string): string | undefined {
  const subject = GATED_SUBJECT[id];
  if (!subject || !UNSOLD_98_SERIES_BLOCKED_PROPERTY_TYPES.has(assetKind)) return undefined;
  const label = REDUCTION_METADATA[id as TransferReductionId]?.uiLabel ?? id;
  const kindNote =
    assetKind === "presale_right"
      ? "분양권 상태의 양도는 주택 양도가 아닙니다(소득세법 §94①2호가목)."
      : REDEVELOPMENT_NOTE_OVERRIDE[id] ??
        "재개발·재건축 조합원 아파트·조합원입주권은 관리처분계획에 따라 배정·승계된 것이라 미분양주택이 아닙니다.";
  return (
    `${label}: ${subject}의 양도에만 적용됩니다. ${kindNote} ` +
    "종전주택이 이 조문의 미분양주택이었다가 재건축된 경우는 이 계산기가 다루지 않으므로 별도 확인이 필요합니다."
  );
}

/**
 * 엔진 진입 방어 — ⑤·⑧ 게이트를 거치지 않은 입력(API 직접 호출·옛 이력)에서 위 조문을 걷어 내고 고지를 돌려준다.
 * ⚠ 범위는 ⑤·⑧보다 좁다: 이 함수는 재개발APT·조합원입주권·분양권만 막는다. 토지·건물 등 비주택 자산 × 주택 감면은
 *   ⑤·⑧의 카테고리 게이트만 막고 엔진은 막지 않는다(US-44 전부터 그랬다 — 이번 결정 범위 밖).
 * 감면 효과(세액감면·소득차감·세율·장특 특칙)뿐 아니라 감면주택 중과 배제(STEP 0.45)도 이 감면 선택을 근거로 하므로
 * **모든 STEP보다 먼저** 부른다.
 */
export function stripAssetKindGatedReductions<T extends { type: string }>(
  propertyType: string,
  reductions: readonly T[] | undefined,
): { reductions: T[] | undefined; notices: string[] } {
  if (!reductions || !UNSOLD_98_SERIES_BLOCKED_PROPERTY_TYPES.has(propertyType)) {
    return { reductions: reductions ? [...reductions] : reductions, notices: [] };
  }
  const kept: T[] = [];
  const notices: string[] = [];
  for (const r of reductions) {
    const reason = assetKindGateReason(r.type, propertyType);
    if (!reason) kept.push(r);
    else if (!notices.includes(`${reason} 이 계산에 반영하지 않았습니다.`)) notices.push(`${reason} 이 계산에 반영하지 않았습니다.`);
  }
  return { reductions: kept, notices };
}

/**
 * ⑫ 와이어의 자산 종류 → 게이트 종류. 주 자산은 `propertyType`, 컴패니언은 `assetKind`를 쓰고 겸용주택은 둘 다 «주택» 갈래다
 * (⑧은 `housing` + `isMixedUseHouse`). 모르는 값은 `undefined` — 막지 않는다(⑧과 같은 «매핑 미존재 시 차단하지 않음»).
 * ⚠ 엔진 내부에서 `propertyType`로 걸지 말 것 — 다건 집계가 겸용 컴패니언을 상가 land·building 카드로 쪼개 §99의3을 싣는다
 *   (`transfer-tax-aggregate-asset-records.ts` `computeOne`) — 계획서 `sec99-asset-kind-gate-engine-nh54.plan.md` §3.3.
 */
export function reductionAssetKindFromWire(kind: string | undefined): ReductionAssetKind | undefined {
  switch (kind) {
    case "housing":
    case "mixed-use-house":
    case "mixed_use_house":
      return "housing";
    case "land":
    case "building":
    case "right_to_move_in":
    case "presale_right":
    case "commercial_building":
    case "general_building":
    case "redevelopment_apt":
      return kind;
    default:
      return undefined;
  }
}

/**
 * 조문 id 게이트에 걸렸을 때의 사유 문구(걸리지 않으면 `undefined`) — ⑧ validate와 ⑫ Zod가 같은 문구를 쓴다(단일 소스).
 * 문구는 조문마다 다르다: §69는 반대 방향(토지 전용), §98 시리즈 × 조합원·분양권은 조문 원문, 그 밖은 「주택 양도에만」.
 */
export function assetKindGateMessage(id: string, assetKind: ReductionAssetKind): string | undefined {
  if (isReductionAllowedForAssetKind(id, assetKind)) return undefined;
  // §69는 반대 방향 게이트다 — 「토지 전용」이라 주택 문구를 쓰면 사유가 거꾸로 안내된다.
  if (id === "self_farming")
    return "자경농지 감면(조특법 §69)은 토지 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.";
  // §98 시리즈 6조문 × 조합원 경로·분양권은 「주택 양도」 문구가 사유와 맞지 않는다(US-44) — 엔진 고지와 같은 문구.
  const articleReason = assetKindGateReason(id, assetKind);
  if (articleReason) return `${articleReason} 감면 선택을 해제하세요.`;
  const label = REDUCTION_METADATA[id as TransferReductionId]?.uiLabel ?? "이 감면";
  return `${label} 감면은 주택 양도에만 적용됩니다. 자산 종류를 확인하거나 감면 선택을 해제하세요.`;
}

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

/**
 * 카테고리 게이트는 막지만 조문 단위로 열린 조합이 있는가 — ⑤ 그룹을 펼쳐 그 조문만 고르게 한다.
 * 지금은 §97의3 × 조합원입주권 하나(G-7 · 서면-2023-법규재산-2731). 요건(원조합원·자동말소·말소일 ≤ 인가일)은
 * `rental973RightToMoveInBlockReason`이 ⑧·⑫에서 가른다 — 범주를 열면 §97·§97의2·§97의4·§97의5까지 열린다.
 */
export function hasArticleExceptionInCategory(category: ReductionCategory, assetKind: ReductionAssetKind): boolean {
  return category === "rental" && assetKind === "right_to_move_in";
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
  // §98 시리즈 6조문 × 조합원 경로·분양권 — 미분양주택 정의상 성립 불가 (위 UNSOLD_98_SERIES_HOUSING_ONLY_IDS 주석)
  if (UNSOLD_98_SERIES_HOUSING_ONLY_IDS.has(id) || UNSOLD_SPONSOR_FIRST_CONTRACT_EXTRA_IDS.has(id)) return UNSOLD_98_SERIES_ALLOWED_KINDS.has(assetKind);
  // §97의3 × 조합원입주권 — 자동말소 뒤 인가로 입주권이 된 경우만(G-7). 요건은 ⑧·⑫의 `rental973RightToMoveInBlockReason`.
  if (id === RENTAL_973_RIGHT_TO_MOVE_IN_ID && assetKind === "right_to_move_in") return true;
  const cat = REDUCTION_METADATA[id as TransferReductionId]?.category ?? LEGACY_REDUCTION_CATEGORY[id];
  if (!cat) return true; // 매핑 미존재 시 차단하지 않음 (방어적 — standalone·미지 타입)
  return isReductionCategoryAllowedForAssetKind(cat, assetKind);
}
