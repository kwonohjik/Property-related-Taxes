/**
 * 법령 검색어 정규화 + 관련도 점수
 *
 * korean-law-mcp (chrisryugj/korean-law-mcp)의 search-normalizer.ts / law-search.ts를
 * 부동산 세법 도메인에 맞게 재구성.
 *
 * 핵심 기능:
 *  - normalizeLawSearchText: 유니코드·공백·오타 정규화
 *  - stripNonLawKeywords: "양도소득세 판례" → "양도소득세"
 *  - scoreLawRelevance: 관련도 점수로 재정렬 (부분매칭 오탐 해결)
 */

// ────────────────────────────────────────────────────────────────────────────
// 1. 기본 오타 복원 (한글 자음·모음 오탈자)
// ────────────────────────────────────────────────────────────────────────────

const BASIC_CHAR_MAP = new Map<string, string>([
  ["벚", "법"], ["벆", "법"], ["벋", "법"], ["뻡", "법"], ["볍", "법"], ["뱝", "법"],
  ["셰", "세"], ["쉐", "세"],
  ["괸", "관"], ["곽", "관"],
  ["엄", "업"], ["얼", "업"],
]);

function normalizeBasicTypos(value: string): string {
  return value.replace(/[벚벆벋뻡볍뱝셰쉐괸곽엄얼]/gu, (c) => BASIC_CHAR_MAP.get(c) ?? c);
}

/**
 * 검색어 sanitize. 법제처 API는 일반 텍스트만 받으므로 HTML 태그·제어문자를 제거해
 * upstream timeout/5xx 및 XSS 전파를 차단한다.
 *
 * 부작용 방지: 한글·영문·숫자·공백·일반 구두점은 보존.
 * 위험 문자(<, >, 제어문자, null, ;, `, $)만 선별 제거.
 */
export function sanitizeSearchQuery(input: string): string {
  return input
    .replace(/<[^>]*>/g, "")                    // HTML/XML 태그
    .replace(/[<>]/g, "")                       // 남은 부등호
    .replace(/[\x00-\x1f\x7f]/g, " ")           // 제어문자·DEL
    .replace(/--+/g, " ")                       // SQL line comment
    .replace(/\/\*[\s\S]*?\*\//g, " ")          // SQL block comment
    .replace(/[;`$|&^~\\]/g, " ")               // shell/SQL 위험 기호
    .replace(/[()'"]/g, " ")                    // 괄호·따옴표 (법제처 API hang 유발)
    .replace(/[!@#%*+=?_]/g, " ")               // 법령명에 절대 없는 특수문자(+ 언더스코어; 법제처 hang)
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 법령 검색어 전처리. sanitize → 유니코드 NFC → 특수공백 정규화 → §/전각 대체 → 한글 오타 복원.
 */
export function normalizeLawSearchText(input: string): string {
  let v = sanitizeSearchQuery(input).normalize("NFC");
  v = v
    .replace(/[\u00a0\u2002\u2003\u2009]/gu, " ")   // nbsp 류
    .replace(/[‐‑‒–—―﹘﹣－]/gu, "-")                // 각종 대시 통일
    .replace(/[﹦=]/gu, " ")
    .replace(/§/gu, " 제")
    .replace(/\s*[-]\s*/gu, "-")
    .replace(/\s*\.\s*/gu, " ");
  v = normalizeBasicTypos(v);
  v = v.replace(/([a-zA-Z])([가-힣])/gu, "$1 $2"); // 영문·한글 경계 공백
  v = v
    .replace(/\s+/gu, " ")
    .replace(/\(\s+/gu, "(")
    .replace(/\s+\)/gu, ")")
    .trim();
  return v;
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 부가 키워드 제거 (법령명 검색 시 방해되는 단어)
// ────────────────────────────────────────────────────────────────────────────

export const NON_LAW_NAME_RE = /\s*(과태료|절차|비용|처벌|기준|허가|신청|부과|근거|위반|방법|요건|조건|처분|수수료|신고|등록|면허|인가|승인|취소|정지|벌칙|벌금|과징금|이행강제금|시정명령|체계|구조|3단|판례|해석|개정|별표|시행령|시행규칙|서식|수입|수출|통관|반환|납부|감면|면제|제한|금지|의무|권리|자격|종류|기간|대상|범위|적용|감경|영향도|영향|분석|위임입법|위임|현황|미이행|미제정|시계열|타임라인|변화|처리|민원|매뉴얼|업무|담당|적합성|상위법|저촉|검증|파급|연쇄|불복|소송|쟁송|FTA|원산지|HS코드|품목분류|관세사|양도|상속|증여|취득|재산|종합부동산|종부)\s*/g;

/**
 * 법령명이 아닌 부가 키워드 제거 — "양도소득세 과세 판례" → "소득세"
 * 주의: 세법 키워드(양도·상속·증여 등)는 법령명에 포함될 가능성도 있어 과제거 위험.
 *       실패 시 원본 쿼리 fallback이 필수.
 */
export function stripNonLawKeywords(query: string): string {
  return query.replace(NON_LAW_NAME_RE, " ").trim().replace(/\s+/g, " ");
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 관련도 점수 (법령 검색 결과 재정렬)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 부동산 세법 핵심 본법 목록 — 검색 결과 재정렬에서 추가 가산점 부여.
 * 6대 세법 + 조세특례제한법 + 농특세·지특법(자주 참조).
 */
const TAX_CORE_LAWS = [
  "소득세법",
  "지방세법",
  "지방세특례제한법",
  "상속세및증여세법",
  "종합부동산세법",
  "조세특례제한법",
  "농어촌특별세법",
  "부가가치세법",
  "법인세법",
  "국세기본법",
  "국세징수법",
];

/**
 * 쿼리 대비 법령명 관련도 점수 (높을수록 관련).
 *
 * 문제: 법제처 lawSearch API는 부분 문자열 매칭 → "민법" 검색 시 "난민법"·"의료법" 등이 앞에 나옴.
 * 해결: 점수 기반 재정렬로 정확 매칭을 맨 앞에 배치.
 *
 * 2026-04-18 업데이트: 세법 본법 추가 가산점(+10). "세법" 관련 쿼리에서
 * 관계없는 법령(예: "지방자치법")이 상위에 오지 않도록.
 */
export function scoreLawRelevance(lawName: string, query: string, queryWords: string[]): number {
  let score = 0;
  // 쿼리가 법령명 전체를 포함 (정확 매칭)
  if (query === lawName) score += 200;
  if (query.includes(lawName)) score += 100;
  // 법령명이 쿼리(공백 제거)를 포함
  const qNoSpace = query.replace(/\s+/g, "");
  if (lawName.includes(qNoSpace)) score += 80;
  // 단어 매칭 누적
  for (const w of queryWords) {
    if (w.length >= 2 && lawName.includes(w)) score += 10;
  }
  // 법률(본법) > 시행령 > 시행규칙
  if (!/시행령|시행규칙/.test(lawName)) score += 5;
  // 세법 본법 추가 가산점 — 세법 프로젝트 특화
  if (TAX_CORE_LAWS.includes(lawName)) score += 10;
  // 공포일 최신일수록 점수 가산은 호출측에서 promulgationDate로 tie-break
  return score;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. 세법 약칭·키워드 확장 사전
// ────────────────────────────────────────────────────────────────────────────

/**
 * 사용자 쿼리에 흔히 쓰이는 세법 축약·별칭·동의어를 정식명 또는 핵심 키워드로 확장.
 *
 * 검색어 전처리 시 정식명을 함께 OR 검색할 후보로 사용하거나, 검색 실패 시 fallback.
 * upstream: src/lib/search-normalizer.ts:KEYWORD_EXPANSIONS
 */
export const TAX_KEYWORD_EXPANSIONS: ReadonlyArray<{
  aliases: string[];
  expand: string;
}> = [
  // 양도소득세
  { aliases: ["양도세", "양소세"], expand: "양도소득세" },
  { aliases: ["1세대1주택", "1가구1주택", "1주택비과세"], expand: "1세대 1주택 비과세" },
  { aliases: ["장특", "장기보유공제"], expand: "장기보유특별공제" },
  { aliases: ["중과세", "다주택중과"], expand: "양도소득세 중과" },
  { aliases: ["고가주택"], expand: "고가주택 12억" },
  { aliases: ["조정대상지역", "조정지역"], expand: "조정대상지역" },
  { aliases: ["임대주택감면"], expand: "장기임대주택 감면" },

  // 취득세·재산세
  { aliases: ["취득세"], expand: "지방세법 취득세" },
  { aliases: ["생애최초"], expand: "생애최초 주택 취득세 감면" },
  { aliases: ["재산세"], expand: "지방세법 재산세" },

  // 종합부동산세
  { aliases: ["종부세"], expand: "종합부동산세" },
  { aliases: ["합산배제", "임대등록배제"], expand: "종합부동산세 합산배제" },
  { aliases: ["세부담상한"], expand: "세부담 상한" },

  // 상속·증여
  { aliases: ["상증세", "상증"], expand: "상속세 증여세" },
  { aliases: ["동거주택공제"], expand: "동거주택 상속공제" },
  { aliases: ["가업상속"], expand: "가업상속공제" },
  { aliases: ["세대생략"], expand: "세대생략 할증" },
  { aliases: ["10년합산", "사전증여합산"], expand: "사전증여 합산" },

  // 기타
  { aliases: ["신축주택"], expand: "신축주택 감면" },
  { aliases: ["비사업용"], expand: "비사업용 토지" },
  { aliases: ["부담부증여"], expand: "부담부 증여 양도" },
  { aliases: ["경정청구"], expand: "경정청구 국세기본법" },
  { aliases: ["가산세"], expand: "가산세 국세기본법 제47조" },
];

/**
 * 쿼리에서 세법 축약어를 찾아 정식명/핵심키워드로 확장.
 * 확장 후보를 원본과 OR 로 결합한 배열 반환.
 *
 * 예: "양도세 중과" → ["양도세 중과", "양도소득세 양도소득세 중과", ...]
 *
 * stripNonLawKeywords 와 달리 파괴적이지 않음 — 원본은 항상 포함.
 */
export function expandTaxKeywords(query: string): string[] {
  if (!query) return [];
  const results = new Set<string>([query]);

  for (const { aliases, expand } of TAX_KEYWORD_EXPANSIONS) {
    for (const alias of aliases) {
      if (query.includes(alias)) {
        // 원본에서 alias 를 expand로 치환한 버전 추가
        results.add(query.replace(alias, expand));
        // expand 만 단독 검색 (alias 이외 단어 제거)
        results.add(expand);
      }
    }
  }

  return Array.from(results);
}

// ────────────────────────────────────────────────────────────────────────────
// 5. 법령명 직접 추출 (3단 fallback의 2단계)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 쿼리에서 법령명 패턴을 정규식으로 직접 추출.
 *
 * stripNonLawKeywords 가 과도하게 제거하는 경우(예: "양도세 판례" → "")에
 * 2차 fallback으로 사용. 쿼리 내 모든 법령명 후보를 반환.
 *
 * upstream: src/lib/law-search.ts:extractLawNames
 */
export function extractLawNames(query: string): string[] {
  if (!query) return [];
  const LAW_NAME_RE = /([가-힣]{2,20}?(?:법률|법|시행령|시행규칙|규칙|규정|조례|특별법))/g;
  const matches = query.match(LAW_NAME_RE);
  if (!matches) return [];
  // 중복 제거
  return Array.from(new Set(matches.map((m) => m.trim()).filter((m) => m.length >= 2)));
}
