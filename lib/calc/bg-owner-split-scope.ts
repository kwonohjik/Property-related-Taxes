/**
 * 부담부증여 × 토지·건물 소유자 분리 — 범위 판정 단일 소스(계획서 `docs/00-pm/bg-owner-split-159.plan.md` §4 · PR-3).
 *
 * 「소득세법 시행령」 §159①의 A(평가액)·C(증여가액)는 **증여한 자산**의 값이다 — 건물만 소유해 건물만 증여했다면 건물분 값이다.
 * 엔진(PR-2 `burdened-gift-owner-split.ts`)은 ④가 본인 몫만 싣는 입력 계약으로 계산한다(비소유 파트 기준시가 0 · 자동 안분 없음).
 *
 * ## 범위 (사용자 결정 Q-1 b · Q-6 a · Q-7 a — 2026-11-12)
 *  · 안: 건물(`assetKind: "building"`) × 취득원인 매매 × (기준시가 평가 | 시가 평가의 실지취득가액·환산취득가액) × 단독 소유 단건.
 *  · 밖(사유별로 막는다): 주택 · 매매 외 취득원인(상속·증여·이월과세·신축) · 시가 평가의 매매사례가액·감정가액 · 공유지분 · 함께 양도 묶음·지분 분할(축 B).
 *
 * ⑤(토글 잠금·카드 노출)·④(`bgOwnerSplitInfoPatch`)·⑧(`validateBgOwnerSplit`)·⑫(`transfer-tax-schema-bg-owner-split.ts`)가 **이 술어만** 읽는다(3중 패턴).
 * 채무가 증여한 부분에만 관련된다는 확인(`bgOwnerSplitDebtConfirmed`)은 범위 판정이 아니라 필수 입력이다 — ⑧이 그 칸으로 보내고, ④가 `burdenedGiftInfo.ownerSplitDebtConfirmed`로 실어 엔진 계약·⑫가 같은 값을 요구한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";
import { getOwnershipRatio } from "./transfer-tax-api-asset-basics";
import { bgOwnerSplitNeedsTransferStd } from "@/lib/tax-engine/burdened-gift-owner-split";

/** 차단 문구 머리말 — 사유별 문구가 이어 붙는다(테스트·field-jump가 머리말로 식별한다). */
export const BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE = "토지·건물 소유자가 다른 자산의 부담부증여는 이 경우 계산하지 않습니다";

export const BG_OWNER_SPLIT_REASON = {
  housing:
    "주택(개별주택가격)은 증여한 건물분(또는 토지분)만의 평가액을 정하는 「상속세 및 증여세법」상 근거를 확인하지 못해 계산하지 않습니다. 건물(주택이 아닌 건물) 자산만 계산합니다 (소득세법 시행령 §159①)",
  kind: "건물(주택이 아닌 건물) 자산만 계산합니다 (소득세법 시행령 §159①)",
  cause: "취득원인이 매매인 자산만 계산합니다 (상속·증여·신축 취득은 계산하지 않습니다)",
  carryover: "배우자등 이월과세(소득세법 §97의2)가 적용되는 자산은 계산하지 않습니다",
  method: "취득가액 산정방식이 실지취득가액 또는 환산취득가액인 경우만 계산합니다 (매매사례가액·감정가액은 계산하지 않습니다)",
  coOwnership: "공유지분 자산은 계산하지 않습니다 (단독 소유 단건만 계산합니다)",
  bundle: "함께 양도 묶음·지분 분할 취득은 계산하지 않습니다 (단독 소유 단건만 계산합니다)",
} as const;
export type BgOwnerSplitReason = keyof typeof BG_OWNER_SPLIT_REASON;

export const bgOwnerSplitReasonMessage = (r: BgOwnerSplitReason): string => `${BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE} — ${BG_OWNER_SPLIT_REASON[r]}`;

type AssetScope = Pick<
  AssetForm,
  | "transferType" | "assetKind" | "isMixedUseHouse" | "selfOwns" | "acquisitionCause" | "bgValuationMode" | "bgAcquisitionMethod"
  | "ownershipNumerator" | "ownershipDenominator"
>;

/** 부담부증여 + 유효한 소유자 분리(건물만·토지만) 축이 켜져 있는가 — 범위 안팎을 가르기 전 단계. 겸용·토지 등 범위 밖 종류의 잔재는 `both`로 읽는다. */
function ownerSplitRequested(asset: AssetScope): boolean {
  return asset.transferType === "burdened_gift" && (effectiveSelfOwns(asset) ?? "both") !== "both";
}

/** 자산 폼에서 읽는 범위 밖 사유. `bundled`는 폼-전역 사실(함께 양도 자산이 있다) — 호출부가 안다(⑧). */
function assetReason(asset: AssetScope, bundled: boolean): BgOwnerSplitReason | undefined {
  if (asset.assetKind === "housing") return "housing";
  if (asset.assetKind !== "building") return "kind";
  if (asset.acquisitionCause === "carryover_gift") return "carryover";
  if (asset.acquisitionCause !== "purchase") return "cause";
  if (asset.bgValuationMode === "sangjeungbeop_market" && (asset.bgAcquisitionMethod === "salesCase" || asset.bgAcquisitionMethod === "appraisal")) return "method";
  if (getOwnershipRatio(asset as AssetForm) < 1) return "coOwnership";
  if (bundled) return "bundle";
  return undefined;
}

/** ⑤④⑧ — 범위 안: 본인 몫(증여한 부분) 입력을 받아 계산한다. 함께 양도 여부는 보지 않는다(그 사유는 ⑧이 `bundled`로 더한다). */
export function bgOwnerSplitActive(asset: AssetScope): boolean {
  return ownerSplitRequested(asset) && assetReason(asset, false) === undefined;
}

/** ⑤⑧ — 범위 밖: 사유별 차단 문구. 소유자 분리 요청이 없거나 범위 안이면 null. */
export function bgOwnerSplitUnsupported(asset: AssetScope, opts?: { bundled?: boolean }): string | null {
  if (!ownerSplitRequested(asset)) return null;
  const r = assetReason(asset, opts?.bundled === true);
  return r ? bgOwnerSplitReasonMessage(r) : null;
}

/** 증여한 부분 — 건물만 본인이면 건물, 토지만 본인이면 토지. 범위 안일 때만 의미가 있다. */
export function bgOwnerSplitOwnedPart(asset: Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">): "building" | "land" | undefined {
  const own = effectiveSelfOwns(asset);
  return own === "building_only" ? "building" : own === "land_only" ? "land" : undefined;
}

// ── ⑫ 요청 본문 ───────────────────────────────────────────────────────────────────────────

/** 본문에서 범위를 가르는 데 쓰는 키 — 주 자산(`propertyType`)·컴패니언(`propertyType`으로 옮겨 넘긴다) 공용. */
export type BgOwnerSplitBody = {
  transferType?: string;
  acquisitionCause?: string;
  propertyType?: string;
  burdenedGiftInfo?: unknown;
  burdenedGiftWholeInfo?: unknown;
  selfOwns?: string;
  ownershipRatio?: number;
  companionAssets?: readonly unknown[];
};

type BodyInfo = { valuationMode?: string; acquisitionMethod?: string; carryoverDonorBasis?: unknown };
const infoOf = (d: BgOwnerSplitBody): BodyInfo | undefined => (d.burdenedGiftInfo != null ? (d.burdenedGiftInfo as BodyInfo) : undefined);

/** 엔진이 §159를 도는 조건(`transfer-tax-burdened-gift-step.ts`)과 같다 — 부담부증여 + 부담부증여 info + 소유자 분리 축. */
function bodyOwnerSplitRequested(d: BgOwnerSplitBody): boolean {
  const isBg = d.transferType === "burdened_gift" || d.acquisitionCause === "burdened_gift";
  return isBg && d.burdenedGiftInfo != null && !!d.selfOwns && d.selfOwns !== "both";
}

function bodyReason(d: BgOwnerSplitBody, bundled: boolean): BgOwnerSplitReason | undefined {
  if (d.propertyType === "housing") return "housing";
  if (d.propertyType !== "building") return "kind";
  if (d.acquisitionCause === "carryover_gift" || infoOf(d)?.carryoverDonorBasis != null) return "carryover";
  // 레거시 `acquisitionCause: "burdened_gift"`는 원래 취득원인을 알 수 없다 — 매매로 읽지 않는다(보수적 차단).
  if (d.acquisitionCause !== undefined && d.acquisitionCause !== "purchase") return "cause";
  const m = infoOf(d)?.acquisitionMethod;
  if (infoOf(d)?.valuationMode === "sangjeungbeop_market" && (m === "salesCase" || m === "appraisal")) return "method";
  if (d.ownershipRatio !== undefined && d.ownershipRatio < 1) return "coOwnership";
  if (bundled || d.burdenedGiftWholeInfo != null || (d.companionAssets?.length ?? 0) > 0) return "bundle";
  return undefined;
}

/** ⑫ — 범위 밖: 사유별 차단 문구. `bundled`는 컴패니언 항목이 넘긴다(그 자체가 함께 양도 묶음의 한 자산이다). */
export function bgOwnerSplitUnsupportedBody(d: BgOwnerSplitBody, opts?: { bundled?: boolean }): string | null {
  if (!bodyOwnerSplitRequested(d)) return null;
  const r = bodyReason(d, opts?.bundled === true);
  return r ? bgOwnerSplitReasonMessage(r) : null;
}

/** ⑫ — 범위 안: 본인 몫 계약(비소유 파트 0)을 검사할 본문. */
export function bgOwnerSplitActiveBody(d: BgOwnerSplitBody): boolean {
  return bodyOwnerSplitRequested(d) && bodyReason(d, false) === undefined;
}

/** 증여한 부분의 양도시 기준시가를 받는가 — 폼 값을 엔진 술어 모양으로 넘긴다(⑤ 카드·④ `bgOwnerSplitInfoPatch`·⑧ `validateBgOwnerSplit` 공용). */
export function bgOwnerSplitTransferStdNeeded(asset: Pick<AssetForm, "bgValuationMode" | "bgAcquisitionMethod">): boolean {
  return bgOwnerSplitNeedsTransferStd({ valuationMode: asset.bgValuationMode, acquisitionMethod: asset.bgAcquisitionMethod });
}

/**
 * 건물만 증여(소유자 분리)의 「증여한 건물분 증여일 건물 기준시가」(상증법 §61①2호) 칸을 여는가 — ⑤ 칸·계산기 합산 규칙·④ 송신 공용.
 * 증여가액 C는 증여한 건물의 상증법 가액이다. 상증법 건물 기준시가에는 양도세 값에 없는 조정률·잔가율이 붙는다(「국세청 건물 기준시가
 * 계산방법 고시」 제5조 제2항·제10조 제2항·제11조) — 일반 부담부증여와 같은 필수 입력이다(`bg-gift-building-std-required.ts`).
 * 토지만 증여는 해당 없다(토지는 두 법 모두 개별공시지가 — 「상속세 및 증여세법」 제61조 제1항 제1호).
 */
export function bgOwnerSplitGiftBuildingStdOpen(asset: Parameters<typeof bgOwnerSplitActive>[0] & Pick<AssetForm, "assetKind" | "isMixedUseHouse" | "selfOwns">): boolean {
  return bgOwnerSplitActive(asset) && bgOwnerSplitOwnedPart(asset) === "building";
}
