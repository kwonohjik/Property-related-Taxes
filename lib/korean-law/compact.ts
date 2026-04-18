/**
 * 판례·결정례 응답 축약 유틸
 *
 * korean-law-mcp (chrisryugj/korean-law-mcp)의 decision-compact.ts에서 이식.
 *
 * 제공:
 *  - compactBody: 전문 본문 계단식 축약(앞 800 + 중략 + 뒤 400)
 *  - densifyLawRefs: 참조조문 괄호 제거
 *  - densifyPrecedentRefs: 참조판례 "선고/판결" 생략
 *  - stripRepeatedSummary: 본문에 반복된 판시사항/판결요지 제거
 */

export interface CompactOptions {
  /** true 시 축약 비활성 → 원본 반환 */
  full?: boolean;
  headSize?: number;
  tailSize?: number;
  minSave?: number;
}

/**
 * 본문 계단식 축약: 앞 800자 + 중략 마커 + 뒤 400자.
 * 문장 경계(마침표·종결어미·빈 줄)에서만 절단.
 */
export function compactBody(text: string, opts: CompactOptions = {}): string {
  if (opts.full || !text) return text;
  const HEAD = opts.headSize ?? 800;
  const TAIL = opts.tailSize ?? 400;
  const MIN_SAVE = opts.minSave ?? 500;
  if (text.length <= HEAD + TAIL + MIN_SAVE) return text;

  const headRaw = text.slice(0, HEAD);
  const headCandidates = [
    headRaw.lastIndexOf("다.\n"),
    headRaw.lastIndexOf("라.\n"),
    headRaw.lastIndexOf("다. "),
    headRaw.lastIndexOf("라. "),
    headRaw.lastIndexOf(".\n\n"),
    headRaw.lastIndexOf("\n\n"),
    headRaw.lastIndexOf(". "),
  ];
  const headCutCandidate = Math.max(...headCandidates);
  const headCut = headCutCandidate > HEAD * 0.5 ? headCutCandidate + 2 : HEAD;
  const head = text.slice(0, headCut).trimEnd();

  const tailStart = text.length - TAIL;
  const tailRaw = text.slice(tailStart);
  const tailIdx = [
    tailRaw.indexOf("\n\n"),
    tailRaw.indexOf("다.\n"),
    tailRaw.indexOf("라.\n"),
    tailRaw.indexOf("다. "),
    tailRaw.indexOf("라. "),
    tailRaw.indexOf("한다. "),
  ]
    .filter((i) => i >= 0)
    .sort((a, b) => a - b)[0];
  const tailFrom =
    tailIdx !== undefined && tailIdx < TAIL * 0.5 ? tailStart + tailIdx + 2 : tailStart;
  const tail = text.slice(tailFrom).trimStart();

  const omitted = text.length - head.length - tail.length;
  if (omitted < MIN_SAVE) return text;
  return `${head}\n\n⋯ 중략 ${omitted.toLocaleString()}자 (전문 보기 활성화 시 전체) ⋯\n\n${tail}`;
}

/**
 * 참조조문 densify: "제390조(채무불이행과 손해배상)" → "제390조".
 * 법령명 자체는 건드리지 않음 — 후속 조문 조회 시 파싱 필요.
 */
export function densifyLawRefs(text: string): string {
  if (!text) return text;
  const original = text;
  let compact = text.replace(
    /(제\d+조(?:의\d+)?|제\d+항|제\d+호)\s*\([^)]{3,40}\)/g,
    "$1"
  );
  compact = compact
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (compact.length >= original.length * 0.95) return original;
  return compact;
}

/**
 * 참조판례 densify:
 *   "대법원 2020. 3. 26. 선고 2018두56077 판결" → "대법원 2020.3.26. 2018두56077"
 */
export function densifyPrecedentRefs(text: string): string {
  if (!text) return text;
  const original = text;
  const compact = text
    .replace(/\s*선고\s*/g, " ")
    .replace(/\s*판결(?=[\s,/;]|$)/g, "")
    .replace(/(^|[\s,(\[;/])(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\./g, "$1$2.$3.$4.")
    .replace(/\s*\[[^\]]{2,15}\]\s*/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .trim();
  if (compact.length >= original.length * 0.95) return original;
  return compact;
}

/**
 * 전문에 중복 등장한 판시사항/판결요지 제거.
 * 요약의 앞 80자로 시작점 찾고, 끝 60자로 종료점 검증. 실패 시 보수적으로 요약 길이만큼 제거.
 */
export function stripRepeatedSummary(
  body: string,
  summaries: Array<string | undefined>
): string {
  if (!body) return body;
  let result = body;
  for (const s of summaries) {
    if (!s || s.length < 20) continue;
    const trimmed = s.trim();
    const headLen = Math.min(80, trimmed.length);
    const head = trimmed.slice(0, headLen);
    if (head.length < 20) continue;
    const zone = result.slice(0, Math.floor(result.length * 0.25));
    const idx = zone.indexOf(head);
    if (idx < 0) continue;
    const tailLen = Math.min(60, trimmed.length - headLen);
    let end: number;
    if (tailLen >= 20) {
      const tail = trimmed.slice(trimmed.length - tailLen);
      const searchZone = result.slice(
        idx,
        Math.min(idx + Math.floor(trimmed.length * 1.3), result.length)
      );
      const tailIdx = searchZone.indexOf(tail);
      end =
        tailIdx >= 0
          ? idx + tailIdx + tail.length
          : Math.min(idx + trimmed.length, result.length);
    } else {
      end = Math.min(idx + trimmed.length, result.length);
    }
    result = result.slice(0, idx) + result.slice(end);
  }
  return result;
}

/**
 * 전각 공백 등 제거, HTML 엔티티 디코딩 (&amp; 순서 주의 — 마지막).
 */
export function cleanHtml(text: string): string {
  if (!text) return text;
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// compactLongSections — 결정례 본문의 특정 섹션만 선택 축약
// ────────────────────────────────────────────────────────────────────────────

/**
 * 결정문/판례 본문에 자주 등장하는 섹션 헤더.
 * 가장 뒤에 나타나는 헤더의 본문(= 보통 가장 긴 "이유" / "결정이유" 등)만 compactBody로 축약한다.
 * 판시사항·판결요지 같은 짧은 앞부분은 원문 유지.
 */
const SECTION_HEADERS = [
  "이유",
  "전문",
  "결정내용",
  "본문",
  "회답",
  "재결이유",
  "판결이유",
  "판례내용",
  "심판요지",
  "의결내용",
  "결정이유",
  "조문내용",
];

/**
 * 자체 compact 처리되는 도메인 — 이중 축약 방지.
 *
 * 현재 `client.ts:getDecisionText` 에서 이미 compactBody 를 reasoning 필드에 직접 적용하므로,
 * ALREADY_COMPACTED 도메인의 post-processing은 skip 해야 한다.
 * post-processing 용도로 이 set를 활용하는 호출부에서만 체크.
 */
export const ALREADY_COMPACTED = new Set<string>([
  "prec",
  "detc",
  "expc",
  "admrul",
]);

/**
 * 본문에서 SECTION_HEADERS 중 **가장 마지막** 매칭의 body에만 compactBody를 적용.
 *
 * upstream: src/lib/decision-compact.ts:compactLongSections
 *
 * 동작:
 *   1) 각 헤더의 마지막 등장 위치 탐색
 *   2) 그 중 가장 뒤의 헤더를 선택 (가장 긴 섹션이 보통 맨 끝)
 *   3) 해당 헤더 이후부터 본문 끝까지를 compactBody 적용
 *   4) 전체 길이가 HEAD+TAIL+MIN_SAVE 미만이면 원문 반환
 */
export function compactLongSections(
  text: string,
  options: CompactOptions = {}
): string {
  if (options.full || !text) return text;
  const HEAD = options.headSize ?? 800;
  const TAIL = options.tailSize ?? 400;
  const MIN_SAVE = options.minSave ?? 500;
  if (text.length <= HEAD + TAIL + MIN_SAVE) return text;

  let lastHeaderEnd = -1;
  for (const header of SECTION_HEADERS) {
    // 헤더 매칭: 줄 시작 + 헤더 + (구분자: :\n\s)
    const re = new RegExp(`(?:^|\\n)(${header})\\s*[:：]?\\s*(?:\\n|$)`, "g");
    let m: RegExpExecArray | null;
    let last = -1;
    while ((m = re.exec(text)) !== null) {
      last = m.index + m[0].length;
    }
    if (last > lastHeaderEnd) lastHeaderEnd = last;
  }

  if (lastHeaderEnd < 0 || lastHeaderEnd >= text.length - MIN_SAVE) {
    // 헤더를 못 찾았거나, 헤더 이후 본문이 너무 짧으면 그냥 compactBody 전체 적용
    return compactBody(text, options);
  }

  const before = text.slice(0, lastHeaderEnd);
  const body = text.slice(lastHeaderEnd);
  if (body.length <= HEAD + TAIL + MIN_SAVE) return text;

  return before + compactBody(body, options);
}
