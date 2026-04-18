/**
 * 한국 법령·판례 리서치 클라이언트 (법제처 Open API 래퍼)
 *
 * 기존 lib/legal-verification/korean-law-client.ts 를 기반으로 확장:
 *  - 법령 검색·조문은 기존 구현 재사용 (별칭 해석 포함)
 *  - 판례/결정례 검색·본문 조회 (17 domain)
 *  - 별표·서식 목록 조회 (Phase 1: 메타데이터만)
 *
 * 캐시: 기존 `.legal-cache/` 파일 캐시 + 7일 TTL 재사용.
 *
 * API 문서: https://www.law.go.kr/LSW/openApiInfo.do
 */

import fs from "fs/promises";
import path from "path";
import {
  searchLaw as searchLawInternal,
  fetchArticle,
  type LawSearchResult,
  type LawArticle,
} from "@/lib/legal-verification/korean-law-client";
import { resolveLawAlias } from "./aliases";
import {
  normalizeLawSearchText,
  stripNonLawKeywords,
  scoreLawRelevance,
  extractLawNames,
  expandTaxKeywords,
} from "./search-normalizer";
import {
  fetchWithRetry,
  maskSensitiveUrl,
  checkHtmlError,
} from "./fetch-with-retry";
import {
  compactBody,
  densifyLawRefs,
  densifyPrecedentRefs,
  stripRepeatedSummary,
  cleanHtml,
} from "./compact";
import { parseLawRefs, parsePrecedentRefs } from "./parsers/ref-parser";
import type {
  LawSearchItem,
  LawArticleResult,
  DecisionSearchItem,
  DecisionSearchPage,
  DecisionText,
  DecisionDomain,
  AnnexItem,
} from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 공통 상수
// ────────────────────────────────────────────────────────────────────────────

const API_BASE = "https://www.law.go.kr/DRF";
const CACHE_DIR = path.resolve(process.cwd(), ".legal-cache");
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ────────────────────────────────────────────────────────────────────────────
// 내부 유틸 (기존 구현에서 private이므로 동등 로직 복제)
// ────────────────────────────────────────────────────────────────────────────

function getApiKey(): string {
  const key = process.env.KOREAN_LAW_OC ?? "";
  if (!key) {
    throw new LawApiError(
      "법제처 Open API 키(OC)가 설정되지 않았습니다. .env.local 에 KOREAN_LAW_OC=... 를 추가하세요.",
      "API_KEY_MISSING"
    );
  }
  return key;
}

export type LawApiErrorCode =
  | "API_KEY_MISSING"
  | "UPSTREAM"
  | "NOT_FOUND"
  | "PARSE";

export class LawApiError extends Error {
  code: LawApiErrorCode;
  constructor(message: string, code: LawApiErrorCode) {
    super(message);
    this.name = "LawApiError";
    this.code = code;
  }
}

async function fetchJson<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const oc = getApiKey();
  const qs = new URLSearchParams({ OC: oc, ...params, type: "JSON" }).toString();
  const url = `${API_BASE}/${endpoint}?${qs}`;
  let res: Response;
  try {
    res = await fetchWithRetry(url, {
      timeout: 30_000,
      retries: 3,
      baseDelay: 1_000,
      retryOn: [429, 503, 504],
    });
  } catch (err) {
    // URL 마스킹은 fetchWithRetry 가 이미 처리한 에러 메시지 사용
    throw new LawApiError(
      err instanceof Error ? err.message : `법제처 API 호출 실패`,
      "UPSTREAM"
    );
  }
  if (!res.ok) {
    throw new LawApiError(
      `법제처 API 오류 (${res.status}) — ${maskSensitiveUrl(url)}`,
      "UPSTREAM"
    );
  }

  // 일부 오류 응답은 Content-Type 이 JSON인데도 HTML 본문을 돌려주는 케이스가 있음
  const bodyText = await res.text();
  if (checkHtmlError(bodyText)) {
    throw new LawApiError(
      `법제처 API가 HTML 오류 페이지를 반환했습니다 (파라미터 오류 가능) — ${maskSensitiveUrl(url)}`,
      "UPSTREAM"
    );
  }

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(bodyText) as Record<string, unknown>;
  } catch (parseErr) {
    throw new LawApiError(
      `법제처 응답 파싱 실패: ${
        parseErr instanceof Error ? parseErr.message : "JSON parse error"
      }`,
      "UPSTREAM"
    );
  }
  if (typeof json["result"] === "string" && json["result"].includes("실패")) {
    throw new LawApiError(`법제처 API 인증 오류: ${json["result"]}`, "UPSTREAM");
  }
  return json as T;
}

function safeCacheKey(str: string): string {
  return str.replace(/[^a-zA-Z0-9가-힣_-]/g, "_");
}

async function readCache<T>(key: string): Promise<T | null> {
  const file = path.join(CACHE_DIR, `${key}.json`);
  try {
    const stat = await fs.stat(file);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await fs.readFile(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, data: unknown): Promise<void> {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2), "utf-8");
}

function strip(raw: string): string {
  return raw.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * 법제처 API는 XML→JSON 변환 시 결과가 1건이면 배열 대신 단일 객체를,
 * 0건이면 undefined를 반환한다. 항상 배열로 정규화.
 */
function toArray<T>(val: T | T[] | undefined | null): T[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

// ────────────────────────────────────────────────────────────────────────────
// 1. 법령 검색
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법령명(약칭 허용) 검색.
 * 기존 내부 `searchLaw`는 단건만 반환하므로 상위 N개가 필요한 경우 `searchLawMany`를 사용.
 */
export async function searchLaw(lawName: string): Promise<LawSearchItem | null> {
  const resolved = resolveLawAlias(lawName);
  const result = await searchLawInternal(resolved);
  if (!result) return null;
  return mapLawSearchResult(result);
}

/**
 * 법제처 법령 검색 정렬 옵션.
 *   - "relevance" (기본): 관련도 점수(우리 구현) 기준
 *   - "promulgation_desc": 공포일자 내림차순 (최신법령 우선)
 *   - "promulgation_asc": 공포일자 오름차순
 */
export type LawSearchSort = "relevance" | "promulgation_desc" | "promulgation_asc";

export async function searchLawMany(
  query: string,
  limit = 5,
  options: {
    mode?: "name" | "fallback" | "content";
    sort?: LawSearchSort;
    ancYd?: string; // YYYYMMDD~YYYYMMDD (공포일 범위)
    efYd?: string;  // YYYYMMDD~YYYYMMDD (시행일 범위)
  } = {}
): Promise<LawSearchItem[]> {
  const mode = options.mode ?? "fallback";
  const sort = options.sort ?? "relevance";
  // 1) 검색어 전처리: NFC·특수공백·한글 오타 복원
  const normalized = normalizeLawSearchText(query);
  // 2) 약칭 해석
  const resolved = resolveLawAlias(normalized);
  const sortKey = sort !== "relevance" ? `_${sort}` : "";
  const ancKey = options.ancYd ? `_anc${options.ancYd}` : "";
  const efKey = options.efYd ? `_ef${options.efYd}` : "";
  const cacheKey = `search_many_${safeCacheKey(resolved)}_${limit}_${mode}${sortKey}${ancKey}${efKey}`;
  const cached = await readCache<LawSearchItem[]>(cacheKey);
  if (cached) return cached;

  // 3) 4단계 검색 (MCP law-search.ts 패턴 이식 + 세법 키워드 확장)
  //    a. 원본(해석) 쿼리로 법령명 검색
  //    b. 실패 시 부가 키워드 제거한 버전으로 재검색 (stripNonLawKeywords)
  //    c. 실패 시 extractLawNames 로 쿼리에서 법령명만 직접 추출해 각각 검색
  //    d. 실패 시 본문 검색 (search=2)로 fallback
  const searchDisplay = Math.max(limit, 20);
  let entries = mode === "content" ? [] : await doLawNameSearch(resolved, searchDisplay, "1");

  if (entries.length === 0 && mode !== "content") {
    const stripped = stripNonLawKeywords(resolved);
    if (stripped && stripped !== resolved && stripped.length >= 2) {
      entries = await doLawNameSearch(stripped, searchDisplay, "1");
    }
  }

  // 2.5단계: 쿼리 내 법령명 직접 추출 (stripNonLawKeywords가 과도 제거한 경우 복구)
  if (entries.length === 0 && mode !== "content") {
    const lawNames = extractLawNames(resolved);
    if (lawNames.length > 0) {
      // 여러 법령명이 있으면 각각 검색 후 합치기 (dedupe)
      const collected: LawSearchItem[] = [];
      for (const name of lawNames.slice(0, 3)) {
        const partial = await doLawNameSearch(name, Math.min(searchDisplay, 10), "1");
        collected.push(...partial);
      }
      // mst 중복 제거
      const seen = new Set<string>();
      entries = collected.filter((e) => {
        if (seen.has(e.mst)) return false;
        seen.add(e.mst);
        return true;
      });
    }
  }

  // 3단계: 세법 키워드 확장 (alias → 정식명)
  if (entries.length === 0 && mode !== "content") {
    const expansions = expandTaxKeywords(resolved);
    // expansions[0] 은 원본이므로 인덱스 1부터 시도
    for (const q of expansions.slice(1, 4)) {
      const partial = await doLawNameSearch(q, searchDisplay, "1");
      if (partial.length > 0) {
        entries = partial;
        break;
      }
    }
  }

  if (entries.length === 0 && (mode === "fallback" || mode === "content")) {
    entries = await doLawNameSearch(resolved, searchDisplay, "2");
  }

  // 4) 정렬 — sort 옵션에 따라
  if (entries.length > 1) {
    if (sort === "promulgation_desc") {
      entries.sort((a, b) => (b.promulgationDate ?? "").localeCompare(a.promulgationDate ?? ""));
    } else if (sort === "promulgation_asc") {
      entries.sort((a, b) => (a.promulgationDate ?? "").localeCompare(b.promulgationDate ?? ""));
    } else {
      // relevance: 관련도 점수 재정렬 — "민법" 검색 시 "난민법" 우선 방지
      const queryWords = resolved.split(/\s+/).filter((w) => w.length > 0);
      entries.sort((a, b) => {
        const sA = scoreLawRelevance(a.lawName, resolved, queryWords);
        const sB = scoreLawRelevance(b.lawName, resolved, queryWords);
        if (sB !== sA) return sB - sA;
        return (b.promulgationDate ?? "").localeCompare(a.promulgationDate ?? "");
      });
    }
  }

  // 5) 공포일·시행일 범위 필터 (법제처 API는 이 필터 미지원이므로 클라이언트 측 필터)
  let filtered = entries;
  if (options.ancYd) {
    const [from, to] = parseDateRange8(options.ancYd);
    filtered = filtered.filter((e) => {
      const d = (e.promulgationDate ?? "").replace(/-/g, "");
      return (!from || d >= from) && (!to || d <= to);
    });
  }

  const results = filtered.slice(0, limit);
  await writeCache(cacheKey, results);
  return results;
}

async function doLawNameSearch(
  query: string,
  display: number,
  search: "1" | "2"
): Promise<LawSearchItem[]> {
  type LawEntry = {
    법령명한글: string;
    법령ID: string;
    법령일련번호: string;
    공포일자: string;
  };
  const data = await fetchJson<{
    LawSearch?: { law?: LawEntry | LawEntry[] };
  }>("lawSearch.do", {
    target: "law",
    query,
    search,
    display: String(display),
  });
  const laws = toArray(data.LawSearch?.law);
  return laws.map((l) => ({
    lawName: l.법령명한글,
    lawId: l.법령ID,
    mst: l.법령일련번호,
    promulgationDate: l.공포일자,
  }));
}

/**
 * "YYYYMMDD~YYYYMMDD" 또는 "YYYYMMDD-YYYYMMDD" 또는 "YYYYMMDD,YYYYMMDD" → [from, to].
 * 단일 값이면 from만, 빈 값은 undefined.
 */
function parseDateRange8(input: string): [string | undefined, string | undefined] {
  if (!input) return [undefined, undefined];
  const parts = input.split(/[~\-,\s]+/).map((s) => s.trim()).filter(Boolean);
  const isValid = (s: string) => /^\d{8}$/.test(s);
  const from = parts[0] && isValid(parts[0]) ? parts[0] : undefined;
  const to = parts[1] && isValid(parts[1]) ? parts[1] : undefined;
  return [from, to];
}

function mapLawSearchResult(r: LawSearchResult): LawSearchItem {
  return {
    lawName: r.lawName,
    lawId: r.lawId,
    mst: r.mst,
    promulgationDate: r.promulgationDate,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// 2. 조문 본문 조회
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법령명 + 조문번호로 조문 본문 조회.
 * 내부적으로 searchLaw → fetchArticle 순으로 호출.
 */
export async function getLawText(
  lawName: string,
  articleNo: string
): Promise<LawArticleResult | null> {
  const meta = await searchLawSafe(lawName);
  if (!meta) return null;
  const normalizedArticleNo = normalizeArticleNo(articleNo);
  let article: LawArticle | null = null;
  try {
    article = await fetchArticle(meta.mst, meta.lawName, normalizedArticleNo);
  } catch (err) {
    // 기존 legacy 클라이언트는 plain Error를 던지므로 LawApiError로 래핑.
    throw new LawApiError(
      err instanceof Error
        ? `조문 조회 실패: ${err.message}`
        : "조문 조회 중 알 수 없는 오류가 발생했습니다.",
      "UPSTREAM"
    );
  }
  if (!article) return null;
  return {
    title: article.title,
    fullText: article.fullText,
    lawName: article.lawName,
    articleNo: article.articleNo,
    sourceUrl: buildLawSourceUrl(article.lawName, article.articleNo),
  };
}

/** searchLaw를 LawApiError로 래핑 */
async function searchLawSafe(lawName: string): Promise<LawSearchItem | null> {
  try {
    return await searchLaw(lawName);
  } catch (err) {
    throw new LawApiError(
      err instanceof Error ? `법령 검색 실패: ${err.message}` : "법령 검색 오류",
      "UPSTREAM"
    );
  }
}

/**
 * 법제처 법령·조문 직접 링크 URL 생성.
 * 법제처 리뉴얼 후 안정적으로 동작하는 경로 기반 URL 사용.
 *   https://www.law.go.kr/법령/{법령명}/{조문}
 */
export function buildLawSourceUrl(lawName: string, articleNo?: string): string {
  const base = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`;
  return articleNo ? `${base}/${encodeURIComponent(articleNo)}` : base;
}

/**
 * 판례·결정례 원문 URL 생성. 도메인별 법제처 페이지가 달라 매핑.
 * 실패 시 법제처 검색 페이지로 폴백.
 */
export function buildDecisionSourceUrl(domain: DecisionDomain, id: string): string {
  switch (domain) {
    case "prec":
      return `https://www.law.go.kr/판례/(${encodeURIComponent(id)})`;
    case "detc":
      return `https://www.law.go.kr/법령해석례/(${encodeURIComponent(id)})`;
    case "expc":
      return `https://www.law.go.kr/헌재결정례/(${encodeURIComponent(id)})`;
    case "admrul":
      return `https://www.law.go.kr/행정규칙/(${encodeURIComponent(id)})`;
    default:
      return `https://www.law.go.kr/LSW/lsScListR.do?query=${encodeURIComponent(id)}`;
  }
}

/**
 * 사용자 입력 조문번호를 법제처 내부 포맷 "제N조[의M]" 으로 정규화.
 *
 * 허용 입력 예:
 *   "21"        → "제21조"
 *   "21조"      → "제21조"
 *   "제21조"    → "제21조"
 *   "21의2"     → "제21조의2"
 *   "21조의2"   → "제21조의2"
 *   "제21조의2" → "제21조의2"
 *   "제 21 조"  → "제21조"   (공백 제거)
 */
export function normalizeArticleNo(input: string): string {
  const trimmed = input.replace(/\s/g, "");
  if (!trimmed) return trimmed;

  // 이미 "제N조[의M]" 형식이면 그대로
  if (/^제\d+조(의\d+)?$/.test(trimmed)) return trimmed;

  // 숫자(+의M) 패턴 추출
  const m = trimmed.match(/^제?(\d+)(?:조)?(의\d+)?$/);
  if (!m) return trimmed; // 파싱 실패 시 원문 그대로 (호출부에서 not-found 처리)

  const main = m[1];
  const suffix = m[2] ?? "";
  return `제${main}조${suffix}`;
}

// ────────────────────────────────────────────────────────────────────────────
// 3. 판례/결정례 검색
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법제처 Open API 검색 엔드포인트의 도메인별 응답 스키마 차이를 흡수.
 * 검색 응답은 target에 따라 최상위 키가 다르다 (예: PrecSearch, DetcSearch).
 */
interface GenericSearchEntry {
  // ID 필드 (도메인별 이름 상이)
  판례일련번호?: string;
  판례정보일련번호?: string;
  법령해석례일련번호?: string;
  행정규칙일련번호?: string;
  결정례일련번호?: string;
  헌재결정례일련번호?: string;
  결정문일련번호?: string;
  재결일련번호?: string;
  심판일련번호?: string;
  일련번호?: string;
  // 날짜 필드
  결정일?: string;
  선고일자?: string;
  판결일?: string;
  회신일자?: string;
  시행일자?: string;
  발령일자?: string;
  종국일자?: string;
  종국일?: string;
  의결일?: string;
  재결일?: string;
  결정일자?: string;
  공포일자?: string;
  // 사건·번호 필드
  사건번호?: string;
  결정번호?: string;
  안건번호?: string;
  발령번호?: string;
  // 제목 필드
  사건명?: string;
  제목?: string;
  사건내용?: string;
  안건명?: string;
  행정규칙명?: string;
  자치법규명?: string;
  법령명?: string;
  조약명?: string;
  // 기관·법원 필드
  법원명?: string;
  기관명?: string;
  결정기관?: string;
  회신기관명?: string;
  질의기관명?: string;
  소관부처명?: string;
  // 출처
  데이터출처명?: string;
}

/**
 * 법제처 Open API 도메인별 실제 응답 구조.
 * 실측 기반 (2026-04-18 기준). 도메인마다 루트/리스트 키 이름·대소문자가 상이.
 */
const DOMAIN_RESPONSE_KEY: Record<DecisionDomain, { root: string; list: string }> = {
  prec:     { root: "PrecSearch",     list: "prec" },
  detc:     { root: "DetcSearch",     list: "Detc" },   // 대문자 D
  expc:     { root: "Expc",           list: "expc" },
  admrul:   { root: "AdmRulSearch",   list: "admrul" },
  ppc:      { root: "Ppc",            list: "ppc" },
  fsc:      { root: "Fsc",            list: "fsc" },
  ftc:      { root: "Ftc",            list: "ftc" },
  nlrc:     { root: "Nlrc",           list: "nlrc" },
  kcc:      { root: "Kcc",            list: "kcc" },
  pipc:     { root: "PipcSearch",     list: "pipc" },
  oia:      { root: "OiaSearch",      list: "oia" },
  acr:      { root: "Acr",            list: "acr" },
  ordin:    { root: "OrdinSearch",    list: "law" },    // !! 리스트 키가 "law"
  public:   { root: "PublicSearch",   list: "public" },
  nhrc:     { root: "NhrcSearch",     list: "nhrc" },
  trty:     { root: "TrtySearch",     list: "trty" },
  lawnkor:  { root: "LawNkorSearch",  list: "lawnkor" },
};

/** 검색 응답 container에서 메타데이터 필드명 (리스트로 간주 금지) */
const CONTAINER_META_KEYS = new Set([
  "키워드",
  "page",
  "target",
  "totalCnt",
  "section",
  "resultCode",
  "resultMsg",
  "numOfRows",
]);

/**
 * 도메인별 법제처 API 옵션 passthrough.
 *
 * 법제처 lawSearch.do 는 target(도메인)에 따라 추가 필터 파라미터를 지원한다.
 * upstream korean-law-mcp 는 options 객체를 reserved key 필터링 후 머지하는 방식.
 *
 * 지원 옵션:
 *   prec (판례)       : curt(법원), caseNumber(사건번호), fromDate/toDate(선고일 범위 YYYYMMDD)
 *   ppc  (조세심판원) : cls(분류), gana(가나다순), dpaYd(처분일), rslYd(결정일)
 *   detc (법령해석례) : knd(종류), inq(질의기관), rpl(회신기관)
 *   expc (헌재결정례) : caseNumber, fromDate/toDate
 *   admrul (행정규칙) : knd(종류)
 *   trty (조약)       : cls(분류), natCd(국가코드), eftYd(발효일), concYd(체결일)
 *   ordin (자치법규)  : locGov(광역/기초자치단체코드)
 *
 * 그 외 도메인은 options 무시.
 */
export interface DomainSearchOptions {
  // prec
  curt?: string;
  caseNumber?: string;
  fromDate?: string;
  toDate?: string;
  // ppc
  cls?: string;
  gana?: string;
  dpaYd?: string;
  rslYd?: string;
  // detc, admrul
  knd?: string;
  inq?: string;
  rpl?: string;
  // trty
  natCd?: string;
  eftYd?: string;
  concYd?: string;
  // ordin
  locGov?: string;
}

/** 각 도메인이 받는 options 키 whitelist — 다른 키는 API 호출에서 drop */
const DOMAIN_OPTION_WHITELIST: Record<DecisionDomain, ReadonlyArray<keyof DomainSearchOptions>> = {
  prec:     ["curt", "caseNumber", "fromDate", "toDate"],
  ppc:      ["cls", "gana", "dpaYd", "rslYd"],
  detc:     ["knd", "inq", "rpl"],
  expc:     ["caseNumber", "fromDate", "toDate"],
  admrul:   ["knd"],
  trty:     ["cls", "natCd", "eftYd", "concYd"],
  ordin:    ["locGov"],
  fsc:      [],
  ftc:      [],
  nlrc:     [],
  kcc:      [],
  pipc:     [],
  oia:      [],
  acr:      [],
  public:   [],
  nhrc:     [],
  lawnkor:  [],
};

/**
 * 주어진 options 에서 해당 도메인이 허용하는 키만 추출해 API 파라미터로 변환.
 * 빈 문자열·undefined 값은 제외.
 */
function buildDomainParams(
  domain: DecisionDomain,
  options: DomainSearchOptions = {}
): Record<string, string> {
  const allowed = DOMAIN_OPTION_WHITELIST[domain];
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const v = options[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      out[key] = String(v);
    }
  }
  return out;
}

export async function searchDecisions(
  query: string,
  domain: DecisionDomain = "prec",
  page = 1,
  pageSize = 10,
  options: DomainSearchOptions = {}
): Promise<DecisionSearchPage> {
  const extraParams = buildDomainParams(domain, options);
  // 캐시 키: options 정렬 문자열 포함 (동일 옵션 재사용 시 캐시 hit)
  const optionsKey = Object.keys(extraParams)
    .sort()
    .map((k) => `${k}=${extraParams[k]}`)
    .join("&");
  const optionsSuffix = optionsKey ? `_${safeCacheKey(optionsKey)}` : "";
  const cacheKey = `decision_search_${domain}_${safeCacheKey(query)}_p${page}_s${pageSize}${optionsSuffix}`;
  const cached = await readCache<DecisionSearchPage>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<Record<string, unknown>>("lawSearch.do", {
    target: domain,
    query,
    display: String(pageSize),
    page: String(page),
    ...extraParams,
  });

  // 법제처 판례·결정례 응답은 도메인별로 루트 키 이름·대소문자가 상이.
  // (1) 매핑된 이름 → 대소문자 변형 → 도메인 이름 유도 순으로 루트 탐색.
  const { root, list } = DOMAIN_RESPONSE_KEY[domain];
  const rootCandidates = [
    root,
    root.toLowerCase(),
    root.toUpperCase(),
    `${domain}Search`,
    `${domain.charAt(0).toUpperCase()}${domain.slice(1)}Search`,
    // 루트가 단순 도메인명인 경우 (예: Expc, Ppc)
    `${domain.charAt(0).toUpperCase()}${domain.slice(1)}`,
  ];
  let container: Record<string, unknown> = {};
  for (const k of rootCandidates) {
    if (data[k] && typeof data[k] === "object") {
      container = data[k] as Record<string, unknown>;
      break;
    }
  }

  // (2) 리스트 값 탐색: 매핑된 키 → 대소문자 변형 → 메타 제외 첫 list-like 값
  let rawList =
    container[list] ??
    container[list.toLowerCase()] ??
    container[list.charAt(0).toUpperCase() + list.slice(1)] ??
    data[list];

  if (!rawList) {
    // fallback: container에서 meta 키를 제외하고 배열/객체 값을 가진 첫 항목
    for (const [k, v] of Object.entries(container)) {
      if (CONTAINER_META_KEYS.has(k)) continue;
      if (Array.isArray(v) || (v && typeof v === "object")) {
        rawList = v;
        break;
      }
    }
  }

  const entries: GenericSearchEntry[] = toArray(
    rawList as GenericSearchEntry | GenericSearchEntry[] | undefined
  );

  if (process.env.NODE_ENV !== "production" && entries.length === 0) {
    const topLevelKeys = Object.keys(data);
    console.warn(
      `[korean-law] searchDecisions(${domain}, "${query}"): 결과 0건. 응답 최상위 키:`,
      topLevelKeys
    );
  }

  const items: DecisionSearchItem[] = entries.map((e) => ({
    id:
      e.판례일련번호 ??
      e.판례정보일련번호 ??
      e.법령해석례일련번호 ??
      e.행정규칙일련번호 ??
      e.결정례일련번호 ??
      e.헌재결정례일련번호 ??
      e.결정문일련번호 ??
      e.재결일련번호 ??
      e.심판일련번호 ??
      e.일련번호 ??
      "",
    domain,
    caseNo: e.사건번호 ?? e.결정번호 ?? e.안건번호 ?? e.발령번호 ?? "",
    title: strip(
      e.사건명 ??
      e.제목 ??
      e.안건명 ??
      e.행정규칙명 ??
      e.자치법규명 ??
      e.법령명 ??
      e.조약명 ??
      e.사건내용 ??
      "(제목 없음)"
    ),
    court:
      e.법원명 ??
      e.기관명 ??
      e.결정기관 ??
      e.회신기관명 ??
      e.질의기관명 ??
      e.소관부처명 ??
      "",
    date:
      e.선고일자 ??
      e.결정일 ??
      e.판결일 ??
      e.회신일자 ??
      e.시행일자 ??
      e.발령일자 ??
      e.종국일자 ??
      e.종국일 ??
      e.의결일 ??
      e.재결일 ??
      e.결정일자 ??
      e.공포일자 ??
      "",
    source: e.데이터출처명,
  }));

  // 법제처 API 총건수: 루트 컨테이너 또는 최상위에 totalCnt / totalCount / 총건수 형태
  const totalCountRaw =
    (container.totalCnt as string | number | undefined) ??
    (container.totalCount as string | number | undefined) ??
    (container["총건수"] as string | number | undefined) ??
    (data.totalCnt as string | number | undefined) ??
    items.length;
  const totalCount = Number(totalCountRaw) || items.length;

  const result: DecisionSearchPage = { items, totalCount, page, pageSize };
  await writeCache(cacheKey, result);
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// 4. 판례/결정례 본문 조회
// ────────────────────────────────────────────────────────────────────────────

interface GenericDecisionDetail {
  판시사항?: string;
  판결요지?: string;
  주문?: string;
  이유?: string;
  판례내용?: string;
  판결본문?: string;
  결정문?: string;
  전문?: string;
  본문?: string;
  내용?: string;
  사건명?: string;
  제목?: string;
  안건명?: string;
  행정규칙명?: string;
  자치법규명?: string;
  사건번호?: string;
  결정번호?: string;
  안건번호?: string;
  법원명?: string;
  기관명?: string;
  결정기관?: string;
  회신기관명?: string;
  질의기관명?: string;
  소관부처명?: string;
  선고일자?: string;
  결정일?: string;
  판결일?: string;
  회신일자?: string;
  시행일자?: string;
  // MCP 이식: 참조 정보·유형
  참조조문?: string;
  참조판례?: string;
  사건종류명?: string;
  판결유형?: string;
  데이터출처명?: string;
  [key: string]: unknown;
}

export async function getDecisionText(
  id: string,
  domain: DecisionDomain = "prec",
  options: { full?: boolean } = {}
): Promise<DecisionText | null> {
  const full = options.full ?? false;
  // v2: 구조화 필드(refLawsStructured, refPrecedentsStructured, ruling) 추가로 캐시 포맷 변경
  // 기존 v1 캐시 파일은 그대로 유지 (무중단) + v2 suffix로 새 포맷 저장
  const cacheKey = `decision_text_${domain}_${id}_${full ? "full" : "comp"}_v2`;
  const cached = await readCache<DecisionText>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<Record<string, unknown>>("lawService.do", {
    target: domain,
    ID: id,
  });

  // 법제처 업스트림 에러 감지: {"Law": "일치하는 판례가 없습니다..."} 형태
  const lawMsg = typeof data.Law === "string" ? data.Law : null;
  if (lawMsg && /일치하는.*없|확인하여 주십시오/.test(lawMsg)) {
    return {
      id,
      domain,
      caseNo: "",
      title: "(본문 제공 불가)",
      holdings: "",
      reasoning:
        "법제처 Open API가 이 결정의 본문을 JSON으로 제공하지 않습니다. " +
        "대부분 '국세법령정보시스템'·하급심 출처 판례가 해당되며, 아래 법제처 원문 링크에서 직접 확인할 수 있습니다.",
      court: "",
      date: "",
      sourceUrl: buildDecisionSourceUrl(domain, id),
    };
  }

  // 루트 컨테이너 탐색: Service → Search → 최상위 → 도메인 리스트(배열의 첫 원소)
  const rootSearch = DOMAIN_RESPONSE_KEY[domain].root;
  const rootService = rootSearch.replace("Search", "Service");
  const list = DOMAIN_RESPONSE_KEY[domain].list;
  const candidates = [
    data[rootService],
    data[rootService.toLowerCase()],
    data[rootSearch],
    data[rootSearch.toLowerCase()],
    // 일부 도메인은 최상위가 바로 리스트(배열)인 경우 → 첫 원소 사용
    Array.isArray(data[list]) ? (data[list] as unknown[])[0] : data[list],
    // 최상위 자체가 상세 객체인 경우
    data,
  ];
  const container = candidates.find(
    (c) => c && typeof c === "object" && !Array.isArray(c)
  ) as GenericDecisionDetail | undefined;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[korean-law] getDecisionText(${domain}, ${id}) — 응답 최상위 키:`,
      Object.keys(data),
      container ? `container 키: ${Object.keys(container).slice(0, 15).join(", ")}` : "container 없음"
    );
  }

  if (!container) return null;

  // MCP 이식: 판시사항·판결요지·이유·참조를 모두 별개 필드로 분리 추출
  const holdingsRaw = container.판시사항 ?? "";
  const summaryRaw = container.판결요지 ?? "";
  const holdRulingRaw = container.주문 ?? "";
  const reasoningRaw =
    container.이유 ??
    container.판례내용 ??
    container.판결본문 ??
    container.결정문 ??
    container.전문 ??
    container.본문 ??
    container.내용 ??
    "";

  const holdings = cleanHtml(holdingsRaw);
  const summary = cleanHtml(summaryRaw);
  const ruling = cleanHtml(holdRulingRaw);

  // 전문에 판시/판결요지가 반복되면 제거 → LLM·사용자 중복 소비 방지
  let reasoning = stripRepeatedSummary(cleanHtml(reasoningRaw), [holdings, summary, ruling]);

  // 본문 계단식 축약 (full=false 기본)
  const beforeCompact = reasoning.length;
  reasoning = compactBody(reasoning, { full });
  const compacted = beforeCompact > 0 && reasoning.length < beforeCompact;

  // 알려진 필드 모두 비었으면 컨테이너에서 가장 긴 문자열을 본문으로 사용
  if (!holdings && !summary && !reasoning) {
    const longest = findLongestString(container);
    if (longest) {
      reasoning = cleanHtml(longest);
    }
  }

  const refLawsRaw = container.참조조문 ?? "";
  const refPrecRaw = container.참조판례 ?? "";

  // v2: 참조조문·참조판례 구조화 배열 생성 (원본 문자열도 병행 반환)
  const refLawsCleaned = refLawsRaw ? cleanHtml(refLawsRaw) : "";
  const refPrecCleaned = refPrecRaw ? cleanHtml(refPrecRaw) : "";
  const refLawsStructured = refLawsCleaned ? parseLawRefs(refLawsCleaned) : undefined;
  const refPrecedentsStructured = refPrecCleaned ? parsePrecedentRefs(refPrecCleaned) : undefined;

  const result: DecisionText = {
    id,
    domain,
    caseNo: container.사건번호 ?? container.결정번호 ?? container.안건번호 ?? "",
    title: cleanHtml(
      container.사건명 ??
        container.제목 ??
        container.안건명 ??
        container.행정규칙명 ??
        container.자치법규명 ??
        "(제목 없음)"
    ),
    holdings,
    summary: summary || undefined,
    ruling: ruling || undefined,
    reasoning,
    refLaws: refLawsCleaned ? densifyLawRefs(refLawsCleaned) : undefined,
    refPrecedents: refPrecCleaned ? densifyPrecedentRefs(refPrecCleaned) : undefined,
    refLawsStructured: refLawsStructured && refLawsStructured.length > 0 ? refLawsStructured : undefined,
    refPrecedentsStructured:
      refPrecedentsStructured && refPrecedentsStructured.length > 0 ? refPrecedentsStructured : undefined,
    caseType: container.사건종류명 || undefined,
    judgmentType: container.판결유형 || undefined,
    court:
      container.법원명 ??
      container.기관명 ??
      container.결정기관 ??
      container.회신기관명 ??
      container.질의기관명 ??
      container.소관부처명 ??
      "",
    date:
      container.선고일자 ??
      container.결정일 ??
      container.판결일 ??
      container.회신일자 ??
      container.시행일자 ??
      "",
    sourceUrl: buildDecisionSourceUrl(domain, id),
    compacted,
  };

  const hasAnyContent =
    result.holdings || result.summary || result.reasoning || result.caseNo || result.title !== "(제목 없음)";
  if (!hasAnyContent) {
    return null;
  }

  if (!result.holdings && !result.summary && !result.reasoning) {
    result.reasoning = "본문이 제공되지 않는 결정입니다. 아래 법제처 원문 링크에서 확인하세요.";
  }

  await writeCache(cacheKey, result);
  return result;
}

/**
 * 객체의 모든 문자열 필드 중 가장 긴 값을 찾는다.
 * 알려진 필드명이 모두 빈 경우의 폴백.
 */
function findLongestString(obj: Record<string, unknown>): string | null {
  let longest = "";
  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.length > longest.length) {
      longest = value;
    }
  }
  return longest.length >= 20 ? longest : null;
}

// ────────────────────────────────────────────────────────────────────────────
// 5. 별표·서식 목록 (Phase 1: 메타데이터만)
// ────────────────────────────────────────────────────────────────────────────

type AnnexRawUnit = {
  별표번호?: string;
  별표제목?: string;
  별표서식파일링크?: string;
};

interface LawServiceRawResponse {
  법령?: {
    별표?: {
      별표단위?: AnnexRawUnit | AnnexRawUnit[];
    };
  };
}

export async function getAnnexes(lawName: string): Promise<AnnexItem[]> {
  const meta = await searchLaw(lawName);
  if (!meta) return [];

  const cacheKey = `annex_${meta.mst}`;
  const cached = await readCache<AnnexItem[]>(cacheKey);
  if (cached) return cached;

  const data = await fetchJson<LawServiceRawResponse>("lawService.do", {
    target: "law",
    MST: meta.mst,
  });
  const units = toArray(data.법령?.별표?.별표단위);
  const results: AnnexItem[] = units.map((u) => ({
    annexNo: u.별표번호 ?? "",
    title: strip(u.별표제목 ?? ""),
    fileType: inferFileType(u.별표서식파일링크),
    downloadUrl: u.별표서식파일링크
      ? `https://www.law.go.kr${u.별표서식파일링크.startsWith("/") ? "" : "/"}${u.별표서식파일링크}`
      : undefined,
  }));
  await writeCache(cacheKey, results);
  return results;
}

function inferFileType(link?: string): string | undefined {
  if (!link) return undefined;
  const m = link.match(/\.(hwpx?|pdf|xlsx?|docx?)(?:$|\?)/i);
  return m ? m[1].toUpperCase() : undefined;
}

// ────────────────────────────────────────────────────────────────────────────
// Re-exports (외부 모듈이 단일 진입점으로 사용)
// ────────────────────────────────────────────────────────────────────────────

export { resolveLawAlias, isAlias } from "./aliases";
export type {
  LawSearchItem,
  LawArticleResult,
  DecisionSearchItem,
  DecisionText,
  DecisionDomain,
  AnnexItem,
} from "./types";
