/**
 * 부담부증여 × 토지·건물 소유자 분리 — 아직 계산하지 않는다(⑤ 토글 잠금 · ⑧ · ⑫ 차단 · 사용자 결정 c 2026-11-12).
 *
 * 「소득세법 시행령」 §159①의 A(평가액)·C(증여가액)는 **증여한 자산**의 값이다 — 건물만 소유해 건물만 증여했다면 건물분 값이다.
 * 그런데 ④는 부담부증여면 소유자 분리 payload를 보내지 않고(`isSplitPayloadActive` · 날짜 분리 음수 잔액 사유), 엔진 양도차익은
 * 분리 결과가 있어야 `selfOwns`를 쓴다(`transfer-tax.ts`) → 물건 전체 값으로 §159를 계산했다. 취득·양도 시점 건물 비중이 다르면 갈린다
 * (실측 · 기준시가 모드 · 채무 1억 · 건물 비중 양도 20%·취득 50%: 결정세액 4,039,500 ↔ 건물분 값 0 — 모의 세율).
 * 날짜 분리용 파트 §159(`burdened-gift-split-parts.ts`)는 두 파트를 모두 증여해 채무를 나누는 모델이라 그대로 쓸 수 없다 — 엔진 구현은 별건(계획서 필요).
 * 설계서 `bg-house-building-split.design.md` V-3이 남긴 미측정 항목이다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { effectiveSelfOwns } from "./self-owns-scope";

export const BG_OWNER_SPLIT_UNSUPPORTED_MESSAGE =
  "토지·건물 소유자가 다른 자산의 부담부증여는 아직 계산하지 않습니다 — 평가액·증여가액이 증여한 부분(본인 소유분)의 값이어야 하는데 이 계산기는 물건 전체 값으로 계산합니다 (소득세법 시행령 §159①)";

/** ⑤·⑧ — 폼 자산. ④가 부담부증여로 보내는 조건(`transferType`)과 유효 소유 축(`effectiveSelfOwns` — 범위 밖 잔재는 both). */
export function bgOwnerSplitUnsupported(asset: Pick<AssetForm, "transferType" | "assetKind" | "isMixedUseHouse" | "selfOwns">): boolean {
  return asset.transferType === "burdened_gift" && (effectiveSelfOwns(asset) ?? "both") !== "both";
}

/** ⑫ — 요청 본문(주 자산 · 컴패니언). 엔진이 §159를 도는 조건(`transfer-tax-burdened-gift-step.ts`)과 같다. */
export function bgOwnerSplitUnsupportedBody(d: { transferType?: string; acquisitionCause?: string; burdenedGiftInfo?: unknown; selfOwns?: string }): boolean {
  const isBg = d.transferType === "burdened_gift" || d.acquisitionCause === "burdened_gift";
  return isBg && d.burdenedGiftInfo != null && !!d.selfOwns && d.selfOwns !== "both";
}
