/**
 * NBL2611-V8-VL02 — 기간 행 공통 검증 (별장 사용기간 · 농지 자경 · 목장 축산 · 거주 이력 · 유예 행).
 *
 * 엔진은 [시작, 종료) 반열린 구간을 쓰고 `mergeOverlappingPeriods`는 `end > start`가 아닌 행을 **조용히 버린다**.
 * 그래서 역순·같은 날·빈·해석 불가 행은 판정에서 사라지고, 별장에서는 그 결과가 «비사용기간 증가 → 주택부수토지
 * 재분류 → 사업용»(−55,750,000)으로 이어진다. ⑧(`transfer-tax-validate-nbl.ts`)과 ⑫(`transfer-tax-schema-nbl-refines.ts`)가
 * **같은 판정·같은 문구**를 쓰도록 한 곳에 둔다(3중 패턴 — 한쪽만 막으면 UI 통과 ↔ API 400 모순이 생긴다).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";

export type PeriodRowIssueKind = "empty_start" | "empty_end" | "invalid" | "reversed" | "same_day";

/** 시작·종료 문자열 한 쌍의 결함. 이상 없으면 null. 날짜는 `YYYY-MM-DD`(ISO)를 전제한다. */
export function periodRowIssue(startDate: string | undefined, endDate: string | undefined): PeriodRowIssueKind | null {
  if (!startDate) return "empty_start";
  if (!endDate) return "empty_end";
  const s = toOptionalDate(startDate);
  const e = toOptionalDate(endDate);
  if (!s || !e) return "invalid";
  if (e.getTime() < s.getTime()) return "reversed";
  if (e.getTime() === s.getTime()) return "same_day";
  return null;
}

/** 결함이 있는 칸 — 빈 시작일만 시작일 칸, 나머지는 종료일 칸으로 보낸다. */
export function periodRowIssueField(kind: PeriodRowIssueKind): "startDate" | "endDate" {
  return kind === "empty_start" ? "startDate" : "endDate";
}

/**
 * 오류 문구(라벨 접두 제외). `what`은 행 종류 이름(예: 「별장 사용기간」), `index`는 0부터.
 * 빈 행 문구는 종전 ⑧ 문구를 그대로 유지한다(기존 단언·E2E 메시지 케이스).
 */
export function periodRowIssueMessage(
  what: string,
  index: number,
  kind: PeriodRowIssueKind,
  startDate?: string,
  endDate?: string,
): string {
  const row = `${what} ${index + 1}번째 행`;
  switch (kind) {
    case "empty_start":
      return `${row} — 시작일을 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
    case "empty_end":
      return `${row} — 종료일을 입력하세요. (미입력 행은 판정에서 제외되어 결과가 달라집니다)`;
    case "invalid":
      return `${row} — 시작일(${startDate})·종료일(${endDate})을 날짜(YYYY-MM-DD)로 읽을 수 없습니다. (읽을 수 없는 행은 판정에서 제외되어 결과가 달라집니다)`;
    case "reversed":
      return `${row} — 종료일(${endDate})이 시작일(${startDate})보다 빠릅니다. (역순 행은 판정에서 제외되어 결과가 달라집니다)`;
    case "same_day":
      return `${row} — 시작일과 종료일이 같습니다(${startDate}). 구간은 [시작일, 종료일)이라 0일로 계산되어 판정에서 제외됩니다. 종료일을 사용한 마지막 날의 다음 날로 입력하세요.`;
  }
}
