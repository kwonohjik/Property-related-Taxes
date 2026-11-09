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
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { bgAnyCarryover } from "./bg-carryover-parts";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";

/** 토글을 여는 자산 종류 — 측정한 종류만(§14 일반건물 · §15 주택 · 토지 · 상가 · 건물). */
const SHARE_OWN_ACQ_KINDS: ReadonlySet<string> = new Set(["general_building", "housing", "land", "commercial_building", "building"]);

/** 지분 카드가 따로 받을 수 있는 칸 — 그 밖의 §159 하위필드는 물건 단위 값이라 계속 자산 1을 승계한다. */
export const BG_SHARE_OWN_ACQ_FIELDS = ["bgAcquisitionMethod", "bgActualAcquisitionLand", "bgActualAcquisitionBuilding", "bgActualAcquisitionTotal"] as const;

/** 토글을 보일 수 있는 지분인가 — `merged` = 자산 1 값을 병합한 지분 카드(평가 모드 · 자산 종류는 자산 1, 취득원인 · 취득일은 그 지분). */
export function bgShareOwnAcquisitionApplies(merged: AssetForm): boolean {
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

/** 지분 카드가 자기 네 칸을 쓰는가 — 토글이 켜져 있고 위 범위 안일 때만. */
export function bgShareOwnAcquisitionActive(share: AssetForm, merged: AssetForm): boolean {
  return share.bgShareOwnAcquisition === true && bgShareOwnAcquisitionApplies(merged);
}
