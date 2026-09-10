/**
 * 신축·증축 특례(§114조의2 가산세 · 환산취득가 기산) 입력 축의 **적용 범위** 단일 소스.
 *
 * ## 왜 필요한가 — ⑤만 자산 종류를 보고 ⑧·④는 보지 않았다
 *
 * 「신축·증축」 토글(`SelfBuiltSection`)의 **유일한 쓰기 지점**은
 * `CompanionAcqPurchaseBlock.tsx:757`인데, 그 렌더 게이트는 두 조건을 함께 건다:
 *
 *   `assetKind === "housing" || assetKind === "building"` (블록 자체는 `acquisitionCause === "purchase"`)
 *
 * 반면 ⑧(`transfer-tax-validate-acquisition.ts`)은 **취득원인만** 보고 자산 종류를 보지 않았고,
 * ④(`transfer-tax-api.ts` · `multi-transfer-tax-api.ts`)는 **둘 다** 보지 않았다.
 *
 * 실측(2026-09-07) — 주택에서 토지로 종류를 바꾸면 `isSelfBuilt`가 그대로 남는다
 * (`housingFlagResetPatchForAssetKind`가 이 플래그를 비우지 않았다):
 *
 * | 계층 | 결과 |
 * |---|---|
 * | ⑧ | 「신축·증축 구분을 선택하세요」 — 그 입력칸은 housing·building 전용이라 **화면에 없다** ⇒ 계산 영구 차단 |
 * | ④ | 구분·완공일이 이미 차 있으면 ⑧을 통과해 **토지 자산에 `isSelfBuilt: true`가 전송**된다 ⇒ §114조의2 가산세 오발동 |
 *
 * ⇒ 술어를 leaf로 뽑아 ⑤·⑧·④가 **같은 것**을 쓴다
 * (memory `feedback_shared_predicate_argument_parity` · `feedback_ui_gate_removes_sole_input_path`).
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

/** ⑤ `SelfBuiltSection` 렌더 게이트의 자산 종류 조건과 같은 것. */
export function selfBuiltSectionApplicable(kind: AssetForm["assetKind"] | undefined): boolean {
  return kind === "housing" || kind === "building";
}

/**
 * 이 자산에서 신축·증축 축이 **실제로 살아 있는가**. ⑧의 요구 조건과 ④의 전송 조건이 이것 하나다.
 * 겸용주택 제외는 ④ 단건에만 있던 별도 축이라 호출부에 남긴다(여기서는 종류·원인·플래그만 본다).
 */
export function selfBuiltActive(
  asset: Pick<AssetForm, "assetKind" | "isSelfBuilt" | "acquisitionCause"> | undefined,
): boolean {
  if (!asset) return false;
  return (
    selfBuiltSectionApplicable(asset.assetKind) &&
    asset.isSelfBuilt === true &&
    asset.acquisitionCause === "purchase"
  );
}
