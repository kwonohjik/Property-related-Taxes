/**
 * 조문 본문(fullText) → 표시 세그먼트 파서.
 *
 * 법제처 조문 본문은 세율표 등을 박스 드로잉 문자(┌─┬┐ │ ├─┼┤ └─┴┘)로 표현한다.
 * 비례 글꼴에서는 이 박스 표가 정렬이 깨져 망가져 보이므로, 박스 표 블록을 감지해
 * 구조화 테이블(headers/rows)로 파싱하고 나머지는 텍스트로 분리한다.
 * UI는 텍스트는 `<pre>`, 테이블은 HTML `<table>`로 렌더하여 정렬을 보장한다.
 *
 * 엔진/API의 fullText 자체는 변경하지 않음(LLM·검증 등 다른 소비자 호환) — 표시 전용.
 */

export type ArticleSegment =
  | { type: "text"; content: string }
  | { type: "table"; headers: string[]; rows: string[][] };

/** 박스 표를 구성하는 문자(수직선·모서리·교차) — 이 중 하나라도 있으면 표 라인 */
const BOX_LINE_RE = /[┌┐└┘├┤┬┴┼│]/;
/** 가로 테두리 라인(─ 와 모서리·교차만, 셀 내용 없음) → 논리 행 구분 */
const BORDER_LINE_RE = /^[\s┌┐└┘├┤┬┴┼─]+$/;
/** 가로 테두리 **시퀀스**가 줄 안에 묻혀 있는가 (개행 없는 응답 판별용 — `g` 플래그 금지) */
const BORDER_IN_LINE_RE = /[┌├└][─┬┼┴]*[┐┤┘]/;
/** 같은 시퀀스를 **캡처**해 split — 테두리 자체를 조각으로 남긴다 */
const BORDER_SPLIT_RE = /([┌├└][─┬┼┴]*[┐┤┘])/;
/** 위 시퀀스가 줄 전체인지 */
const BORDER_ONLY_RE = /^[┌├└][─┬┼┴]*[┐┤┘]$/;

/**
 * 박스 표에 **줄바꿈이 없는** 응답을 줄 단위로 복원한다.
 *
 * 🔴 법제처 Open API는 조문 본문의 박스 표를 **개행 없이 한 줄로** 내려준다
 *   (2026-08-03 실측 — 소득세법 §55 실시간 응답 개행 **5개** vs 2026-06 캐시본 **27개**.
 *    `…2022.12.31>┌───┬───┐│종합소득  │세  율`처럼 본문·테두리·데이터가 통째로 붙는다).
 *   `parseArticleBody`는 줄 단위로 표를 감지하므로 그대로 두면 표 전체가 텍스트로 폴백되어
 *   화면에 박스 문자가 raw로 노출된다. `.legal-cache/`가 있는 개발 환경에서는 과거 포맷의
 *   캐시본을 읽어 통과하므로 **캐시가 없는 환경(신규 배포·새 사용자·CI)에서만 발현**했다.
 *
 * 복원 규칙 두 가지:
 *   1. 가로 테두리 시퀀스를 **독립 줄**로 떼어낸다(앞뒤 본문과도 분리된다).
 *   2. 테두리의 `┬`·`┼`·`┴` 개수로 **열 수**를 알아내 데이터 구간을 그만큼씩 끊어 행으로 나눈다
 *      — 한 논리 행이 여러 줄인 표(빈 셀이 공백으로 패딩된 경우)도 그대로 보존된다.
 *
 * 이미 개행이 있는 본문(캐시본·과거 포맷)에 적용해도 **결과가 같다** — 테두리는 이미 독립 줄이고
 * 데이터 줄은 이미 열 수만큼의 셀을 담고 있어 재분할이 항등이다.
 */
export function restoreBoxTableLines(fullText: string): string {
  const text = fullText ?? "";
  if (!text.includes("┌")) return text;

  const out: string[] = [];
  /** 직전 테두리에서 읽은 열 수 — 데이터 구간을 몇 셀씩 끊을지 정한다. */
  let cols = 0;

  const pushSegment = (seg: string) => {
    const t = seg.trim();
    if (BORDER_ONLY_RE.test(t)) {
      cols = (t.match(/[┬┼┴]/g)?.length ?? 0) + 1;
      out.push(seg);
      return;
    }
    if (cols > 0 && seg.includes("│")) {
      out.push(...splitPackedRows(seg, cols));
      return;
    }
    out.push(seg);
  };

  // **줄 단위로 처리한다** — 이미 개행이 있는 본문(캐시본·과거 포맷)의 줄은 그대로 통과시켜
  // 항등성을 보장한다. 줄 안에 테두리가 묻혀 있을 때만 그 경계로 쪼갠다.
  for (const line of text.split("\n")) {
    if (!BORDER_IN_LINE_RE.test(line) || BORDER_ONLY_RE.test(line.trim())) {
      pushSegment(line);
      continue;
    }
    for (const part of line.split(BORDER_SPLIT_RE)) {
      if (part !== "") pushSegment(part);
    }
  }
  return out.join("\n");
}

/**
 * `│A│B││C│D│` → `["│A│B│", "│C│D│"]` (cols=2).
 *
 * 정규식 매치는 겹치지 않으므로 **이어 붙이면 원본이 그대로 복원**되어야 한다.
 * 복원되지 않으면(셀 수 불일치 등) 분할을 포기하고 **원본 그대로** 돌려준다 —
 * 조용히 뭉개느니 표로 인식되지 않는 편이 낫다.
 */
function splitPackedRows(line: string, cols: number): string[] {
  const trimmed = line.trim();
  const rows = trimmed.match(new RegExp(`(?:│[^│]*){${cols}}│`, "g"));
  if (!rows || rows.length === 0 || rows.join("") !== trimmed) return [line];
  // 한 행뿐이면 원본을 그대로 둔다(앞뒤 공백 보존 — 항등성).
  return rows.length === 1 ? [line] : rows;
}

/**
 * fullText를 텍스트/테이블 세그먼트 배열로 분리.
 */
export function parseArticleBody(fullText: string): ArticleSegment[] {
  const lines = restoreBoxTableLines(fullText).split("\n");
  const segments: ArticleSegment[] = [];
  let textBuf: string[] = [];
  let tableBuf: string[] = [];

  const flushText = () => {
    const content = textBuf.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    if (content) segments.push({ type: "text", content });
    textBuf = [];
  };
  const flushTable = () => {
    const table = parseBoxTable(tableBuf);
    if (table) segments.push(table);
    else textBuf.push(...tableBuf); // 파싱 실패 → 텍스트 폴백(원본 보존)
    tableBuf = [];
  };

  for (const line of lines) {
    if (BOX_LINE_RE.test(line)) {
      if (textBuf.length) flushText();
      tableBuf.push(line);
    } else {
      if (tableBuf.length) flushTable();
      textBuf.push(line);
    }
  }
  if (tableBuf.length) flushTable();
  if (textBuf.length) flushText();
  return segments;
}

/**
 * 박스 표 블록 → { headers, rows }. 첫 논리 행을 헤더로 간주.
 * 파싱 불가(논리 행 < 2)면 null → 호출부가 텍스트 폴백.
 */
function parseBoxTable(blockLines: string[]): { type: "table"; headers: string[]; rows: string[][] } | null {
  const logicalRows: string[][] = [];
  let current: string[] | null = null;

  for (const line of blockLines) {
    if (BORDER_LINE_RE.test(line)) {
      if (current) {
        logicalRows.push(current);
        current = null;
      }
      continue;
    }
    const cells = splitCells(line);
    if (cells.length === 0) continue;
    if (!current) {
      current = cells.slice();
    } else {
      // 같은 논리 행의 추가 라인 → 셀별로 이어붙임(여러 줄 셀).
      const n = Math.max(current.length, cells.length);
      for (let i = 0; i < n; i++) {
        current[i] = `${current[i] ?? ""} ${cells[i] ?? ""}`.trim();
      }
    }
  }
  if (current) logicalRows.push(current);
  if (logicalRows.length < 2) return null;

  // 열 수 정규화 + 전 행 빈 후행 열 제거
  let maxCols = Math.max(...logicalRows.map((r) => r.length));
  const norm = logicalRows.map((r) => {
    const c = r.map(cleanCell);
    while (c.length < maxCols) c.push("");
    return c;
  });
  while (maxCols > 1 && norm.every((r) => r[maxCols - 1] === "")) {
    norm.forEach((r) => r.pop());
    maxCols--;
  }

  return { type: "table", headers: norm[0], rows: norm.slice(1) };
}

/** "│a│b│" → ["a","b"] (양끝 외곽 테두리 제거) */
function splitCells(line: string): string[] {
  const parts = line.split("│");
  if (parts.length && parts[0].trim() === "") parts.shift();
  if (parts.length && parts[parts.length - 1].trim() === "") parts.pop();
  return parts;
}

/** 셀 정리 — 연속 공백 단일화 + 트림 */
function cleanCell(s: string): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
