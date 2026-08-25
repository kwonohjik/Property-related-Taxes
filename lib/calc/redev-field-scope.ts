/**
 * 재개발(§166) 자산-수준 필드의 **적용 범위 술어** — ⑤ UI · ⑬ payload · 마이그레이션 공용 단일 소스.
 *
 * ## 왜 뽑았나 (2026-08-25 · U1-01 · U1-02)
 *
 * 재개발 카드들은 축(청산금 방향·조합원 구분)에 따라 입력칸을 열고 닫는데, ④ 변환은 그 축을 보지
 * 않고 저장값을 그대로 실었다. 사용자가 축을 되돌리면 **화면에서 사라진 값이 payload에는 남고**,
 * 되돌린 축에는 그 값을 지울 위젯이 아예 없다 — ⑧ validate로 막으면 「채울 칸 없는 영구 차단」이
 * 되므로(memory `feedback_ui_gate_removes_sole_input_path`) 정답은 **범위 밖이면 안 보내는 것**이다.
 *
 * 술어를 한 곳에 두고 세 지점이 공유한다. 한쪽만 고치면 「새로고침해야 정상화되는」 상태가 된다
 * (`AssetAreaRedevelopment.tsx:59-63`이 같은 이유를 이미 적어 두었다).
 */

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * 양도 대상(§166 축) 판정 — `buildRedevelopmentPayload`·⑤ UI와 **같은 기본값**.
 *
 * `assetKind="right_to_move_in"` + `redevSubject` 미입력이면 `"right"`로 본다
 * (미입력을 `"apt"`로 읽으면 완공APT 전용 산식이 입주권에 걸린다).
 */
export function resolveRedevSubject(
  asset: Pick<AssetForm, "assetKind" | "redevSubject">,
): "right" | "apt" {
  return (asset.redevSubject || (asset.assetKind === "right_to_move_in" ? "right" : "apt")) as
    | "right"
    | "apt";
}

/**
 * ③-c 「인가일 기준 비과세 보유요건」 자기선언(`redevExemptionEligibleAtApproval`)이
 * 의미를 갖는 축인가 (U1-01).
 *
 * · **입주권**(`right`) — `RedevelopmentRightExemptionSection`의 §⑥ 토글이 `assetKind ===
 *   "right_to_move_in"`에서 **항상** 렌더된다. 정당한 입력 경로가 있으므로 축을 제한하지 않는다.
 *   (§89①4호 비과세 선언이 여기 실린다 — 제한하면 그 경로가 통째로 사라진다.)
 * · **완공APT**(`apt`) — ③-c `ExemptionAtApprovalCard`의 렌더 게이트와 같아야 한다
 *   (`RedevelopmentBlock.tsx:210` — 승계조합원 아님 + 청산금 **수령**).
 *   `isOneHouseSingle`은 폼-전역이라 자산-수준 술어에 넣지 않는다(엔진이 같은 값을 본다).
 *
 * 엔진은 `=== false`일 때 `isOneHouseSingle`을 강제 false로 내려 장기보유특별공제를
 * 표2(최대 80%)에서 **표1(최대 30%)로 강등**한다 — 「소득세법」 §95② 별표2.
 */
export function exemptionAtApprovalInScope(
  asset: Pick<
    AssetForm,
    "assetKind" | "redevSubject" | "redevSettlementDirection" | "redevIsSuccessorMember"
  >,
): boolean {
  if (resolveRedevSubject(asset) === "right") return true;
  return (
    asset.redevSettlementDirection === "receive" && asset.redevIsSuccessorMember !== "yes"
  );
}

/**
 * 승계조합원 전용 「인가후 필요경비」(`redevPostApprovalExpenses`)가 의미를 갖는 축인가 (U1-02).
 *
 * 입력칸은 `asset.redevIsSuccessorMember === "yes"` 게이트 안에만 있다
 * (`RedevelopmentBlock.tsx:335`). 원조합원으로 되돌리면 칸이 사라지지만 값은 남고,
 * 엔진은 「소득세법 시행령」 §166①1호 인가후 양도차익에서 그 값을 차감한다.
 *
 * ⚠️ 자본적지출·양도비는 **일반 입력 경로가 따로 있으므로** 이 술어의 대상이 아니다.
 */
export function postApprovalExpensesInScope(
  asset: Pick<AssetForm, "redevIsSuccessorMember">,
): boolean {
  return asset.redevIsSuccessorMember === "yes";
}
