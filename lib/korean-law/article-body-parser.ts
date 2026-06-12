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

/**
 * fullText를 텍스트/테이블 세그먼트 배열로 분리.
 */
export function parseArticleBody(fullText: string): ArticleSegment[] {
  const lines = (fullText ?? "").split("\n");
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
