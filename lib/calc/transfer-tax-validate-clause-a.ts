/**
 * E-1 — 「가목(§163⑨ 평가액)을 확인할 수 없음」 **명시 선언** 요구 (U2-E).
 *
 * 시행령 §163⑨은 상속·증여 자산의 취득가액을 「기준일 현재 상증법 §60~66 평가액」으로 **보고**(①),
 * 같은 조 1호·2호는 기준시가 고시 前 취득에 「그 평가액과 §164④~⑦ 가액 **중 많은 금액**」을 쓰게 한다(②).
 *
 * 엔진은 **3자 max**다 — `max(①, ②, ③ 환산취득가액)`(`inheritance-acquisition-price.ts` `calcPreDeemed`,
 * 2026-10-22 「가목 우선」에서 변경 — 계획서 `inheritance-pre-deemed-clause-b-revisit.plan.md`).
 * ①②를 비우면 그 값들이 max 후보에서 **빠진다** — payload에 실리지 않아 ③만 남는다.
 * 「확인할 수 없다」를 사용자가 선언한 적이 없는데 후보가 조용히 줄면 안 되므로
 * ⇒ ①·② 모두 미충족이면 **차단**하고, 선언(`preDeemedClauseAUnconfirmed`)이 있을 때만 통과시킨다
 *   (사용자 결정 Q-6 a — 게이트 유지·문구 정정).
 *
 * ## 경계 — 선언은 ③(나목)이 **있는** 구간에서만 효력이 있다
 *
 * · **post-deemed**: 나목이 §163⑨ 의제로 대체돼 ③이 없다. 선언해도 갈 곳이 없어 무의미하다.
 * · **증여 · 실거래가**: 이미 「증여 신고가액을 입력하세요」가 막는다. E-1이 앞서면 그 메시지가
 *   사라지고, 선언으로 **뚫리는** 완화가 되어 버린다 ⇒ 추계 계열에서만 적용한다.
 * · **증여 · ③ 칸이 있는 자산**(`isGiftPreDeemedConversionAsset` — PR-5): ①이 늘 필수라(사용자 결정 Q-14) 적용하지 않는다.
 *   범위 밖 증여(재개발·입주권·부담부증여 등)는 위 줄대로 추계 계열에서만 적용한다.
 *
 * 이 경계가 무너지면 E-1은 강화가 아니라 완화다(설계서 §5 X-7·X-12c).
 *
 * ⚠️ **엔진에 보내지 않는다.** 선언은 validate 계층 게이트이고, 결과는 payload에 이미 드러난다
 *    (① 미입력 → `reportedValue` 키 부재 → `clauseA=0` → `converted`).
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §4.2
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { isSec163_9PreDeemed } from "./transfer-163-9-base-date";
import { deriveSec163_9BaseDate } from "./transfer-163-9-base-date";
import { isGiftPreDeemedConversionAsset } from "./gift-pre-deemed";
import { mixedSec163_9CompareOf } from "./mixed-use-sec163-9";
import { isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgPreDeemedUsesThreeWay } from "./bg-pre-deemed-mode";
import { gbBgUsesStdAcq } from "./bg-pre-deemed-mode";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";
import { redevPreApprovalAcqMode } from "./redev-pre-approval-acq-mode";
import { DEEMED_ACQUISITION_DATE } from "./transfer-163-9-base-date";
import {
  isFullyFilled,
  sec164CommercialStatus,
  sec164HouseStatus,
  sec164LandStatus,
} from "./sec164-required-fields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { isSec163_9Cause } from "./transfer-163-9-base-date";
import {
  buildInheritedAcquisitionPayload,
  buildInheritedHouseValuationPayload,
  buildCommercialInheritanceValuationPayload,
  preDeemedConversionInputShown,
} from "./transfer-tax-api-inheritance";
import { preDeemedAutoStdPrices } from "./pre-deemed-auto-std-price";
import { preDeemedSentStdPrices } from "./pre-deemed-auto-std-price";
import { preDeemedShowsHouseValuation } from "./pre-deemed-auto-std-price";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { buildPre1990LandPayload } from "./transfer-tax-api-helpers";
import { fieldError } from "./transfer-tax-validate-field";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";

/**
 * ②(§164④~⑦)가 **가목으로 성립**하는가 — 3경로 중 하나라도 완전 충족.
 *
 * ⚠️ `sec164PartialInputError`가 토지에 적용하는 `hasPre1990` **제외 로직은 가져오지 않는다**.
 *    그 제외는 「기존 환산 검증과 메시지가 중복되니까」라는 **표시상의 이유**이지, ②가 가목으로
 *    성립하는지와는 무관하다. 가져오면 토지 `hasPre1990` 경로에서 ②를 「미충족」으로 잘못 읽어
 *    **과잉 차단**한다(anchor X-14b).
 */
export function isSec164ClauseAFilled(asset: AssetForm): boolean {
  return (
    isFullyFilled(sec164HouseStatus(asset)) ||
    isFullyFilled(sec164CommercialStatus(asset)) ||
    isFullyFilled(sec164LandStatus(asset))
  );
}

/** ①(상증법 평가액)의 소스는 취득원인별로 다르다 — 상속은 공시가격 필드, 증여는 「증여 신고가액」. */
function clauseAReportedValue(asset: AssetForm): number {
  const raw =
    asset.acquisitionCause === "gift" ? asset.fixedAcquisitionPrice : asset.publishedValueAtInheritance;
  return parseAmount(raw ?? "");
}

/** 추계 계열(환산·감정가액·매매사례) — 「나목으로 가려는」 상태. */
function isEstimatingMode(asset: AssetForm): boolean {
  return (
    asset.useEstimatedAcquisition === true ||
    asset.isAppraisalAcquisition === true ||
    asset.isSalesCaseAcquisition === true
  );
}

/**
 * 「가목 확인 불가」 선언이 **필요한 상태**인가 — ⑤ UI와 ⑧ validate가 **공유하는 단일 술어**.
 *
 * 어긋나면 「토글은 보이는데 차단은 안 되는」(또는 그 반대) 침묵 실패가 된다
 * (memory `feedback_shared_predicate_argument_parity`).
 */
export function needsClauseADeclaration(asset: AssetForm): boolean {
  if (!isSec163_9PreDeemed(asset)) return false;
  // ③ 칸이 있는 증여는 ①(증여 신고가액)이 필수다 — 「증여일 평가액 확인 불가」로 ③만 쓰는 길은 두지 않는다(사용자 결정 Q-14, 2026-10-22).
  //   그 범위의 추계 플래그는 이제 막히고(`giftEstimatedModeBlocked`) 복원에서 비운다.
  if (isGiftPreDeemedConversionAsset(asset)) return false;
  // 겸용주택은 ①(주택분·상가분 평가액)·②(취득시 기준시가)를 자기 칸으로 받고 엔진이 자산 합계로 비교한다(PR-6) —
  //   ②가 늘 필수라 「확인 불가」 선언이 갈 곳이 없다. 종전에는 이 술어가 겸용 ① 칸을 읽지 못해 ①을 넣어도 선언을 요구했다.
  if (mixedSec163_9CompareOf(asset)) return false;
  //   부담부증여 겸용은 위 술어 밖이다 — 취득가액 판정은 엔진 leaf(`analyzeMixedBurdenedGift` — 의제취득일 전은 MB-16)가 하고 ⑧이 그 문구를 낸다.
  //   선언 토글이 갈 곳이 없어, 여기서 요구하면 그 문구 대신 막다른 오류가 먼저 나왔다(PR-7b-7a — 종전에는 취득원인 차단이 앞서 가려졌다).
  if (isMixedBurdenedGift(asset)) return false;
  // 기준시가로 평가한 부담부증여(§159①1호 괄호)는 의제취득일 기준시가만 쓴다 — ①③이 후보가 아니라 선언이 갈 곳이 없다(Q-25 · `bgPreDeemedError`가 그 기준시가를 요구).
  if (isBgPreDeemedAsset(asset) && !bgPreDeemedUsesThreeWay(asset)) return false;
  //   일반건물도 같다 — GB 취득시 기준시가 칸(의제취득일 기준) × 채무비율(PR-7b-2 · G-1). 일반건물 화면에는 선언 토글이 없어 종전에는 막다른 길이었다.
  if (gbBgUsesStdAcq(asset)) return false;
  //   시가 평가(담보 패)는 파트별 3자 max이고 그 파트의 ①이 필수다(Q-29 · G-5 · `transfer-tax-validate-bg.ts`) — 선언으로 ③만 쓰는 길을 두지 않는다(PR-7b-6).
  if (gbBgThreeWayParts(asset).any) return false;
  // 범위 밖 증여(재개발·입주권·부담부증여 등)는 종전대로 — 실거래가는 「증여 신고가액을 입력하세요」가 막고, 추계 계열만 선언을 요구한다.
  if (asset.acquisitionCause === "gift" && !isEstimatingMode(asset)) return false;
  if (clauseAReportedValue(asset) > 0) return false;
  if (isSec164ClauseAFilled(asset)) return false;
  return true;
}

/** 선언이 필요한데 하지 않았으면 오류 메시지, 아니면 null. */
export function clauseADeclarationError(asset: AssetForm, label: string): string | null {
  if (!needsClauseADeclaration(asset)) return null;
  if (asset.preDeemedClauseAUnconfirmed === true) return null;
  return fieldError(
    "preDeemedClauseAUnconfirmed",
    (
      `${label}: 의제취득일 전 상속·증여 자산의 취득가액은 상증법 평가액(§163⑨)·§164④~⑦ 기준시가·환산취득가액 중 큰 금액입니다. ` +
      `기준일 현재 상증법 평가액이나 §164④~⑦ 기준시가를 입력하거나, 둘 다 확인할 수 없으면 「상증법 평가액을 확인할 수 없음」을 선택하세요.`
    ),
  );
}

/**
 * ③이 §166③인 재개발·재건축 종전자산인가 — ⑤ 입력 카드·선언 안내·⑧이 공유한다(엔진 `resolvePreDeemedRedevelopment166_3Price`와 같은 축).
 * 승계조합원(완공 아파트 `redevIsSuccessorMember` · 승계 입주권 `isSuccessorRightToMoveIn`)은 §166③ 대상이 아니라 ③이 §176조의2④다.
 */
export function isRedev166_3PreDeemedAsset(asset: AssetForm): boolean {
  if (asset.assetKind !== "redevelopment_apt" && asset.assetKind !== "right_to_move_in") return false;
  if (asset.redevIsSuccessorMember === "yes") return false;
  return !(asset.assetKind === "right_to_move_in" && asset.isSuccessorRightToMoveIn === true);
}

/**
 * 재개발·재건축 종전자산(의제취득일 전 상속) — ①② 없이 선언했으면 ⑤ 「환산」 필수(⑫ `refinePreDeemedAcquisitionSource` 재개발 분기).
 *
 * 재개발 종전자산의 ③은 §176조의2④가 아니라 §166③이고, 엔진은 ⑤가 「환산」일 때만 §166③을 ③으로 쓴다
 * (화면에 없는 §166③ 칸 값을 쓰지 않기 위해 — 계획서 inheritance-pre-deemed-clause-b-revisit.plan.md §12).
 * ⑤ 「실가」로 두면 ①②③이 모두 없어 취득가액이 0이 된다 — ⑤ 실가 칸 값은 §163⑨ 의제가 덮어 쓰이지 않는다.
 * 증여는 E-1이 ⑤ 「환산」일 때만 걸리므로(`needsClauseADeclaration`) 여기 오지 않는다.
 */
export function redevPreDeemedEstimatedRequiredError(asset: AssetForm, label: string): string | null {
  if (!isRedev166_3PreDeemedAsset(asset)) return null;
  if (!needsClauseADeclaration(asset)) return null;
  if (redevPreApprovalAcqMode(asset) !== "actual") return null;
  return fieldError(
    "useEstimatedAcquisition",
    `${label}: 의제취득일 전 상속 종전자산에 상증법 평가액·§164④~⑦ 기준시가가 없으면 §166③ 환산취득가액으로 계산합니다. ` +
      `⑤ 「인가전 분 종전 부동산 취득가액」에서 "환산취득가액"을 선택하고 §166③ 칸을 입력하세요 (소득세법 시행령 §166③).`,
  );
}

/**
 * post-deemed 상속 — ①(상증법 평가액) 또는 ②(§164⑤~⑦) **필수**.
 *
 * 「상속세 및 증여세법」 §60③: "시가를 산정하기 **어려운 경우에는** … 제61조부터 제65조까지에
 * 규정된 방법으로 평가한 가액을 시가로 **본다**" ⇒ **평가액이 「없는」 상태는 법적으로 성립하지
 * 않는다**. 따라서 법 §97①1호 단서의 「가목을 확인할 수 없는 경우」에 해당하지 않아
 * **나목(환산)에 도달하지 않는다** — pre-deemed와 달리 **갈 곳이 없다**.
 *
 * ⇒ 선언(E-1)은 여기서 **효력이 없다**. 필수 입력이다.
 *
 * ⚠️ 종전에는 **주택·토지·건물**이 통과해 취득가액 **0**으로 계산됐다(양도차익 = 양도가액 전액,
 *    경고 0건). 상가는 이미 같은 규칙으로 막고 있었다 — 그 게이트를 3종에 넓힌 것이다.
 *
 * **통과 경로는 이미 화면에 있다** — `PostDeemedInputs`의 「평가방법 선택(§60 시가 / §61~65
 * 보충적) + 보충적 평가 보조계산」이 상증법 §60③을 그대로 구현하고, 산출 결과가 ①로 동기화된다.
 *
 * 설계: docs/02-design/features/post-deemed-clause-a-required.plan.md §4
 */
export function postDeemedClauseARequiredError(asset: AssetForm, label: string): string | null {
  if (asset.acquisitionCause !== "inheritance") return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  // pre-deemed는 E-1이 담당한다(그쪽은 ③이 있어 선언이 성립한다).
  if (!baseDate || baseDate < DEEMED_ACQUISITION_DATE) return null;

  /**
   * 취득가액의 실제 소스가 따로 있거나, 다른 게이트가 이미 막는 자산은 제외한다(§4.2).
   *
   * ⚠️ **제외 사유는 전부 여기 적는다.** 종전에는 화이트리스트가 3종뿐이라 나머지 5종이
   *    **말없이** 빠졌고, 그중 분양권은 **아무 게이트도 막지 않아** 취득가액 0으로 계산됐다
   *    (2026-08-09 8종 전수 실측 — 실측표는 anchor JSDoc).
   *
   * | assetKind | 막는 주체 |
   * |---|---|
   * | `housing`·`land`·`building`·**`presale_right`** | **이 함수** |
   * | 겸용주택(`isMixedUseHouse`) | `mixedAcq*` 3필드가 취득가액을 만든다 |
   * | `commercial_building` | 전용 블록이 같은 규칙으로 막는다 — 중복 차단은 메시지만 흐린다 |
   * | `redevelopment_apt`·`right_to_move_in` | §166①③④ 별도 경로. `validateRedevelopmentAsset`이 종전자산 취득가액(`redevActualAcquisitionPrice`)·환산 분모를 **필수**로 요구해 0이 되지 않는다(분기 전수 실측) |
   * | `general_building` | `transfer-tax-validate-gb.ts`가 **파트별로** ①을 요구한다. 여기서 또 막으면 토지·건물 어느 쪽이 빈지 못 알려주는 일반 메시지가 먼저 나온다 |
   *
   * 🔴 **분양권은 제외 대상이 아니다.** 그 화면에는 직접 취득가액 칸이 **없어** ①(상속세
   *    신고가액)이 **유일한 취득가액 입력 경로**다 — 비우면 대체 소스가 없다.
   */
  if (asset.isMixedUseHouse) return null;
  if (
    asset.assetKind === "commercial_building" ||
    asset.assetKind === "redevelopment_apt" ||
    asset.assetKind === "right_to_move_in" ||
    asset.assetKind === "general_building"
  ) {
    return null;
  }
  if (!["housing", "land", "building", "presale_right"].includes(asset.assetKind ?? "")) return null;

  // ⚠️ 상속의 ① 소스는 `publishedValueAtInheritance` **하나뿐**이다
  //    (`transfer-tax-api-inheritance.ts:52-54` — `fixedAcquisitionPrice`는 증여용).
  //    stale 세션에 후자가 남아 있어도 그 값은 §163⑨ 경로로 가지 않으므로 통과 사유가 아니다.
  if (parseAmount(asset.publishedValueAtInheritance ?? "") > 0) return null;
  // ②도 가목이다 — §163⑨2호 「평가한 가액과 §164⑤~⑦ 가액 **중 많은 금액**」.
  if (isSec164ClauseAFilled(asset)) return null;

  return fieldError("publishedValueAtInheritance", `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요.`);
}

/**
 * 원조합원(재개발·재건축 종전자산) 상속·증여 — 의제취득일 이후면 ①(상속세·증여세 신고가액) 또는 ②(§164⑤~⑦) 필수.
 *
 * 종전자산 취득가액은 영 §166① 「기존건물과 그 부수토지의 취득가액」이고, 상속·증여받은 것이면 영 §163⑨가 그 평가액을 실지거래가액으로
 * 본다. ①이 비면 ④가 §163⑨ 페이로드를 싣지 않아 엔진이 「종전 부동산 실거래가」(`redevActualAcquisitionPrice` — 피상속인·증여자 쪽 금액)를
 * 그대로 썼다(실측 · 입주권 상속 413,535,000 ↔ 평가액 334,290,000 · 완공 아파트 291,310,000 ↔ 232,510,000 · 증여·컴패니언도 같다).
 * 위 `postDeemedClauseARequiredError`가 재개발을 뺀 것은 그 칸이 필수라 0이 되지 않는다는 이유였다 — 0은 아니지만 축이 틀렸다.
 * 의제취득일 전은 §166③ 3자 max 설계(⑤ 「환산」 · `redevPreDeemedEstimatedRequiredError`)라 대상이 아니다. 부담부증여는 §159가 정한다.
 * 승계조합원(승계 입주권·승계 아파트)은 자기 규칙이 있다(`validateSuccessorRightAsset` 등). 계획서 successor-right-carryover-contribution.plan.md §14·§15.
 */
export function originalMemberClauseARequiredError(asset: AssetForm, label: string): string | null {
  if (asset.assetKind !== "redevelopment_apt" && asset.assetKind !== "right_to_move_in") return null;
  if (asset.isSuccessorRightToMoveIn === true || asset.redevIsSuccessorMember === "yes") return null;
  if (asset.acquisitionCause !== "inheritance" && asset.acquisitionCause !== "gift") return null;
  if (asset.transferType === "burdened_gift") return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  if (!baseDate || baseDate < DEEMED_ACQUISITION_DATE) return null;
  const isGift = asset.acquisitionCause === "gift";
  const field = isGift ? "fixedAcquisitionPrice" : "publishedValueAtInheritance";
  if (parseAmount(asset[field] ?? "") > 0) return null;
  if (isSec164ClauseAFilled(asset)) return null;
  return fieldError(
    field,
    isGift
      ? `${label}: 증여 신고가액(증여일 현재 평가액)을 입력하세요 — 증여받은 종전 부동산의 취득가액은 그 평가액입니다(소득세법 시행령 §163⑨·§166①). 종전 부동산 실거래가로는 계산하지 않습니다.`
      : `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요 — 상속받은 종전 부동산의 취득가액은 그 평가액입니다(소득세법 시행령 §163⑨·§166①). 종전 부동산 실거래가로는 계산하지 않습니다.`,
  );
}

/**
 * PD-1 ⑧ 거울 — 의제취득일(1985.1.1.) 전 상속·증여 자산이 ③(환산)으로 갈 때 **분자·분모 필수**
 * (2026-09-30 2차 점검 · ⑫ `refinePreDeemedAcquisitionSource`).
 *
 * E-1 선언은 「①·② 없음 → ③으로 간다」를 허용할 뿐 ③의 입력(의제취득일 현재 기준시가 · 양도시 기준시가)을
 * 요구하지 않았다. 비우면 엔진(`inheritance-acquisition-price.ts` `calcPreDeemed`)은 던지지 않고 **취득가액 0**으로
 * 계산했다(컴패니언 실측 379,731,000 vs 355,725,900). 주 자산은 ⑫가 400으로 막아 **⑧ 통과 ↔ ⑫ 400**
 * 막다른 길이었고, 컴패니언은 ⑫도 없어 조용히 0이었다.
 *
 * 판정은 **④ 빌더 그대로** 한다 — ④가 pre-deemed `inheritedAcquisition`을 싣는지, ①·②(§164④~⑦) 원천을
 * 싣는지를 같은 함수로 본다(⑫가 보는 것이 바로 그 payload다). 자기 서브객체로 취득가액을 만드는 자산
 * (겸용·일반건물·재개발·입주권)은 ④가 운반하지 않거나 ⑫가 제외한다. 감정가액·매매사례는 주 자산만 제외 —
 * 주 자산 ④는 `acquisitionMethod`로 보내 ⑫가 건너뛰지만, 컴패니언 payload에는 그 모드가 없다.
 */
export function preDeemedConversionInputError(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  isNonPrimaryAsset: boolean,
): string | null {
  if (
    (asset.assetKind === "housing" && asset.isMixedUseHouse === true) ||
    asset.assetKind === "general_building" ||
    asset.assetKind === "right_to_move_in" ||
    asset.assetKind === "redevelopment_apt"
  )
    return null;
  // 상가·오피스텔 상속은 ⑫(`refinePreDeemedAcquisitionSource`)가 검사한다 — 상속이면 `commercialBuildingValuation`을
  // 만들지 않아 ⑫의 제외 조건에 안 걸린다. 종전에는 여기서 제외해 「선언 + ③ 칸 비움」이 ⑧ 통과 ↔ ⑫ 400이었다(2026-10-22).
  if (!isNonPrimaryAsset && (asset.isAppraisalAcquisition === true || asset.isSalesCaseAcquisition === true)) return null;
  // 상가 §164⑥은 ②이자 ③의 분자다(사용자 결정 A안 · 계획서 commercial-pre-deemed-converted-numerator.plan.md) — 양도시 기준시가가 없으면
  // ③이 조용히 0이 된다. ①② 원천이 있어도 막는다(아래 ① 반환 전). 기준시가로 평가한 부담부증여는 ③이 없다(Q-25). ⑫ 같은 판정.
  // 시가로 평가했어도 담보평가가 이기면 취득가액이 의제취득일 기준시가 × 채무비율이라 ③을 비교하지 않는다 — 단독 소유 단건만(Q-2 a ·
  // 계획서 bg-std-mode-transfer-std-required.plan.md §3.3 · 양도시 기준시가 4억·6억 세액 동일 실측).
  if (
    !(asset.transferType === "burdened_gift" && asset.bgValuationMode === "sangjeungbeop_standard") &&
    !(!isNonPrimaryAsset && bgCollateralForcesStdAcq(asset)) &&
    "commercialInheritanceValuation" in buildCommercialInheritanceValuationPayload(asset) &&
    (buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition as { mode?: string } | undefined)?.mode === "pre-deemed" &&
    !(parseAmount(asset.standardPriceAtTransfer ?? "") > 0)
  )
    return fieldError("standardPriceAtTransfer", `${label}: 의제취득일(1985.1.1.) 전 상속·증여 상가는 §164⑥ 취득당시 기준시가로 환산취득가액도 비교합니다 — 양도시 기준시가를 입력하세요 (소득세법 시행령 §176의2④·§164⑥).`);
  const ia = buildInheritedAcquisitionPayload(asset, 1, false).inheritedAcquisition as
    | { mode?: string; reportedValue?: number }
    | undefined;
  if (ia?.mode !== "pre-deemed") return null;
  const td = formTransferDate ?? "";
  const clauseB =
    "inheritedHouseValuation" in buildInheritedHouseValuationPayload(asset, td) ||
    "commercialInheritanceValuation" in buildCommercialInheritanceValuationPayload(asset) ||
    (asset.assetKind === "land" && isSec163_9Cause(asset.acquisitionCause) && "pre1990Land" in buildPre1990LandPayload(asset, td));
  const giftConversion = isGiftPreDeemedConversionAsset(asset);
  // ①·②가 있어도 ③의 분자만 있고 분모가 없으면 ③이 조용히 비교에서 빠진다(계획서 pre-deemed-converted-half-input.plan.md F4 · ⑫ 같은 판정).
  //   분자·분모는 엔진이 쓰는 값 그대로다 — 직접 입력(④ 전송값)이거나 화면 자동값(토지 등급 · 주택 3시점 · Q-3). 직접 입력 토글을 켜고
  //   칸을 비우면 ④는 값을 싣지 않고 엔진이 자동값으로 돌아가므로 그때도 자동값을 「있음」으로 본다(⑫와 같다 — 취득가액 리뷰 게이트 D-2).
  //   분자 없이 분모만 있는 것은 막지 않는다 — 양도시 기준시가 칸은 §167의3 판정·공익수용 블록과 함께 쓴다(Q-2).
  //   ①② 없음은 아래 검사가 같은 칸을 요구한다(문구 보존). 래치 켠 상속 토지 등급 경로는 환산 검증(`transfer-tax-validate-acquisition.ts`)이
  //   같은 칸을 먼저 요구한다. 기준시가 평가 부담부증여·담보 승은 ③을 비교하지 않는다(상가 규칙과 같은 제외).
  if (
    ((ia.reportedValue ?? 0) > 0 || giftConversion || clauseB) &&
    preDeemedConversionInputShown(asset) &&
    !hasPre1990LandEstimation(asset) &&
    !(asset.transferType === "burdened_gift" && asset.bgValuationMode === "sangjeungbeop_standard") &&
    !(!isNonPrimaryAsset && bgCollateralForcesStdAcq(asset))
  ) {
    const baseDate = deriveSec163_9BaseDate(asset) ?? "";
    const auto = preDeemedAutoStdPrices(asset, baseDate, preDeemedShowsHouseValuation(asset), formTransferDate);
    const sent = preDeemedSentStdPrices(asset, baseDate, formTransferDate);
    const hasDeemed = sent.atDeemed > 0 || auto.atDeemed !== null;
    const hasTransfer = sent.atTransfer > 0 || auto.atTransfer !== null;
    if (hasDeemed && !hasTransfer)
      return fieldError("standardPriceAtTransfer", `${label}: 의제취득일(1985.1.1.) 전 상속·증여 자산은 상증법 평가액·§164④~⑦ 기준시가와 함께 환산취득가액도 비교합니다 — 의제취득일 기준시가가 있으면 양도시 기준시가도 입력하세요 (소득세법 시행령 §176의2④).`);
  }
  // ③ 칸이 있는 증여는 ①(증여 신고가액)이 필수라(Q-14) ①·②가 모두 없으면 그 검사가 막는다 — 여기서 ③ 칸을 먼저 요구하면 엉뚱한 칸을 가리킨다.
  if (giftConversion) return null;
  if ((ia.reportedValue ?? 0) > 0) return null;
  if (clauseB) return null;
  if (!(parseAmount(asset.standardPriceAtAcq ?? "") > 0))
    return fieldError("standardPriceAtAcq", `${label}: 의제취득일(1985.1.1.) 전 상속·증여 자산을 환산하려면 의제취득일 현재 기준시가를 입력하세요 (소득세법 시행령 §176의2④).`);
  if (!(parseAmount(asset.standardPriceAtTransfer ?? "") > 0))
    return fieldError("standardPriceAtTransfer", `${label}: 의제취득일 전 상속·증여 자산의 환산에는 양도시 기준시가가 필요합니다 (소득세법 시행령 §176의2④).`);
  return null;
}
