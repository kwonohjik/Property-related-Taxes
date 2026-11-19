/**
 * NBL2611-V8-VL02 — 유예기간 행(영 §168의14①·규칙 §83의5①) 검증 helper — ⑧·⑫ 공용.
 *
 * 사유별 필수 입력(`GRACE_REASON_SPECS.lengthKind`)과 날짜 역순·같은 날을 한 곳에서 판정한다. 비거나 역순이면
 * `resolveGraceIntervals`가 그 행을 빈 배열·0일 구간으로 만들어 **조용히 가산이 사라진다**. 기존 ⑧ 문구는 그대로 유지한다.
 */
import { GRACE_REASON_SPECS } from "./grace-reason-period";
import { periodRowIssue, periodRowIssueMessage } from "./period-row-issue";

export interface GraceRowLike {
  reasonCode: string;
  anchorDate?: string;
  endDate?: string;
  secondaryDate?: string;
}

/** 결함 칸(`nblGracePeriods.{i}.{part}`의 part)과 문구(라벨 접두 제외). 이상 없거나 알 수 없는 사유면 null. */
export function graceRowIssue(
  g: GraceRowLike,
  index: number,
): { part: "anchorDate" | "endDate" | "secondaryDate"; message: string } | null {
  const spec = GRACE_REASON_SPECS[g.reasonCode as keyof typeof GRACE_REASON_SPECS];
  if (!spec) return null;
  if (spec.lengthKind === "compound_5") {
    if (!g.secondaryDate) return { part: "secondaryDate", message: "건설 착공(5호) 유예기간 — 착공일을 입력하세요." };
    // 건설진행 종료일은 선택이지만 입력했다면 착공일보다 뒤여야 한다
    if (g.endDate) {
      const kind = periodRowIssue(g.secondaryDate, g.endDate);
      if (kind === "reversed" || kind === "same_day" || kind === "invalid")
        return { part: "endDate", message: periodRowIssueMessage(`${spec.label} 유예기간(착공일~건설진행 종료일)`, index, kind, g.secondaryDate, g.endDate) };
    }
    return null;
  }
  if (spec.lengthKind === "fixed_from_anchor") {
    if (!spec.anchorFromAcquisition && !g.anchorDate) return { part: "anchorDate", message: `${spec.label} 유예기간 — 기산일을 입력하세요.` };
    return null;
  }
  // event_window · anchor_to_input_end
  if (!g.anchorDate) return { part: "anchorDate", message: `${spec.label} 유예기간 — 개시일을 입력하세요.` };
  if (!g.endDate) return { part: "endDate", message: `${spec.label} 유예기간 — 종료일을 입력하세요.` };
  const kind = periodRowIssue(g.anchorDate, g.endDate);
  if (kind) return { part: "endDate", message: periodRowIssueMessage(`${spec.label} 유예기간`, index, kind, g.anchorDate, g.endDate) };
  return null;
}
