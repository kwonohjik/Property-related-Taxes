/**
 * 승계조합원 조합원입주권 — 판정 술어 + 취득가액 합산 (**단일 소스**)
 *
 * UI(입력 카드 노출)·API 변환(⑬)·validate(⑧)·사이드바(⑥)가 **이 파일만** 쓴다.
 * 각자 술어를 다시 쓰면 「화면엔 칸이 있는데 계산엔 안 들어가는」 dual-truth가 된다
 * (memory `feedback_ui_engine_dual_truth_avoidance` · `feedback_shared_predicate_argument_parity`).
 *
 * ## 왜 §166 경로와 갈라지는가
 *
 * 「소득세법 시행령」 §166①은 「정비사업조합의 조합원이 **당해 조합에 기존건물과 그 부수토지를
 * 제공**(건물 또는 토지만을 제공한 경우를 포함한다)**하고 취득한** 입주자로 선정된 지위를 양도하는
 * 경우 **그 조합원의** 양도차익」으로 요건을 한정한다. 승계조합원은 조합에 제공한 사실이 없어
 * 이 요건을 충족하지 않는다 ⇒ 양도차익은 §100①·§95①·§97①1호 가목의 일반 원칙으로 계산한다.
 *
 * 취득가액의 구성은 국세청 **기준-2025-법규재산-0057**(법규과-1320, 2025-06-19)이 밝혔다 —
 * 「종전주택 권리가액과 취득 이후 조합원 분양계약에 따라 납입한 **추가분담금** 등을 합산하여
 * 산정하는 것이며, 조합원입주권 취득 당시 **프리미엄**을 지급한 사실이 객관적인 입증자료에 의하여
 * 확인되는 경우에는 해당 가액을 취득가액에 포함할 수 있는 것」.
 * ⇒ 「승계취득가액(권리가액 상당 + 프리미엄)」 + 「취득 후 납입 추가분담금」 2칸으로 받아 합산한다.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isSec163_9Cause } from "./transfer-163-9-base-date";

/**
 * 승계조합원 입주권 양도인가 — §166 경로와 §97①1호 경로를 가르는 **단일 술어**.
 *
 * ⚠️ `redevIsSuccessorMember`(사례 48 · 완공APT 승계조합원)와 **다른 축**이다. 그쪽은 신축APT를
 *    양도하는 경우이고, 이쪽은 완공 전 권리를 양도하는 경우다. 이름이 비슷하다고 겸용하지 말 것.
 */
export function isSuccessorRightTransfer(asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn">): boolean {
  return asset.assetKind === "right_to_move_in" && asset.isSuccessorRightToMoveIn === true;
}

/**
 * 승계조합원 입주권을 **부담부증여**하는가 — 취득가액은 승계 블록 2칸(승계취득가액 + 추가분담금)이 정본이다.
 *
 * 「소득세법 시행령」 제159조 제1항 제1호의 A는 「법 제97조제1항제1호에 따른 가액」이고, 승계조합원의 가목 금액은
 * 승계취득가액 + 추가분담금이다(기준-2025-법규재산-0057). 부담부증여 카드의 「종전 부동산 실지취득가액」은
 * 원조합원(영 §166①1호) 개념이라 승계에는 숨기고 읽지 않는다. 추계(나목)는 아직 받지 않는다 —
 * 계획서 `docs/02-design/features/bg-successor-rtmi-acquisition-input.plan.md` Q-2 (a).
 */
export function isBgSuccessorRight(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "transferType">,
): boolean {
  return isSuccessorRightTransfer(asset) && asset.transferType === "burdened_gift";
}

/**
 * 승계조합원 입주권을 **이월과세(§97의2)로 증여받았는가**(부담부증여 아님) — 취득가액은 이월과세 블록(증여자 취득가액 또는 환산)이 정한다.
 * 승계 블록의 산정 방식 라디오·승계취득가액은 계산에 쓰이지 않아 ⑤가 숨기고 ⑧도 요구하지 않는다(실측: 승계취득가액 1 · 400,000,000 · 900,000,000 세액 동일).
 * 계획서 `docs/02-design/features/successor-right-carryover-validation.plan.md` Q-4 (a).
 */
export function isCarryoverSuccessorRight(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "transferType" | "acquisitionCause">,
): boolean {
  return isSuccessorRightTransfer(asset) && asset.acquisitionCause === "carryover_gift" && asset.transferType !== "burdened_gift";
}

/**
 * 승계조합원 입주권을 **상속·증여로 받았는가**(부담부증여·이월과세 아님) — 취득가액은 「소득세법 시행령」 §163⑨의
 * 상속개시일·증여일 현재 평가액(증여 신고가액 · 상속개시일 평가액)이다. ④가 §163⑨ 페이로드로 그 값을 쓰므로
 * 승계 산정 방식·승계취득가액은 계산에 쓰이지 않는다(실측: 승계취득가액 900,000,000에도 세액 불변) — ⑤가 숨기고 ⑧도 요구하지 않는다.
 * 계획서 `docs/02-design/features/successor-right-carryover-contribution.plan.md` Q-2 (a).
 */
export function isDeemedValueSuccessorRight(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "transferType" | "acquisitionCause">,
): boolean {
  return isSuccessorRightTransfer(asset) && isSec163_9Cause(asset.acquisitionCause) && asset.transferType !== "burdened_gift";
}

/** §163⑨ 평가액 칸 — 증여는 「증여 신고가액」(`fixedAcquisitionPrice`), 상속은 「상속개시일 평가액」(`publishedValueAtInheritance`). ④ §163⑨ 페이로드의 ① 소스와 같다. */
export function deemedSuccessorRightValueField(
  asset: Pick<AssetForm, "acquisitionCause">,
): "fixedAcquisitionPrice" | "publishedValueAtInheritance" {
  return asset.acquisitionCause === "gift" ? "fixedAcquisitionPrice" : "publishedValueAtInheritance";
}

/**
 * 승계 입주권 실지거래가액 모드의 취득가액 — ④ 주 자산·컴패니언·⑥ 사이드바 **단일 leaf**.
 * 상속·증여는 §163⑨ 평가액이고, 그 밖(매매 등)은 승계취득가액 + 추가분담금이다.
 * 상속·증여 추가분담금은 ⑧이 거절한다(근거 확인 전 — 계획서 Q-2 a).
 */
export function successorRightActualAcquisition(
  asset: Pick<AssetForm, "assetKind" | "isSuccessorRightToMoveIn" | "transferType" | "acquisitionCause" | "successorRightAcqPrice" | "successorRightAddedContribution" | "fixedAcquisitionPrice" | "publishedValueAtInheritance">,
): number {
  return isDeemedValueSuccessorRight(asset)
    ? parseAmount(asset[deemedSuccessorRightValueField(asset)] ?? "")
    : successorRightAcquisitionTotal(asset);
}

/**
 * 승계조합원 입주권의 취득가액 — 승계취득가액 + 취득 후 납입 추가분담금.
 *
 * 추가분담금 미입력("")은 0으로 본다 — 승계 직후 양도라 납입분이 없을 수 있다.
 * 합계가 음수가 되는 입력은 애초에 ⑧ validate가 차단하지만, 조립 단계에서도 0으로 막는다.
 */
export function successorRightAcquisitionTotal(
  asset: Pick<AssetForm, "successorRightAcqPrice" | "successorRightAddedContribution">,
): number {
  const base = parseAmount(asset.successorRightAcqPrice ?? "");
  const contribution = parseAmount(asset.successorRightAddedContribution ?? "");
  return Math.max(0, base + contribution);
}

/**
 * ── §165① 기준시가 — 승계 입주권 추계 전용 (R-12) ───────────────────────────────
 *
 * 「소득세법 시행령」 §165①(현행 mst 286211):
 *   「법 제99조제1항제2호 가목에서 "대통령령으로 정하는 방법에 따라 평가한 가액"이란
 *    **취득일 또는 양도일까지 납입한 금액과 취득일 또는 양도일 현재의 프리미엄에 상당하는
 *    금액을 합한 금액**을 말한다.」
 *
 * 조합원입주권은 법 §94①2호 **가목**(「부동산을 취득할 수 있는 권리」)이고, §99①2호 가목이
 * 그 기준시가를 §165①에 위임한다. 환산 산식(영 §176의2②**2호**)도 「법 제94조제1항제1호 및
 * **제2호가목**에 따른 … **부동산을 취득할 수 있는 권리**」를 명시 대상으로 삼는다.
 *
 * ⚠️ **미입력은 0이 아니라 「없음」이 아니다.** 두 칸이 모두 비면 합계 0이 되고, 그대로 보내면
 *    환산 분자·분모가 무너져 취득가액이 **0**으로 계산된다(실측: 양도차익 = 양도가액 전액).
 *    그래서 ⑧ validate가 추계 모드에서 **필수**로 요구한다 — 여기서 fallback을 만들지 않는다.
 */
export function successorRightStdPriceAtAcq(
  asset: Pick<AssetForm, "successorRightStdPaidAtAcq" | "successorRightStdPremiumAtAcq">,
): number {
  return (
    parseAmount(asset.successorRightStdPaidAtAcq ?? "") +
    parseAmount(asset.successorRightStdPremiumAtAcq ?? "")
  );
}

/** §165① 양도당시 기준시가 — 환산 분모(§176의2②2호). 감정·매매사례에서는 쓰지 않는다. */
export function successorRightStdPriceAtTransfer(
  asset: Pick<AssetForm, "successorRightStdPaidAtTransfer" | "successorRightStdPremiumAtTransfer">,
): number {
  return (
    parseAmount(asset.successorRightStdPaidAtTransfer ?? "") +
    parseAmount(asset.successorRightStdPremiumAtTransfer ?? "")
  );
}

/**
 * 승계 입주권이 **추계**(환산·감정·매매사례) 모드인가 — ④ 변환·⑧ validate·⑤ UI **단일 술어**.
 *
 * 실거래가 모드에서는 승계 2칸(`successorRightAcquisitionTotal`)이 취득가액이고,
 * 추계 모드에서는 그 2칸 대신 §165① 기준시가와 추계값이 쓰인다 — **배타**다.
 */
export function successorRightEstimationMode(
  asset: Pick<AssetForm, "useEstimatedAcquisition" | "isAppraisalAcquisition" | "isSalesCaseAcquisition" | "transferType"> & { acquisitionCause?: AssetForm["acquisitionCause"] },
): "actual" | "estimated" | "appraisal" | "salesCase" {
  // 부담부증여는 실지거래가액만 받는다 — ⑤가 라디오를 숨기므로 남은 추계 플래그는 읽지 않는다(`isBgSuccessorRight`).
  // 이월과세도 라디오를 숨긴다(`isCarryoverSuccessorRight` — 취득가액은 이월과세 블록이 정한다). 남은 플래그로 매매사례·감정·환산 갈래를 타지 않는다.
  // 상속·증여도 숨긴다(`isDeemedValueSuccessorRight` — 취득가액은 §163⑨ 평가액). 종전 남은 환산 플래그는 ⑧ 통과 → ⑫ 400이었다.
  if (asset.transferType === "burdened_gift" || asset.acquisitionCause === "carryover_gift" || isSec163_9Cause(asset.acquisitionCause)) return "actual";
  if (asset.isSalesCaseAcquisition === true) return "salesCase";
  if (asset.isAppraisalAcquisition === true) return "appraisal";
  if (asset.useEstimatedAcquisition === true) return "estimated";
  return "actual";
}

/**
 * 「조합원 유형」 질문이 **어느 섹션에 있는가** — ⑧ 안내 문구와 화면 위치의 단일 소스.
 *
 * 단건·첫 카드·함께 양도 카드는 ① 기본정보에 있다. 같은 물건 지분 분할(축 B)의 **둘째 이후 지분 카드**는
 * ① 기본정보를 숨기므로(`CompanionAssetCard` `hideInheritedSections`) ③ 취득정보에 같은 컴포넌트가 뜬다
 * (`SuccessorRightTypeToggle`). 문구가 그 카드에 없는 칸을 가리키면 사용자는 막다른 길을 만난다.
 *
 * @param isFractionalShareCard 축 B 묶음의 첫 카드가 아닌 지분 카드인가 (UI: `splitMode === "fractional" && !isFirst` ·
 *   ⑧: `isFractionalSplitAxis && isNonPrimaryAsset`)
 */
export function successorTypeToggleSectionLabel(isFractionalShareCard: boolean): "① 기본정보" | "③ 취득정보" {
  return isFractionalShareCard ? "③ 취득정보" : "① 기본정보";
}

/**
 * ① 기본정보 「조합원 유형」 토글 patch — **반대편 전용 필드를 함께 비운다**.
 *
 * 두 유형은 취득가액 입력 카드가 서로 다르다(승계 = 전용 2칸 · 원조합원 = §166 ④⑤ 섹션).
 * 전환 후 반대편 값이 남아 있으면 화면에 없는 값이 계산에 쓰이거나, 되돌렸을 때 예전 값이
 * 되살아나 사용자가 모르는 숫자로 계산된다.
 *
 * ⚠️ **단일 배치 patch**로 돌려준다 — 호출부가 `onChange`를 두 번 부르면 두 번째 spread가
 *    첫 번째를 덮어써 한쪽이 조용히 유실된다(memory `feedback_multikey_patch_stale_spread_overwrite`).
 */
export function successorRightTogglePatch(isSuccessor: boolean): Partial<AssetForm> {
  if (isSuccessor) {
    return {
      isSuccessorRightToMoveIn: true,
      // 원조합원 전용 — §166①의 「기존건물과 그 부수토지」 축
      redevActualAcquisitionPrice: "",
      /**
       * 산정 방식은 **실거래가로 되돌린다**. 원조합원의 `useEstimatedAcquisition`은 §166③ 환산
       * (종전 부동산)을 뜻하고 승계의 그것은 §176의2②2호 환산(입주권 자체)이라 **의미가 다르다**.
       * 값을 그대로 이어받으면 화면에 없는 근거로 다른 산식이 돈다.
       * (R-12 전에는 「승계는 환산 미지원」이라 false 고정이었다 — 이제는 의미 충돌 방지가 이유다.)
       */
      useEstimatedAcquisition: false,
      isAppraisalAcquisition: false,
      isSalesCaseAcquisition: false,
    };
  }
  return {
    isSuccessorRightToMoveIn: false,
    // 승계조합원 전용 — §97①1호 가목 축
    successorRightAcqPrice: "",
    successorRightAddedContribution: "",
    // §165① 기준시가 4칸도 승계 전용이다 (R-12)
    successorRightStdPaidAtAcq: "",
    successorRightStdPremiumAtAcq: "",
    successorRightStdPaidAtTransfer: "",
    successorRightStdPremiumAtTransfer: "",
    // 원조합원의 §166③ 환산과 의미가 다르므로 되돌릴 때도 초기화한다(위 주석과 같은 이유).
    useEstimatedAcquisition: false,
    isAppraisalAcquisition: false,
    isSalesCaseAcquisition: false,
  };
}

/**
 * ④ 진입 사본 — 이월과세·상속·증여 승계 입주권에 남은 승계 산정 방식 플래그(감정·매매사례·환산)를 끈다. ⑤가 라디오를 숨기므로(Q-4 a) 남은 값은 고칠 칸이 없는데,
 * 주 자산·컴패니언 ④가 원값을 읽어 이월과세 결과를 바꿨다(실측: 매매사례 잔재 472,935,000 → 299,010,000 · 환산 잔재 ⑫ 400).
 * 상속·증여도 같다(종전 증여 환산 잔재 ⑧ 통과 → ⑫ 400 — 계획서 `successor-right-carryover-contribution.plan.md` Q-2 a).
 * 계획서 `docs/02-design/features/successor-right-carryover-validation.plan.md` §5.
 */
export function withHiddenSuccessorRightModeActual<F extends { assets: AssetForm[] }>(form: F): F {
  const assets = form.assets?.map((a) =>
    (isCarryoverSuccessorRight(a) || isDeemedValueSuccessorRight(a)) && (a.useEstimatedAcquisition || a.isAppraisalAcquisition || a.isSalesCaseAcquisition)
      ? { ...a, useEstimatedAcquisition: false, isAppraisalAcquisition: false, isSalesCaseAcquisition: false }
      : a,
  );
  return assets && assets.some((a, i) => a !== form.assets[i]) ? { ...form, assets } : form;
}
