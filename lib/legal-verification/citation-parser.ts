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
//
// ⚠️ 이 객체의 **키 집합**은 단순 별칭 사전이 아니라 `coverage.ts`의 화이트리스트
//    (`KNOWN_ABBRS`)이기도 하다 — 여기 없는 법령명은 `isLegalCitation`이 false로 떨어져
//    커버리지 **모수에서 조용히 빠진다**(통과가 아니라 미검사).
//    ⇒ 항목을 추가할 때는 그 법령의 인용 조문을 매니페스트에도 함께 등록할 것.
//       (등록하지 않으면 `legal-verification-coverage-complete.test.ts`가 즉시 빨개진다)
//
// 시행령·시행규칙은 값이 키와 같은 항등 매핑이다(`?? abbr` fallback과 결과가 동일).
// 그래도 명시적으로 적는 이유는 위의 화이트리스트 역할 때문이다.
export const LAW_ALIAS: Record<string, string> = {
  "소득세법":            "소득세법",
  "소법":                "소득세법",
  "소득세법 시행령":     "소득세법 시행령",
  "소령":                "소득세법 시행령",
  "소득세법 시행규칙":   "소득세법 시행규칙",
  "상증법":              "상속세 및 증여세법",
  "상속세 및 증여세법":  "상속세 및 증여세법",
  "상증령":              "상속세 및 증여세법 시행령",
  "상속세 및 증여세법 시행령": "상속세 및 증여세법 시행령",
  // 같은 법령을 가리키는 표기가 셋 있다 — 정규명으로 모은다(문자열 자체는 표시용이라 유지)
  "상증칙":              "상속세 및 증여세법 시행규칙",
  "상증규":              "상속세 및 증여세법 시행규칙",
  "상증세법 시행규칙":   "상속세 및 증여세법 시행규칙",
  "상속세 및 증여세법 시행규칙": "상속세 및 증여세법 시행규칙",
  "지방세법":            "지방세법",
  "지방세법 시행령":     "지방세법 시행령",
  "지방세법 시행규칙":   "지방세법 시행규칙",
  "지방세특례제한법":    "지방세특례제한법",
  "종합부동산세법":      "종합부동산세법",
  "종합부동산세법 시행령": "종합부동산세법 시행령",
  "종부세법":            "종합부동산세법",
  "조특법":              "조세특례제한법",
  "조세특례제한법":      "조세특례제한법",
  "조특령":              "조세특례제한법 시행령",
  "조특법 시행령":       "조세특례제한법 시행령",
  "농어촌특별세법":      "농어촌특별세법",
  "농어촌특별세법 시행령": "농어촌특별세법 시행령",
  "농특세법":            "농어촌특별세법",
  "국세기본법":          "국세기본법",
  "국세기본법 시행령":   "국세기본법 시행령",
  "지방세기본법":        "지방세기본법",
  "법인세법":            "법인세법",
  "법인세법 시행령":     "법인세법 시행령",
  "법인령":              "법인세법 시행령",
  "부가가치세법":        "부가가치세법",
  "부가가치세법 시행령": "부가가치세법 시행령",
  "부가가치세법 시행규칙": "부가가치세법 시행규칙",
  "증권거래세법":        "증권거래세법",
  "증권거래세법 시행령": "증권거래세법 시행령",
  "국고금 관리법":       "국고금 관리법",
  // 세법이 아니지만 세액 판정에 직접 인용하는 법령들 (조합원입주권·정비사업·대주주 판정 등)
  "자본시장법":          "자본시장과 금융투자업에 관한 법률",
  "자본시장법 시행령":   "자본시장과 금융투자업에 관한 법률 시행령",
  "도시 및 주거환경정비법": "도시 및 주거환경정비법",
  "빈집 및 소규모주택 정비에 관한 특례법": "빈집 및 소규모주택 정비에 관한 특례법",
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

/**
 * 한 문자열에 담긴 **여러 조문 인용**을 모두 파싱한다.
 *
 * `parseCitation`은 앞쪽 하나만 읽는다. 그래서 아래 같은 복합 인용에서
 * **뒤쪽 조문이 통째로 수집되지 않았다** — 커버리지 모수에도 못 들어갔다:
 *
 *   "소득세법 시행령 §168조의11 ② + 소득세법 시행규칙 §83조의4"
 *   "소득세법 시행령 §168조의14 ① (소득세법 시행규칙 §83의5①)"
 *   "상증령 §57③·상증칙 §18②"
 *   "소득세법 시행령 §167의10①4호·§155⑧"      ← 뒤 세그먼트는 법령명 생략
 *
 * 구분자는 `+`·`·`·`,`이며, 괄호 그룹도 독립 세그먼트로 떼어 파싱한다.
 * 법령명이 생략된 세그먼트("§155⑧")는 **직전 세그먼트의 법령을 승계**한다.
 *
 * 설명 꼬리("— 임대료 등의 환산가액 (12%, 2009.4.23. 시행)")처럼 조·항 표기가
 * 없는 세그먼트는 `parseCitation`이 null을 반환해 자연히 걸러진다.
 *
 * 반환은 "법령명 + 조" 기준으로 중복 제거하며, 입력 순서를 유지한다.
 */
export function parseCitations(raw: string): ParsedCitation[] {
  // 괄호 그룹을 본문에서 떼어내 별도 세그먼트로 돌린다
  const parenGroups: string[] = [];
  const outer = raw.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    parenGroups.push(inner);
    return " ";
  });

  const segments = [outer, ...parenGroups]
    .flatMap((s) => s.split(/[+·,]/))
    .map((s) => s.trim())
    .filter(Boolean);

  const out: ParsedCitation[] = [];
  const seenKeys = new Set<string>();
  let lastAbbr: string | null = null;
  let lastFullName: string | null = null;

  for (const seg of segments) {
    let parsed: ParsedCitation | null = parseCitation(seg);
    // 법령명이 생략된 후속 세그먼트는 직전 법령을 승계한다 ("§155⑧" → "소득세법 시행령 §155⑧")
    if (!parsed && lastAbbr && /^(?:§|제)\s*\d/.test(seg)) {
      parsed = parseCitation(`${lastAbbr} ${seg}`);
    }
    if (!parsed) continue;

    // "소득세법 §97 ② 2호 + 시행령 §163 ⑥"처럼 하위법령을 **법령명 없이** 적은 세그먼트는
    // 직전 세그먼트의 **본법**에 붙인다 → "소득세법 시행령 제163조".
    // 이 표기가 legal-codes 전반에 흔하다(소득세법·지방세법·종부세법 모두 같은 형태).
    if ((parsed.lawAbbr === "시행령" || parsed.lawAbbr === "시행규칙") && lastFullName) {
      const base: string = lastFullName.replace(/\s*시행(?:령|규칙)$/, "");
      const inherited: string = `${base} ${parsed.lawAbbr}`;
      parsed = {
        ...parsed,
        lawAbbr: inherited,
        lawFullName: LAW_ALIAS[inherited] ?? inherited,
      };
    }

    lastAbbr = parsed.lawAbbr;
    lastFullName = parsed.lawFullName;
    const key = `${parsed.lawFullName} ${parsed.articleNo}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(parsed);
  }

  return out;
}

/** 조문 번호를 API jo 파라미터 형식으로 변환 (예: "제111조" → "제111조") */
export function toApiArticleParam(articleNo: string): string {
  return articleNo; // 현재 API는 "제111조" 그대로 사용 가능
}
