/**
 * 법령 조문 인용 문자열 파서
 *
 * legal-codes.ts의 상수값 "상증법 §18의2", "지방세법 §111①2호 가목" 등을
 * 법제처 API 조회에 쓸 수 있는 구조체로 변환한다.
 */

export interface ParsedCitation {
  /** 법제처 API 검색용 정규 법령명 */
  lawFullName: string;
  /** 약칭 (원문 그대로) */
  lawAbbr: string;
  /** 조문 번호 예: "제18조의2", "제111조" */
  articleNo: string;
  /** 항 번호 예: "①", "제2항" → 정규화 후 "①" */
  paragraph?: string;
  /** 호 번호 예: "1호", "제3호" → "1호" */
  item?: string;
  /** 목 예: "가목", "나목" */
  subItem?: string;
  /** 원본 인용 문자열 */
  raw: string;
}

// ── 약칭 → 정규 법령명 매핑 ──────────────────────────────────────────────
const LAW_ALIAS: Record<string, string> = {
  "소득세법":            "소득세법",
  "상증법":              "상속세 및 증여세법",
  "지방세법":            "지방세법",
  "지방세특례제한법":    "지방세특례제한법",
  "종합부동산세법":      "종합부동산세법",
  "종부세법":            "종합부동산세법",
  "조특법":              "조세특례제한법",
  "조세특례제한법":      "조세특례제한법",
  "농어촌특별세법":      "농어촌특별세법",
  "농특세법":            "농어촌특별세법",
  "국세기본법":          "국세기본법",
  "법인세법":            "법인세법",
};

/** 항 번호 표현을 원문자 형태로 정규화 */
function normalizeParagraph(raw: string): string {
  const circled: Record<string, string> = {
    "1": "①", "2": "②", "3": "③", "4": "④", "5": "⑤",
    "6": "⑥", "7": "⑦", "8": "⑧", "9": "⑨", "10": "⑩",
  };
  // "제1항" → "①", "①" → "①"
  const m = raw.match(/제(\d+)항|([①-⑩])/);
  if (!m) return raw;
  if (m[1]) return circled[m[1]] ?? raw;
  return m[2];
}

/** "소득세법 §95 ②" 또는 "종합부동산세법 제8조제1항 제3호" 형태 모두 파싱 */
export function parseCitation(raw: string): ParsedCitation | null {
  // 주석 부분 제거 ("(9억)", "(300%)" 등)
  const cleaned = raw.replace(/\([^)]*\)/g, "").trim();

  // ── 법령명 추출 ──────────────────────────────────────────────────────
  // 패턴: "법령명 §조문" 또는 "법령명 제조조문"
  const lawMatch = cleaned.match(
    /^([\uAC00-\uD7A3\w]+(?:\s+[\uAC00-\uD7A3\w]+)*?)\s+(?:§|제)/
  );
  if (!lawMatch) return null;
  const lawAbbr = lawMatch[1].trim();
  const lawFullName = LAW_ALIAS[lawAbbr] ?? lawAbbr;

  // ── 조문 번호 추출 ────────────────────────────────────────────────────
  // 지원 형식:
  //   §18의2       → 제18조의2  (의N이 조 없이 숫자 직후)
  //   §104조의3    → 제104조의3 (의N이 조 뒤에)
  //   §89          → 제89조
  //   제8조제1항   → 제8조
  const articleMatch = cleaned.match(
    /(?:§|제)(\d+(?:의\d+)?)\s*(?:조(의\d+)?)?/
  );
  if (!articleMatch) return null;
  const baseWithPrefix = articleMatch[1]; // "18의2" or "104" or "89"
  const suffixAfterJo = articleMatch[2] ?? ""; // "의3" (§104조의3 경우) or ""
  // 표준화: 제18의2조 → 제18조의2, 제104조의3 그대로
  const rawArticleNo = `제${baseWithPrefix}조${suffixAfterJo}`.replace("조조", "조");
  const articleNoNorm = rawArticleNo.replace(/제(\d+)(의\d+)조/, "제$1조$2");

  // ── 항 추출 ───────────────────────────────────────────────────────────
  // "§8①", "§9⑥", "제1항", "②" 등
  const paragraphMatch = cleaned.match(
    /(?:§\d+(?:의\d+)?|제\d+조(?:의\d+)?)\s*([①-⑩]|제\d+항)/
  );
  const paragraph = paragraphMatch
    ? normalizeParagraph(paragraphMatch[1])
    : undefined;

  // ── 호 추출 ───────────────────────────────────────────────────────────
  const itemMatch = cleaned.match(/제?(\d+)호/);
  const item = itemMatch ? `${itemMatch[1]}호` : undefined;

  // ── 목 추출 ───────────────────────────────────────────────────────────
  const subItemMatch = cleaned.match(/([가-힣]목)/);
  const subItem = subItemMatch ? subItemMatch[1] : undefined;

  return {
    lawFullName,
    lawAbbr,
    articleNo: articleNoNorm,
    paragraph,
    item,
    subItem,
    raw,
  };
}

/** 조문 번호를 API jo 파라미터 형식으로 변환 (예: "제111조" → "제111조") */
export function toApiArticleParam(articleNo: string): string {
  return articleNo; // 현재 API는 "제111조" 그대로 사용 가능
}
