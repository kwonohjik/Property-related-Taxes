/**
 * 한국 법령 리서치 — 공용 타입 및 Zod 스키마
 *
 * korean-law-mcp (chrisryugj/korean-law-mcp)의 도구 세트를 한국 부동산 세법
 * 관점에서 재구성한 타입 계약. API Route와 클라이언트 UI가 이 모듈만 참조하도록
 * 단일 진실 소스로 관리한다.
 *
 * 참고: 법제처 Open API는 요청/응답에 한글 필드명을 사용하므로 API 응답 타입은
 *       client.ts에 분리, 이 파일은 내부 도메인 타입만 정의한다.
 */

import { z } from "zod";

// ────────────────────────────────────────────────────────────────────────────
// 1. 판례·결정례 도메인 (search_decisions / get_decision_text)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법제처 API `target` 파라미터에 매핑되는 17개 결정 도메인.
 * 각 값은 `lawSearch.do?target=xxx` 의 xxx 와 1:1 대응.
 * 부동산 세법 활용 우선순위가 높은 상위 도메인을 배열 앞에 배치.
 */
export const DECISION_DOMAINS = [
  "prec",       // 판례 (대법원)
  "detc",       // 법령해석례 (법제처)
  "expc",       // 헌재결정례
  "admrul",     // 행정규칙
  "ppc",        // 조세심판원 결정
  "fsc",        // 금융위원회
  "ftc",        // 공정거래위원회
  "nlrc",       // 중앙노동위원회
  "kcc",        // 방송통신위원회
  "pipc",       // 개인정보보호위원회
  "oia",        // 국민권익위원회 (국민고충처리)
  "acr",        // 소청심사위원회
  "ordin",      // 자치법규
  "public",     // 공공기관 규정
  "nhrc",       // 국가인권위원회
  "trty",       // 조약
  "lawnkor",    // 북한법령
] as const;

export type DecisionDomain = typeof DECISION_DOMAINS[number];

/** UI 표기용 한글 레이블 (드롭다운·필터용) */
export const DECISION_DOMAIN_LABELS: Record<DecisionDomain, string> = {
  prec:     "대법원 판례",
  detc:     "법령해석례",
  expc:     "헌재결정례",
  admrul:   "행정규칙",
  ppc:      "조세심판원 결정",
  fsc:      "금융위원회 의결",
  ftc:      "공정거래위원회 의결",
  nlrc:     "중앙노동위원회",
  kcc:      "방송통신위원회",
  pipc:     "개인정보보호위원회",
  oia:      "국민권익위원회",
  acr:      "소청심사위원회",
  ordin:    "자치법규",
  public:   "공공기관 규정",
  nhrc:     "국가인권위원회",
  trty:     "조약",
  lawnkor:  "북한법령",
};

// ────────────────────────────────────────────────────────────────────────────
// 2. 공용 리소스 타입
// ────────────────────────────────────────────────────────────────────────────

export interface LawSearchItem {
  lawName: string;
  lawId: string;
  mst: string;
  promulgationDate: string;
}

export interface LawArticleResult {
  title: string;
  fullText: string;
  lawName: string;
  articleNo: string;
  /** 법제처 조문 URL (있으면) */
  sourceUrl?: string;
}

export interface DecisionSearchItem {
  /** 결정 고유 ID (법제처) */
  id: string;
  /** 도메인 (판례·해석례 등) */
  domain: DecisionDomain;
  /** 사건번호 또는 결정번호 */
  caseNo: string;
  /** 제목 / 사건명 */
  title: string;
  /** 법원·기관명 */
  court: string;
  /** 선고일 / 결정일 (YYYYMMDD 또는 YYYY-MM-DD) */
  date: string;
  /**
   * 데이터 출처. 법제처 DRF API는 "대법원" 출처만 본문(JSON)을 제공하며,
   * "국세법령정보시스템" 등 외부 출처 판례는 웹 HTML 링크로만 접근 가능.
   */
  source?: string;
}

export interface DecisionText {
  id: string;
  domain: DecisionDomain;
  caseNo: string;
  title: string;
  /** 판시사항 (판례·결정례 요지 1 — LLM 용 짧은 요약) */
  holdings: string;
  /** 판결요지 (판례·결정례 요지 2 — 법리 요약). MCP 이식 신규 필드 */
  summary?: string;
  /** 주문 (있을 경우만) — v2 신규 노출 */
  ruling?: string;
  /** 이유 / 본문 — 길면 compactBody로 계단식 축약 */
  reasoning: string;
  /** 참조 조문 (densifyLawRefs 적용) */
  refLaws?: string;
  /** 참조 판례 (densifyPrecedentRefs 적용) */
  refPrecedents?: string;
  /** v2 신규 — 참조조문 구조화 배열 (UI 클릭 시 자동 조문 로드용) */
  refLawsStructured?: LawRef[];
  /** v2 신규 — 참조판례 구조화 배열 */
  refPrecedentsStructured?: PrecedentRef[];
  /** 사건종류명 (예: 세무) */
  caseType?: string;
  /** 판결유형 (예: 상고기각) */
  judgmentType?: string;
  court: string;
  date: string;
  sourceUrl?: string;
  /** 본문이 축약되었는지 여부 (UI에 "전문 보기" 토글 노출) */
  compacted?: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// v2 신규 — 참조조문/참조판례 구조화 타입
// ────────────────────────────────────────────────────────────────────────────

/**
 * 판례 본문의 참조조문(refLaws) 문자열을 파싱한 구조체.
 *
 * 예: "구 소득세법 제94조 제1항 제1호" →
 *   { raw: "구 소득세법 제94조 제1항 제1호",
 *     lawName: "소득세법", isPrior: true,
 *     articleNo: 94, hangNo: 1, hoNo: 1 }
 */
export interface LawRef {
  /** 원본 문자열 조각 */
  raw: string;
  /** 법령명 (구/신 prefix 제거, 약칭 정식명으로 해석) */
  lawName: string;
  /** "구" 법령 표기 여부 */
  isPrior: boolean;
  /** 조번호 (제N조의 N) */
  articleNo?: number;
  /** "의M" 가지번호 — 제N조의M */
  articleSubNo?: number;
  /** 항 번호 (원숫자·한글숫자 모두 숫자로 정규화) */
  hangNo?: number;
  /** 호 번호 */
  hoNo?: number;
  /** 목 기호 (가·나·다) */
  mokNo?: string;
}

/**
 * 참조판례 파싱 결과.
 * 예: "대법원 2020.3.26. 2018두56077" → { court: "대법원", date: "2020-03-26", caseNo: "2018두56077" }
 */
export interface PrecedentRef {
  raw: string;
  court: string;
  date: string;
  caseNo: string;
  judgmentType?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// v2 신규 — Query Router 결과
// ────────────────────────────────────────────────────────────────────────────

export type RouterTool =
  | "search_law"
  | "get_law_text"
  | "search_decisions"
  | "get_decision_text"
  | "get_annexes"
  | "run_chain"
  | "verify_citations";

export interface RouteResult {
  tool: RouterTool;
  params: Record<string, string | number | boolean>;
  reason: string;
  patternName: string;
  priority: number;
  confidence: "high" | "medium" | "low";
  /** run_chain 일 때 사용할 체인 타입 힌트 */
  chainType?: ChainType;
  /** UI가 어떤 탭으로 이동해야 하는지 힌트 */
  targetTab?: "law" | "decision" | "annex" | "chain" | "verify";
}

export const routeRouterInputSchema = z.object({
  query: z.string().min(1).max(500),
});
export type RouteRouterInput = z.infer<typeof routeRouterInputSchema>;

export interface AnnexItem {
  /** 별표 번호 */
  annexNo: string;
  /** 별표 제목 */
  title: string;
  /** 첨부 파일 종류 (HWPX/PDF/XLSX/DOCX) */
  fileType?: string;
  /** 법제처 다운로드 URL */
  downloadUrl?: string;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 체인 워크플로 타입
// ────────────────────────────────────────────────────────────────────────────

export const CHAIN_TYPES = [
  "full_research",
  "law_system",
  "action_basis",
  "dispute_prep",
  "amendment_track",
  "ordinance_compare",
  "procedure_detail",
  "document_review",
] as const;

export type ChainType = typeof CHAIN_TYPES[number];

export const CHAIN_LABELS: Record<ChainType, string> = {
  full_research:     "전체 리서치 (법령 + 판례)",
  law_system:        "법령 체계 (상·하위 법령)",
  action_basis:      "처분 근거 (법령 + 판례 + 행정규칙)",
  dispute_prep:      "분쟁 대응 준비 (헌재·조세심판·행정심판)",
  amendment_track:   "개정 추적 (타임라인)",
  ordinance_compare: "자치법규 비교",
  procedure_detail:  "행정절차 + 서식",
  document_review:   "문서 인용 검증",
};

/**
 * 체인 결과 단위 섹션. UI는 각 섹션을 탭·카드로 표현.
 */
export interface ChainSection {
  kind: "laws" | "articles" | "decisions" | "annexes" | "citations" | "note";
  heading: string;
  laws?: LawSearchItem[];
  articles?: LawArticleResult[];
  decisions?: DecisionSearchItem[];
  annexes?: AnnexItem[];
  citations?: Array<{ raw: string; valid: boolean; lawName?: string; articleNo?: string; reason?: string }>;
  note?: string;
}

export interface ChainResult {
  chainType: ChainType;
  query: string;
  startedAt: string;
  elapsedMs: number;
  sections: ChainSection[];
}

// ────────────────────────────────────────────────────────────────────────────
// 4. Zod 스키마 (API 입력 검증용)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 한국 법령 검색은 한글이 기본. 한글이 전혀 없는 쿼리(순수 영문/숫자/기호)는
 * 법제처 API에서 hang 또는 0건 응답을 유발하므로 사전 거부해 빠른 피드백 제공.
 * 공통 알려진 영문 약어는 예외 허용: FTA, WTO, OECD, UN 등.
 */
const HANGUL_OR_KNOWN_EN = /[가-힣]|\b(FTA|WTO|OECD|UN|EU|APEC)\b/i;

export const searchLawInputSchema = z.object({
  q: z.string()
    .min(1, "검색어를 입력하세요.")
    .max(100)
    .refine(
      (v) => HANGUL_OR_KNOWN_EN.test(v),
      "법령명은 한글로 입력해 주세요. (예: '소득세법', '지방세법')"
    ),
  limit: z.coerce.number().int().min(1).max(20).default(5),
  /** 정렬: relevance(기본) / promulgation_desc / promulgation_asc */
  sort: z.enum(["relevance", "promulgation_desc", "promulgation_asc"]).optional(),
  /** 공포일자 범위 (YYYYMMDD~YYYYMMDD) */
  ancYd: z.string().regex(/^\d{8}([~\-,]\d{8})?$/, "공포일자 형식 오류: YYYYMMDD 또는 YYYYMMDD~YYYYMMDD").optional(),
  /** 시행일자 범위 (YYYYMMDD~YYYYMMDD) */
  efYd: z.string().regex(/^\d{8}([~\-,]\d{8})?$/, "시행일자 형식 오류: YYYYMMDD 또는 YYYYMMDD~YYYYMMDD").optional(),
});
export type SearchLawInput = z.infer<typeof searchLawInputSchema>;

export const lawTextInputSchema = z.object({
  lawName: z.string().min(1).max(100).refine(
    (v) => HANGUL_OR_KNOWN_EN.test(v),
    "법령명은 한글로 입력해 주세요."
  ),
  articleNo: z.string().min(1).max(30).describe("예: '제89조', '제18조의3'"),
});
export type LawTextInput = z.infer<typeof lawTextInputSchema>;

/**
 * 도메인별 법제처 API 옵션 (GET 파라미터).
 * client.ts:DOMAIN_OPTION_WHITELIST 에서 도메인별 허용 키만 passthrough.
 * 모든 필드 optional — 필요 시 UI/호출자가 부분 지정.
 */
export const domainSearchOptionsSchema = z.object({
  // prec (판례)
  curt: z.string().max(20).optional(),
  caseNumber: z.string().max(50).optional(),
  fromDate: z.string().regex(/^\d{8}$/, "YYYYMMDD 형식").optional(),
  toDate: z.string().regex(/^\d{8}$/, "YYYYMMDD 형식").optional(),
  // ppc (조세심판원)
  cls: z.string().max(20).optional(),
  gana: z.string().max(5).optional(),
  dpaYd: z.string().regex(/^\d{8}$/).optional(),
  rslYd: z.string().regex(/^\d{8}$/).optional(),
  // detc, admrul
  knd: z.string().max(20).optional(),
  inq: z.string().max(50).optional(),
  rpl: z.string().max(50).optional(),
  // trty
  natCd: z.string().max(5).optional(),
  eftYd: z.string().regex(/^\d{8}$/).optional(),
  concYd: z.string().regex(/^\d{8}$/).optional(),
  // ordin
  locGov: z.string().max(10).optional(),
});
export type DomainSearchOptions = z.infer<typeof domainSearchOptionsSchema>;

export const searchDecisionsInputSchema = z.object({
  q: z.string().min(1).max(200),
  domain: z.enum(DECISION_DOMAINS).default("prec"),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  options: domainSearchOptionsSchema.optional(),
});
export type SearchDecisionsInput = z.infer<typeof searchDecisionsInputSchema>;

/** 페이지네이션이 적용된 판례·결정례 검색 결과 */
export interface DecisionSearchPage {
  items: DecisionSearchItem[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export const decisionTextInputSchema = z.object({
  id: z.string().min(1).max(50),
  domain: z.enum(DECISION_DOMAINS).default("prec"),
  /** "true" 또는 "1"이면 전문 그대로, 그 외(기본)는 계단식 축약 */
  full: z
    .string()
    .optional()
    .transform((v) => v === "true" || v === "1"),
});
export type DecisionTextInput = z.infer<typeof decisionTextInputSchema>;

export const annexesInputSchema = z.object({
  lawName: z.string().min(1).max(100),
});
export type AnnexesInput = z.infer<typeof annexesInputSchema>;

/** 체인 입력: type별 params는 공통 (query + 보조 필드) */
export const chainInputSchema = z.object({
  type: z.enum(CHAIN_TYPES),
  query: z.string().min(1).max(500),
  /** document_review 용: 사용자 입력 원문 */
  rawText: z.string().optional(),
});
export type ChainInput = z.infer<typeof chainInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 5. 에러 envelope
// ────────────────────────────────────────────────────────────────────────────

export interface LawApiErrorEnvelope {
  error: string;
  code?: "API_KEY_MISSING" | "VALIDATION" | "RATE_LIMIT" | "UPSTREAM" | "NOT_FOUND";
}
