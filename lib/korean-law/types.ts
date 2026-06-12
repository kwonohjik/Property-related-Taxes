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
  /**
   * @deprecated 구조화 필드 `refLawsStructured` 를 우선 사용하세요.
   * 구조화 파싱이 실패했을 때만 폴백 렌더용으로 채워집니다.
   */
  refLaws?: string;
  /**
   * @deprecated 구조화 필드 `refPrecedentsStructured` 를 우선 사용하세요.
   * 구조화 파싱이 실패했을 때만 폴백 렌더용으로 채워집니다.
   */
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
  | "verify_citations"
  | "applicable_law"
  | "impact_map";

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
  /**
   * 법령 MST — UI 가 `/api/law/annex-content` 를 호출할 때 캐시 키로 활용.
   * getAnnexes() 응답에만 포함되며, 체인 섹션의 annexes 는 축약을 위해 생략 가능.
   */
  mst?: string;
}

/** 별표 본문 변환 API 응답 (`/api/law/annex-content`) */
export interface AnnexBodyResponse {
  content: string;
  truncated: boolean;
  status: "ok" | "NOT_CONVERTED";
  fileType: string;
  pageCount?: number;
  originalSize?: number;
  error?: string;
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
  kind: "laws" | "articles" | "decisions" | "annexes" | "citations" | "note" | "diff";
  heading: string;
  laws?: LawSearchItem[];
  articles?: LawArticleResult[];
  decisions?: DecisionSearchItem[];
  annexes?: AnnexItem[];
  citations?: Array<{ raw: string; valid: boolean; lawName?: string; articleNo?: string; reason?: string }>;
  note?: string;
  /** kind "diff" — 조문 신구대조 (amendment_track 체인) */
  diff?: ArticleDiff;
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
// v3 — 행위시법 판단 (applicable_law)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법령 버전 1건 — 법제처 `lawSearch.do?target=eflaw` 응답의 (MST, 시행일자) 쌍.
 * 같은 MST가 단계 시행으로 여러 시행일자 행을 가질 수 있어 쌍 단위로 다룬다.
 */
export interface LawVersionEntry {
  /** 법령일련번호 */
  mst: string;
  /** 시행일자 YYYYMMDD */
  efYd: string;
  /** 공포일자 YYYYMMDD */
  ancYd: string;
  /** 공포번호 */
  ancNo: string;
  /** 제개정구분명 (일부개정·전부개정·타법개정 등) */
  rrCls: string;
  /** 현행연혁코드 (현행 | 연혁 | 시행예정) */
  statusLabel: string;
}

/** 부칙 발췌 1건 — 특정 공포번호 부칙에서 추린 적용례·경과조치 라인 */
export interface TransitionExcerpt {
  ancNo: string;
  /** 부칙 공포일자 YYYYMMDD */
  ancYd: string;
  lines: string[];
  /**
   * 발췌 라인이 조회 조문(제N조)을 직접 언급하는지.
   * true = 해당 조문 전용 경과규정 / false = 그 밖의 일반 경과조치(참고용).
   * 세금 앱 정확성: 조문 무관 경과규정을 해당 조문에 적용되는 것처럼 오인시키지 않기 위함.
   */
  articleSpecific: boolean;
}

/** 행위시법 판단 결과 */
export interface ApplicableLawResult {
  lawName: string;
  articleNo: string;
  /** 기준일 YYYYMMDD */
  baseDate: string;
  /** 기준일에 시행 중이던 버전 */
  version: LawVersionEntry;
  /** 그 버전의 조문 본문 (조문 미존재 시 null) */
  article: { title: string; fullText: string } | null;
  /** 오늘 기준 현행 버전 (식별 실패 시 null) */
  currentVersion: LawVersionEntry | null;
  /** 적용 버전이 곧 현행 버전인지 */
  isCurrentVersion: boolean;
  /** 적용 시점 조문 본문이 현행과 동일한지 (비교 실패 시 null) */
  sameAsCurrentText: boolean | null;
  /** 기준일 이후 ~ 오늘 사이 시행된 개정 버전들 (경과규정 추적 대상) */
  laterVersions: LawVersionEntry[];
  /** 부칙 적용례·경과조치 발췌 */
  transitionExcerpts: TransitionExcerpt[];
  /** 법제처 현행 조문 링크 */
  sourceUrl: string;
}

export const applicableLawInputSchema = z.object({
  lawName: z.string().min(1).max(100).refine(
    (v) => HANGUL_OR_KNOWN_EN.test(v),
    "법령명은 한글로 입력해 주세요."
  ),
  articleNo: z.string().min(1).max(30).describe("예: '제89조', '89', '18의2'"),
  baseDate: z
    .string()
    .regex(/^\d{4}[-./]?\d{1,2}[-./]?\d{1,2}$/, "기준일 형식 오류: YYYYMMDD 또는 YYYY-MM-DD"),
});
export type ApplicableLawInput = z.infer<typeof applicableLawInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// v3 — 두 시점 신구대조 (time_travel)
// ────────────────────────────────────────────────────────────────────────────

/** 라인 단위 diff 1줄 — 추가/삭제/유지 */
export interface DiffLine {
  kind: "add" | "remove" | "keep";
  text: string;
}

/** 한 시점의 조문 스냅샷 */
export interface ArticleSnapshot {
  version: LawVersionEntry;
  title: string;
  fullText: string;
}

/** 조문 신구대조 결과 */
export interface ArticleDiff {
  lawName: string;
  articleNo: string;
  /** 이전(과거) 시점 스냅샷 — 조문 미존재 시 null */
  before: ArticleSnapshot | null;
  /** 이후(최신) 시점 스냅샷 — 조문 미존재 시 null */
  after: ArticleSnapshot | null;
  /** before → after 라인 diff */
  diff: DiffLine[];
  /** 본문이 동일한지 (둘 다 존재하고 변경 없음) */
  identical: boolean;
}

// ────────────────────────────────────────────────────────────────────────────
// v3 — 판례 생사 확인 (cite_check)
// ────────────────────────────────────────────────────────────────────────────

/** 대상 판례를 인용한 후속 판례 1건 */
export interface CitingCase {
  caseNo: string;
  title: string;
  court: string;
  date: string;
  /** 전원합의체 여부 (판례 변경은 주로 전합) */
  isEnBanc: boolean;
  /** 본문 조회용 ID */
  id: string;
  /** 대법원 등 본문 제공 출처 여부 */
  hasFullText: boolean;
}

/** 후속 판례에서 감지된 변경·폐기 신호 1건 */
export interface ChangeSignal {
  citingCaseNo: string;
  citingDate: string;
  /** 신호 유형 라벨 ("판례 변경 선언" 등) */
  label: string;
  /** 신호가 발견된 본문 발췌 */
  excerpt: string;
}

/**
 * 판례 생사 상태. 단정 금지 — "폐기됨"이 아니라 "검토 필요"의 위계.
 *   review_needed: 변경·폐기 신호 또는 미확인 전원합의체 후속 → 전문 확인 필요
 *   no_signal:     후속 인용은 있으나 신호 미감지 (현행 유지 확정은 아님)
 *   no_citations:  법제처 수록 범위 내 후속 인용 없음
 */
export type CiteCheckStatus = "review_needed" | "no_signal" | "no_citations";

export interface CiteCheckResult {
  caseNo: string;
  /** 후속 인용 총수 (하급심 포함) */
  citingCount: number;
  /** 본문까지 스캔한 대법원 판례 수 */
  scannedCount: number;
  /** 감지된 변경·폐기 신호 */
  signals: ChangeSignal[];
  /** 전원합의체이나 본문 미확보로 스캔 못한 후속 판례 (수동 확인 권장) */
  enBancUnscanned: CitingCase[];
  status: CiteCheckStatus;
}

export const citeCheckInputSchema = z.object({
  caseNo: z.string().min(1).max(50),
});
export type CiteCheckInput = z.infer<typeof citeCheckInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// v3 — 조문 영향 그래프 (impact_map)
// ────────────────────────────────────────────────────────────────────────────

/** 영향 그래프의 한 도메인 그룹 (역방향 인용) */
export interface ImpactGroup {
  domain: DecisionDomain;
  label: string;
  /** 이 조문을 본문에 인용한 결정 상위 N건 */
  items: DecisionSearchItem[];
  /** 해당 도메인 전체 인용 수 (표시 N건과 별개) */
  totalCount: number;
}

/** 조문 영향 그래프 결과 */
export interface ImpactMapResult {
  lawName: string;
  articleNo: string;
  /** 검색에 사용한 인용 표기 (예: "소득세법 제89조") */
  citationQuery: string;
  groups: ImpactGroup[];
  /** 전 도메인 합산 인용 수 */
  totalCitations: number;
}

export const impactMapInputSchema = z.object({
  lawName: z.string().min(1).max(100).refine(
    (v) => HANGUL_OR_KNOWN_EN.test(v),
    "법령명은 한글로 입력해 주세요."
  ),
  articleNo: z.string().min(1).max(30),
});
export type ImpactMapInput = z.infer<typeof impactMapInputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// 5. 에러 envelope
// ────────────────────────────────────────────────────────────────────────────

export interface LawApiErrorEnvelope {
  error: string;
  code?: "API_KEY_MISSING" | "VALIDATION" | "RATE_LIMIT" | "UPSTREAM" | "NOT_FOUND";
}
