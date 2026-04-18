/**
 * Query Router — 자연어 쿼리를 법제처 Open API 도구 + 파라미터로 매핑.
 *
 * Design Ref: §3.1 RouteResult / Plan FR-09
 * Plan SC: 규칙 ≥ 10종 / 20+ 테스트 통과
 *
 * 외부 LLM 의존 없이 정규식 10+ 패턴으로 사용자 자연어 질의를 최적 도구로 라우팅한다.
 * 매칭되지 않으면 일반 검색(search_law)으로 폴백 (confidence=low).
 *
 * 참고: chrisryugj/korean-law-mcp src/lib/query-router.ts 의 구조를 참고하되
 *      본 프로젝트 세법 관점에 맞춰 패턴을 재구성.
 */

import { resolveLawAlias } from "../aliases";
import { normalizeLawSearchText } from "../search-normalizer";
import type { ChainType, RouteResult, RouterTool } from "../types";

interface Pattern {
  name: string;
  /** 낮을수록 우선 적용 */
  priority: number;
  /** 쿼리에 매칭할 정규식 (하나라도 히트하면 선택) */
  patterns: RegExp[];
  /** 매칭 시 매개변수 추출 */
  extract: (query: string, match: RegExpExecArray) => {
    tool: RouterTool;
    params: Record<string, string | number | boolean>;
    reason: string;
    chainType?: ChainType;
    targetTab: RouteResult["targetTab"];
    confidence?: RouteResult["confidence"];
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 패턴 레지스트리 (우선순위 낮은 숫자 = 먼저 평가)
// ────────────────────────────────────────────────────────────────────────────

const ROUTER_PATTERNS: Pattern[] = [
  // 1. 특정 조문 조회 — "민법 제750조", "소득세법 제89조의2"
  {
    name: "specific_article",
    priority: 1,
    patterns: [/^(.+?)\s*제\s*(\d+)\s*조(?:의(\d+))?/],
    extract: (query, m) => {
      const lawName = resolveLawAlias(m[1].trim());
      const articleNo = m[3] ? `제${m[2]}조의${m[3]}` : `제${m[2]}조`;
      return {
        tool: "get_law_text",
        params: { lawName, articleNo },
        reason: `법령명 + 조문번호 패턴 매칭 → 해당 조문 직접 조회`,
        targetTab: "law",
        confidence: "high",
      };
    },
  },

  // 2. 개정 추적 — "양도소득세 개정 이력", "상증법 신구대조", "소득세법 연혁"
  {
    name: "amendment_track",
    priority: 10,
    patterns: [/(개정|신구대조|연혁|변경\s*이력)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "amendment_track", query: extractPrimaryTerm(query) },
      reason: "개정·연혁·신구대조 키워드 → 개정 추적 체인",
      chainType: "amendment_track",
      targetTab: "chain",
      confidence: "high",
    }),
  },

  // 3. 가산세·과태료 — "가산세 감경", "과태료 기준"
  {
    name: "penalty_action",
    priority: 12,
    patterns: [/(가산세|과태료|벌칙|감경|과징금)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "action_basis", query },
      reason: "가산세/과태료/벌칙 키워드 → 처분근거 체인(penalty 시나리오 자동 부착)",
      chainType: "action_basis",
      targetTab: "chain",
      confidence: "high",
    }),
  },

  // 4. 분쟁·심판 — "헌재", "헌법재판소", "조세심판", "행정심판"
  {
    name: "dispute_prep",
    priority: 15,
    patterns: [/(헌재|헌법\s*재판|조세\s*심판|행정\s*심판|이의\s*신청)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "dispute_prep", query: extractPrimaryTerm(query) },
      reason: "분쟁·심판 키워드 → 분쟁대응 체인",
      chainType: "dispute_prep",
      targetTab: "chain",
      confidence: "high",
    }),
  },

  // 5. 자치법규 비교 — "조례", "지방", "자치법규"
  {
    name: "ordinance_compare",
    priority: 20,
    patterns: [/(조례|지방\s*조례|자치법규)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "ordinance_compare", query },
      reason: "조례·자치법규 키워드 → 자치법규 비교 체인",
      chainType: "ordinance_compare",
      targetTab: "chain",
      confidence: "high",
    }),
  },

  // 6. 별표·서식 — "별표", "서식", "양식"
  {
    name: "annex",
    priority: 25,
    patterns: [/(별표|서식|양식)/],
    extract: (query) => ({
      tool: "get_annexes",
      params: { lawName: resolveLawAlias(extractPrimaryTerm(query)) },
      reason: "별표/서식 키워드 → 별표·서식 목록 조회",
      targetTab: "annex",
      confidence: "medium",
    }),
  },

  // 7. 판례·결정례 — "판례", "판결", "선고", "판시"
  {
    name: "search_decisions",
    priority: 30,
    patterns: [/(판례|판결|선고|판시|결정례|해석례)/],
    extract: (query) => ({
      tool: "search_decisions",
      params: { q: query, domain: /해석례/.test(query) ? "detc" : "prec" },
      reason: "판례·판결·해석례 키워드 → 판례/결정례 검색",
      targetTab: "decision",
      confidence: "high",
    }),
  },

  // 8. 위임입법 / 하위법령 — "위임", "하위법령", "시행령 미이행"
  {
    name: "delegation",
    priority: 35,
    patterns: [/(위임|하위\s*법령|시행령\s*미?이행)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "full_research", query: extractPrimaryTerm(query) },
      reason: "위임·하위법령 키워드 → 전체 리서치 체인 (delegation 시나리오 확장)",
      chainType: "full_research",
      targetTab: "chain",
      confidence: "medium",
    }),
  },

  // 9. 인용 검증 — "검증", "환각", "인용 확인" (판례보다 우선)
  {
    name: "verify_citations",
    priority: 28,
    patterns: [/(인용\s*검증|인용\s*확인|환각|실존\s*여부|조문\s*검증)/],
    extract: (query) => ({
      tool: "verify_citations",
      params: { text: query },
      reason: "검증·환각·인용 키워드 → 인용 검증",
      targetTab: "verify",
      confidence: "medium",
    }),
  },

  // 10. 행정절차·서식 — "신고", "신청", "절차"
  {
    name: "procedure_detail",
    priority: 45,
    patterns: [/(신고\s*절차|신청\s*절차|행정\s*절차|민원\s*처리)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "procedure_detail", query },
      reason: "행정절차·신고·신청 키워드 → 절차 상세 체인",
      chainType: "procedure_detail",
      targetTab: "chain",
      confidence: "medium",
    }),
  },

  // 11. 관세·FTA — "관세", "FTA", "수입", "수출"
  {
    name: "customs_fta",
    priority: 50,
    patterns: [/(관세|FTA|수입\s*관세|수출\s*관세|자유\s*무역)/],
    extract: (query) => ({
      tool: "run_chain",
      params: { type: "full_research", query },
      reason: "관세/FTA 키워드 → 전체 리서치 체인 (customs/fta 시나리오 확장)",
      chainType: "full_research",
      targetTab: "chain",
      confidence: "medium",
    }),
  },

  // 12. 단독 법령명 — "소득세법", "민법", "형법" (아무 수식어 없음)
  //    전체 길이 2~30자로 "민법"(2자) 포함. 접미사 앞에 1자 이상이면 충분.
  {
    name: "law_name_only",
    priority: 90,
    patterns: [/^[가-힣·\s]{1,28}(?:법|법률|령|규칙|시행령|시행규칙|조례|규정)$/],
    extract: (query) => ({
      tool: "search_law",
      params: { q: resolveLawAlias(query.trim()) },
      reason: "법령명 단독 입력 → 법령 검색",
      targetTab: "law",
      confidence: "high",
    }),
  },
];

// ────────────────────────────────────────────────────────────────────────────
// 핵심 라우팅 함수
// ────────────────────────────────────────────────────────────────────────────

/**
 * 자연어 쿼리를 라우팅. 매칭 실패 시 search_law 폴백(confidence=low).
 */
export function routeQuery(rawQuery: string): RouteResult {
  const query = normalizeLawSearchText(rawQuery).trim();
  if (!query) {
    return makeFallback(rawQuery, "empty_query");
  }

  // 우선순위 순 평가
  const sorted = [...ROUTER_PATTERNS].sort((a, b) => a.priority - b.priority);
  for (const pat of sorted) {
    for (const re of pat.patterns) {
      const m = re.exec(query);
      if (m) {
        const extracted = pat.extract(query, m);
        return {
          tool: extracted.tool,
          params: extracted.params,
          reason: extracted.reason,
          patternName: pat.name,
          priority: pat.priority,
          confidence: extracted.confidence ?? "medium",
          chainType: extracted.chainType,
          targetTab: extracted.targetTab,
        };
      }
    }
  }

  return makeFallback(query, "no_pattern_match");
}

function makeFallback(query: string, reasonKey: string): RouteResult {
  return {
    tool: "search_law",
    params: { q: query },
    reason:
      reasonKey === "empty_query"
        ? "빈 쿼리 — 입력 후 다시 시도하세요"
        : "특정 패턴 미매칭 → 일반 법령 검색으로 폴백",
    patternName: "fallback_search_law",
    priority: 999,
    confidence: "low",
    targetTab: "law",
  };
}

/**
 * 쿼리에서 주요 검색어 추출: 법령명이 포함되어 있으면 법령명만, 없으면 첫 명사구.
 * extractPrimaryTerm("양도소득세 개정 이력") = "양도소득세"
 */
function extractPrimaryTerm(query: string): string {
  // 법령명 prefix 추출 (법·령·규칙·조례 접미사)
  const lawMatch = query.match(/^([가-힣·]+(?:\s+[가-힣·]+)*(?:법|법률|령|규칙|시행령|시행규칙|조례|규정))/);
  if (lawMatch) return resolveLawAlias(lawMatch[1].trim());

  // 없으면 첫 2-3 단어
  const words = query.split(/\s+/).filter(Boolean);
  if (words.length === 0) return query;
  return words.slice(0, 2).join(" ");
}

/** 테스트·UI 용 전체 패턴 수 */
export const ROUTER_PATTERN_COUNT = ROUTER_PATTERNS.length;

/** 테스트 용 패턴 이름 목록 */
export const ROUTER_PATTERN_NAMES = ROUTER_PATTERNS.map((p) => p.name);
