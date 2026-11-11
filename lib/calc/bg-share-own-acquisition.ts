/**
 * 축 B(지분 분할) × 부담부증여 — 지분 카드(자산 2~N)가 **자기** 취득가액 산정방식 · 실지취득가액을 쓰는가.
 *
 * 「소득세법 시행령」 §159①1호 취득가액 A는 「법 제97조제1항제1호에 따른 가액」 — 양도인이 그 지분을 취득할 때의 가액이다.
 * 축 B는 지분마다 취득이 따로라 그 값이 지분마다 다를 수 있다. 종전에는 ④ `mergePrimaryBasic`이 네 칸을 자산 1 값으로 덮어
 * 지분 2~N에 입력 경로가 없었다(계획서 `companion-inherit-valuation-share-vp2c.plan.md` §14 D-2).
 *
 * 화면(토글 노출) · ④(병합) · ⑧(병합 자산 검증)이 **이 leaf 하나**로 판정한다 — 토글이 숨겨진 상태에서 남은 `true`가 계산에 새지 않게 한다.
 * 범위: **일반건물 · 주택 · 토지 · 상가 · 건물** · 시가 평가(산정방식이 쓰이는 모드). 의제취득일 전 상속·증여 · 이월과세 지분은 제외(각자 다른 취득 재료 규칙이 있다).
 *   주택 · 토지 · 상가 · 건물은 같은 결함을 측정해 넓혔다(계획서 §15 D-3 · Q-8 a). 재개발 · 입주권 · 분양권은 측정하지 않아 제외한다(입주권은 권리가액 규약이 따로다).
 *   겸용주택(주택 + `isMixedUseHouse`)의 축 B × 부담부증여는 ⑧ · 엔진 MB-6이 막는다(`transfer-tax-validate-mixed-use-bg.ts`).
 *   조합원입주권(원조합원 지분)은 **실지취득가액 한 칸만** 지분별로 받는다 — 산정방식은 자산 1을 따른다(계획서 §25 D-3g · Q-18 a).
 *   재개발 APT는 **산정방식(K-4 ↔ K-5) + 실지취득가액**을 지분별로 받는다 — 지분마다 취득이 따로라 산정방식도 다를 수 있다(시가 평가 · 담보 승 아님 ·
 *   계획서 remaining-4-measurements.plan.md §C · Q-47 a · 엔진은 이미 지분별 산정방식을 처리한다). 원조합원은 K-6 · K-7을 고를 수 없다(`bgPresumedBlock`). 입주권 원조합원은
 *   평가 모드와 무관하게 쓰인다(부담부증여 입주권은 K-4 전용 — `redev-pre-approval-acq-mode.ts`). 승계 입주권 지분은 ③ 승계취득 정보가 정본이라 제외한다.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";
import { bgCollateralForcesStdAcq } from "./burdened-gift-collateral-win";

/** 토글을 여는 자산 종류 — 측정한 종류만(§14 일반건물 · §15 주택 · 토지 · 상가 · 건물). */
const SHARE_OWN_ACQ_KINDS: ReadonlySet<string> = new Set(["general_building", "housing", "land", "commercial_building", "building"]);

/**
 * 축 B × 부담부증여 지분 카드 ③을 병합값(부담부증여)으로 판정하는 자산 종류(`bgShareCardJudgmentFields` · D-3c · vp2c §16).
 * 일반건물(D-3e · vp2c §19.3 · Q-12 a) — 저장값 「일반 양도」로 판정하면 취득시 기준시가 칸(`gbShowsAcqStdPrice`)이 숨어 ⑧이 그 값을 요구하는 채 막혔다.
 * 재개발 · 입주권은 측정상 ③ 판정이 막다른 길을 만들지 않아 넣지 않았다(§19.2 · §19.4).
 */
export const BG_SHARE_CARD_KINDS: ReadonlySet<string> = new Set(["housing", "land", "commercial_building", "building", "general_building"]);

/**
 * 축 B × 부담부증여 지분 카드의 양도시 기준시가를 자산 1 값으로 병합하는 자산 종류(`mergePrimaryBasic` · D-3d · vp2c §17).
 * 재개발 APT(D-3f · vp2c §19.4 · Q-13 a) — 지분 카드에 칸이 없어 기준시가 평가 · 환산(K-5)이 막다른 길이었다.
 * 일반건물은 `mergeGbPropertyLevel`이 물건 수준 값을 따로 병합한다. 입주권은 이 값을 쓰지 않는다(평가 3항).
 */
export const BG_SHARE_STD_TRANSFER_KINDS: ReadonlySet<string> = new Set(["housing", "land", "commercial_building", "building", "redevelopment_apt"]);

/** 지분 카드가 따로 받을 수 있는 칸 — 그 밖의 §159 하위필드는 물건 단위 값이라 계속 자산 1을 승계한다. */
export const BG_SHARE_OWN_ACQ_FIELDS = ["bgAcquisitionMethod", "bgActualAcquisitionLand", "bgActualAcquisitionBuilding", "bgActualAcquisitionTotal"] as const;

/** 재개발 APT · 조합원입주권 — 총액 칸 하나로 실지를 받는 종류(입주권은 산정방식이 K-4 고정이라 실지 한 칸 · 재개발은 산정방식 + 실지). */
const SHARE_OWN_ACTUAL_ONLY_KINDS: ReadonlySet<string> = new Set(["redevelopment_apt", "right_to_move_in"]);

/** 지분 카드가 따로 받는 칸 — 입주권은 실지취득가액 한 칸, 재개발은 산정방식 + 실지 총액, 그 밖은 산정방식 + 실지 세 칸. */
export function bgShareOwnAcquisitionFields(merged: AssetForm): readonly (typeof BG_SHARE_OWN_ACQ_FIELDS)[number][] {
  if (merged.assetKind === "right_to_move_in") return ["bgActualAcquisitionTotal"];
  if (merged.assetKind === "redevelopment_apt") return ["bgAcquisitionMethod", "bgActualAcquisitionTotal"];
  return BG_SHARE_OWN_ACQ_FIELDS;
}

/** 재개발 · 입주권 지분에서 지분 칸이 계산에 쓰이는가(§25.1 — 쓰이지 않는 칸은 토글을 열지 않는다). 재개발은 시가 · 담보 승 아님이면 산정방식이 쓰인다(Q-47 a). */
function actualOnlyKindUsesActual(merged: AssetForm): boolean {
  if (merged.assetKind === "right_to_move_in") return merged.isSuccessorRightToMoveIn !== true;
  return merged.bgValuationMode === "sangjeungbeop_market" && !bgCollateralForcesStdAcq(merged, true);
}

/** 토글을 보일 수 있는 지분인가 — `merged` = 자산 1 값을 병합한 지분 카드(평가 모드 · 자산 종류는 자산 1, 취득원인 · 취득일은 그 지분). */
export function bgShareOwnAcquisitionApplies(merged: AssetForm): boolean {
  if (merged.transferType === "burdened_gift" && SHARE_OWN_ACTUAL_ONLY_KINDS.has(merged.assetKind)) {
    return actualOnlyKindUsesActual(merged) && !isBgPreDeemedAsset(merged) && !bgAnyCarryover(merged);
  }
  return (
    merged.transferType === "burdened_gift" &&
    merged.bgValuationMode === "sangjeungbeop_market" &&
    SHARE_OWN_ACQ_KINDS.has(merged.assetKind) &&
    !isBgPreDeemedAsset(merged) &&
    // 일반건물은 파트별 — 두 파트 모두 의제취득일 전 상속·증여면 ①②③ 3자 max라 산정방식을 쓰지 않는다(한 파트면 다른 파트가 쓴다)
    !gbBgThreeWayParts(merged, true).all &&
    !bgAnyCarryover(merged)
  );
}

/**
 * 재개발 APT · 조합원입주권 부담부증여 — 양도인이 종전 부동산을 상속 · 증여로 취득했고 §159①1호 A가 「(종전 부동산) 실지취득가액」 칸 값인가.
 * 그 칸에 상속개시일 · 증여일 현재 상증법 평가액을 넣어야 한다(「소득세법 시행령」 §163⑨ 본문 — 계획서 vp2c §27 D-3l · Q-20 a).
 * 의제취득일 전(③ 3자 max)·이월과세 · 실지가 쓰이지 않는 칸(재개발 기준시가 · K-5 · 담보 승 · 승계 입주권)은 null.
 * ③ 취득정보의 평가액 칸(`publishedValueAtInheritance` · `fixedAcquisitionPrice`)은 이 경로에서 쓰이지 않는다(`buildInheritedAcquisitionPayload`).
 */
export function bgActualFieldSec163_9Cause(asset: AssetForm): "inheritance" | "gift" | null {
  if (asset.acquisitionCause !== "inheritance" && asset.acquisitionCause !== "gift") return null;
  if (!SHARE_OWN_ACTUAL_ONLY_KINDS.has(asset.assetKind) || !bgShareOwnAcquisitionApplies(asset)) return null;
  // 재개발은 실지(K-4)일 때만 그 칸이 §163⑨ 평가액이다 — 환산(K-5)은 §166③(Q-47 a)
  if (asset.assetKind === "redevelopment_apt" && asset.bgAcquisitionMethod !== "actual") return null;
  return asset.acquisitionCause;
}

/** 실지취득가액 칸 hint — 상속 · 증여 원인이면 그 칸에 넣을 값(§163⑨ 평가액). 그 밖은 undefined. */
export function sec163_9Hint(cause: "inheritance" | "gift" | null): string | undefined {
  if (!cause) return undefined;
  return cause === "gift"
    ? "증여로 취득했으면 증여일 현재 상증법 평가액(증여세 신고·결정가액)을 입력하세요 — 취득당시 실지거래가액으로 봅니다(소득세법 시행령 §163⑨)."
    : "상속으로 취득했으면 상속개시일 현재 상증법 평가액(상속세 신고·결정가액)을 입력하세요 — 취득당시 실지거래가액으로 봅니다(소득세법 시행령 §163⑨).";
}

/** 지분 카드가 자기 네 칸을 쓰는가 — 토글이 켜져 있고 위 범위 안일 때만. */
/**
 * 축 B 지분 카드가 자산 1과 다른 원인(상속 · 증여)으로 취득했는데 지분 토글이 꺼져 있으면 ⑧ 문구 — 아니면 null.
 * 토글을 끄면 ④가 자산 1의 산정방식 · 실지를 병합해 그 지분도 자산 1의 취득가액으로 계산한다(상속 지분이 매매 실지로 계산 · 실측 −12,000,000).
 * 상속 · 증여 지분의 A는 그 지분의 상속개시일 · 증여일 현재 평가액이다(소득세법 시행령 §159①1호 · §163⑨). 계획서 remaining-4-measurements.plan.md §A · Q-42 a.
 */
export function bgShareCauseMismatchMessage(share: AssetForm, merged: AssetForm, primary: AssetForm, label: string): string | null {
  const cause = share.acquisitionCause;
  if (cause !== "inheritance" && cause !== "gift") return null;
  if (cause === primary.acquisitionCause) return null;
  if (share.bgShareOwnAcquisition === true || !bgShareOwnAcquisitionApplies(merged)) return null;
  // 자산 1의 취득 금액을 그대로 쓰는 산정방식만 — 환산(K-5)은 그 지분의 취득시 기준시가로, 담보 승은 취득시 기준시가 × 채무비율로 계산해
  //   자산 1의 실지 · 추계 금액을 읽지 않는다(`transfer.route.gb-bg-carryover-bundled-block` 지분 분할 K-5 시료).
  if (merged.bgAcquisitionMethod === "converted" || bgCollateralForcesStdAcq(merged, true)) return null;
  const causeLabel = cause === "inheritance" ? "상속" : "증여";
  const dateLabel = cause === "inheritance" ? "상속개시일" : "증여일";
  return `${label}: 이 지분은 ${causeLabel}으로 취득해 자산 1과 취득가액이 다릅니다 — 「이 지분의 취득가액을 자산 1과 따로 입력」을 켜고 이 지분의 ${dateLabel} 현재 평가액을 실지취득가액 칸에 입력하세요(소득세법 시행령 §159①1호 · §163⑨).`;
}

export function bgShareOwnAcquisitionActive(share: AssetForm, merged: AssetForm): boolean {
  return share.bgShareOwnAcquisition === true && bgShareOwnAcquisitionApplies(merged);
}
