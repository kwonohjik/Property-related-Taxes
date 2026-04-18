/**
 * 법제처 Open API 조문·항·호·목 파서
 *
 * chrisryugj/korean-law-mcp src/lib/article-parser.ts 의 핵심 로직을 이식:
 *  - parseHangNumber: ①②③…⑳ 원숫자를 1~20 숫자로 매핑 (법제처 API가 항번호를
 *    원숫자 문자로 반환하는 경우가 많아 일반 parseInt는 NaN)
 *  - flattenContent: 조문내용 필드의 중첩 배열/문자열 구조를 재귀 평탄화
 *  - formatArticleUnit: 조문 헤더 정규식으로 중복 제목 라인 제거
 *  - cleanHtml: HTML 엔티티 디코딩 (순서 중요 — &amp; 를 마지막)
 *
 * 기존 `lib/legal-verification/korean-law-client.ts`의 extractUnitText는 건드리지
 * 않고, verify-citations 등 신규 모듈에서만 이 파서를 사용한다.
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. 원숫자(①②③…) → 숫자 매핑
// ────────────────────────────────────────────────────────────────────────────

const CIRCLED_DIGIT_MAP: Record<string, number> = {
  "①": 1, "②": 2, "③": 3, "④": 4, "⑤": 5,
  "⑥": 6, "⑦": 7, "⑧": 8, "⑨": 9, "⑩": 10,
  "⑪": 11, "⑫": 12, "⑬": 13, "⑭": 14, "⑮": 15,
  "⑯": 16, "⑰": 17, "⑱": 18, "⑲": 19, "⑳": 20,
};

/**
 * 항번호를 숫자로 파싱. 법제처 API는 다음 형태 중 하나로 반환:
 *   - "①" / "②" / … / "⑳"  (유니코드 원숫자, 2487~2498)
 *   - "1" / "2" / …          (일반 숫자 문자열)
 *   - "제1항" / "1항"          (접미사 포함)
 *
 * 매칭 실패 시 NaN 반환. 호출부에서 fallback 처리 필요.
 */
export function parseHangNumber(raw: string | undefined): number {
  if (!raw) return NaN;
  const trimmed = raw.trim();
  if (!trimmed) return NaN;

  // 1) 단일 원숫자 문자 직접 매칭
  const first = trimmed[0];
  if (CIRCLED_DIGIT_MAP[first]) return CIRCLED_DIGIT_MAP[first];

  // 2) 문자열 어디든 원숫자가 포함된 경우 (드문 케이스)
  for (const ch of trimmed) {
    if (CIRCLED_DIGIT_MAP[ch]) return CIRCLED_DIGIT_MAP[ch];
  }

  // 3) 일반 숫자 문자열 ("3", "제3항", "3항")
  const m = trimmed.match(/(\d+)/);
  if (m) return parseInt(m[1], 10);

  return NaN;
}

/**
 * 숫자 → 원숫자 문자 변환. 1~20 범위 외는 일반 숫자 반환.
 * 예: 3 → "③", 21 → "21"
 */
export function toCircledDigit(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 20) return String(n);
  return "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"[n - 1];
}

// ────────────────────────────────────────────────────────────────────────────
// 2. HTML cleanup (엔티티 디코딩 순서)
// ────────────────────────────────────────────────────────────────────────────

/**
 * HTML 태그 제거 + 엔티티 디코딩.
 *
 * 주의: &amp; 는 반드시 **마지막**에 처리해야 한다. 그렇지 않으면
 *   "&amp;lt;" (→ "&lt;" 원본 의도) 가
 *   "&lt;" (&amp; 먼저 → &lt; 바뀜 → 다시 < 로 이중 디코딩)
 * 되어 원본 "&lt;" 의미가 손실된다.
 *
 * compact.ts:cleanHtml 과 동일 로직이나 중복을 피하려면 해당 함수를 re-export
 * 할 수도 있으나 모듈 경계 명확화를 위해 article-parser 전용 버전을 유지.
 */
export function cleanHtml(text: string): string {
  if (!text) return text;
  return text
    .replace(/<img[^>]*>/gi, "") // 이미지 태그는 조문 파싱에서 제외
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&") // 반드시 마지막
    .trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 중첩 콘텐츠 평탄화
// ────────────────────────────────────────────────────────────────────────────

/**
 * 조문내용·항내용·호내용 필드의 값을 재귀 평탄화하여 문자열로 결합.
 *
 * 법제처 XML→JSON 변환은 같은 필드가
 *  - 문자열 ("제1항 제1호의 …")
 *  - 문자열 배열 ["1행", "2행"]
 *  - 중첩 배열 [["a","b"], "c"]
 *  - 객체 {항내용: "..."}  (드물게)
 * 형태로 내려오므로 모두 처리.
 *
 * <img> 태그 포함 문자열은 조문 본문에서 제외.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function flattenContent(raw: any): string {
  if (raw == null) return "";
  if (typeof raw === "string") {
    const cleaned = cleanHtml(raw);
    return cleaned;
  }
  if (Array.isArray(raw)) {
    return raw
      .map((item) => flattenContent(item))
      .filter((s) => s && !s.startsWith("<img"))
      .join("\n")
      .trim();
  }
  if (typeof raw === "object") {
    // 조문 구조체로 잘못 내려온 경우 내부 텍스트 필드만 추출
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = raw as Record<string, any>;
    const candidates = [obj["조문내용"], obj["항내용"], obj["호내용"], obj["목내용"]];
    for (const c of candidates) {
      if (c != null) return flattenContent(c);
    }
    return "";
  }
  return String(raw).trim();
}

// ────────────────────────────────────────────────────────────────────────────
// 4. 조문 단위 포매팅
// ────────────────────────────────────────────────────────────────────────────

export interface ArticleUnit {
  /** "제89조" / "제18조의2" 등 정규화된 조문번호 */
  articleNo: string;
  /** 조문 제목 ("양도소득세 비과세" 등) */
  title: string;
  /** 조문 본문 전체 (항·호·목 모두 평탄화) */
  fullText: string;
  /** 헤더 중복 제거된 본문 (UI 표시용) */
  body: string;
  /** 항 단위 파싱 결과 (있으면) */
  hangs: Array<{ no: number; text: string }>;
}

/**
 * 조문단위 객체 → 구조화된 ArticleUnit.
 *
 * 법제처 API 응답 예:
 *   조문내용: "제89조(양도소득세 비과세) ① 다음 각 호의 소득에 대해서는 양도소득세를 …"
 *   항: [{ 항번호: "①", 항내용: "1. 파산선고에 의한 처분으로 발생하는 소득", 호: [...] }]
 *
 * 처리:
 *   1) 조문내용에서 헤더 "제N조(제목)" 추출 → title
 *   2) 헤더 뒤 본문 + 모든 항·호·목 텍스트 결합 → fullText
 *   3) body 는 헤더 라인을 제거한 버전 (UI가 별도로 헤더 렌더할 때 사용)
 */
export function formatArticleUnit(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unit: any,
  articleNoHint?: string
): ArticleUnit {
  const rawContent = flattenContent(unit?.조문내용);
  const articleNoFromUnit = typeof unit?.조문번호 === "string" ? unit.조문번호 : "";

  // 헤더: "제89조(양도소득세 비과세)" / "제18조의2(간주취득)" / "제89조" (괄호 없음)
  const HEADER_RE = /^(제\d+조(?:의\d+)?)\s*(?:\(([^)]+)\))?/;
  const headerMatch = rawContent.match(HEADER_RE);

  let articleNo = articleNoHint ?? "";
  let title = "";
  if (headerMatch) {
    articleNo = articleNo || headerMatch[1];
    title = (headerMatch[2] ?? "").trim();
  } else if (articleNoFromUnit) {
    articleNo = articleNo || `제${articleNoFromUnit}조`;
  }

  // 본문 = 조문내용에서 헤더 라인 제거
  const body = headerMatch
    ? rawContent.slice(headerMatch[0].length).trimStart()
    : rawContent;

  // 항 파싱
  const hangs: Array<{ no: number; text: string }> = [];
  const hangArr = toArray(unit?.항);
  for (const hang of hangArr) {
    const no = parseHangNumber(hang?.항번호);
    const text = flattenContent(hang?.항내용);
    if (text) hangs.push({ no: Number.isFinite(no) ? no : 0, text });

    // 호 · 목까지 본문에 합치려면 extractFullText 에서 처리
  }

  const fullText = buildFullText(rawContent, unit);

  return {
    articleNo: articleNo || "",
    title,
    fullText,
    body,
    hangs,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * 조문단위에서 항·호·목까지 포함한 전체 본문을 재구성.
 * legacy client 의 extractUnitText 와 동등하나 cleanHtml 보강.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFullText(content: string, unit: any): string {
  const parts: string[] = [];
  if (content) parts.push(content);

  for (const hang of toArray(unit?.항)) {
    const hangText = flattenContent(hang?.항내용);
    if (hangText) parts.push(hangText);
    for (const ho of toArray(hang?.호)) {
      if (ho?.호내용) parts.push(cleanHtml(String(ho.호내용)));
      for (const mok of toArray(ho?.목)) {
        if (mok?.목내용) parts.push(cleanHtml(String(mok.목내용)));
      }
    }
  }
  return parts.join("\n");
}

// ────────────────────────────────────────────────────────────────────────────
// 5. 조문번호 JO 코드 (법제처 내부 6자리 코드)
// ────────────────────────────────────────────────────────────────────────────

/**
 * "제38조" → "003800"  (AAAABB: 조 4자리 + 가지 2자리)
 * "제10조의2" → "001002"
 * "제38조-1" → "003801" (레거시)
 *
 * 법제처 API lawService.do 의 JO 파라미터로 조문 직접 조회 시 사용.
 * 현재 프로젝트는 법령 전체를 받아 조문을 찾는 방식이므로 verify-citations
 * 빠른 단일 조문 조회에만 활용.
 */
export function buildJoCode(articleNo: string): string | null {
  // 공백·제·조 제거해서 숫자 추출
  const cleaned = articleNo.replace(/\s/g, "");
  // "제38조의2" / "제38조" / "38조의2" / "38"
  const m = cleaned.match(/제?(\d+)조?(?:의(\d+))?$/);
  if (!m) return null;
  const main = parseInt(m[1], 10);
  const sub = m[2] ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(main) || main < 0 || main > 9999) return null;
  if (sub < 0 || sub > 99) return null;
  return `${String(main).padStart(4, "0")}${String(sub).padStart(2, "0")}`;
}
