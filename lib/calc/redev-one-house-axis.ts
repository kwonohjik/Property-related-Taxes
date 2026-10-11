/**
 * 재개발 완공APT 카드의 **「1주택 후보」 노출 게이트** — ⑤ 공용 (G3-2).
 *
 * ## 왜 원시 주택 수 `=== "1"`이 아닌가
 *
 * ③-c 카드(청산금분 양도일 1세대1주택 선언 · 종전주택 보유 요건 선언)와 거주월수 분리 입력은 「1주택」일 때만
 * 열렸다. 그런데 엔진의 표2·§154① 축 「1주택」은 **§155 의제를 포함한다**(`resolveRedevAptOneHouseTable2Axis` —
 * 「소득세법 시행령」 §159의4 괄호 「제155조 … 및 그 밖의 규정에 따라 1세대 1주택으로 보는 주택을 포함한다」).
 * 의제 세대(§155①②④⑤⑦⑧ — 세대 주택 수 2)는 원시 스칼라가 「2」라 카드가 닫혀, 정답에 이를 입력 경로가 없었다
 * (같은 날 동시신고·단독신고에서 막다른 길 — memory `feedback_ui_gate_removes_sole_input_path`).
 *
 * ## 이 함수는 「가능성」만 본다 — 판정은 엔진이 한다
 *
 * 의제 성립 여부(타이밍·§154① 요건·§89②)는 엔진 판정(`checkExemption`)이라 ⑤가 재구현하지 않는다(UI↔엔진
 * 이중 진실 금지). 대신 **엔진 축이 참일 수 있는 세대**를 연다 — 의제 규정은 세대 주택 수 2에서 성립하므로
 * (⑥⑦⑧ `=== 2` · ① 일시적 2주택 · ④⑤ 합가) 「1주택 또는 2주택 세대」다. 의제가 서지 않는 2주택 세대는 카드를 보고
 * 「아님」을 고르거나 비워 두면 되고, 엔진이 표1·청산금분 과세로 판정한다.
 *
 * ⚠️ 주택 수 제외(§99의4·§98의9·감면주택)로 3채 이상이 1주택이 되는 세대는 여전히 열리지 않는다(종전 동작 —
 *    엔진은 제외 후 주택 수로 표2를 정한다). 그 입력 경로는 이 PR의 범위 밖이다.
 */
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

export function redevOneHouseAxisCandidate(
  form: Pick<TransferFormData, "isOneHousehold" | "householdHousingCount">,
): boolean {
  if (form.isOneHousehold !== true) return false;
  const n = parseInt(form.householdHousingCount, 10);
  return n === 1 || n === 2;
}
