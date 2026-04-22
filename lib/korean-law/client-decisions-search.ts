/**
 * 판례·결정례 검색 (searchDecisions)
 */

import {
  fetchJson,
  safeCacheKey,
  readCache,
  writeCache,
  strip,
  toArray,
} from "./client-core";
import type { DecisionDomain, DecisionSearchItem, DecisionSearchPage } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 법제처 API 도메인별 응답 스키마
// ────────────────────────────────────────────────────────────────────────────

interface GenericSearchEntry {
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
  사건번호?: string;
  결정번호?: string;
  안건번호?: string;
  발령번호?: string;
  사건명?: string;
  제목?: string;
  사건내용?: string;
  안건명?: string;
  행정규칙명?: string;
  자치법규명?: string;
  법령명?: string;
  조약명?: string;
  법원명?: string;
  기관명?: string;
  결정기관?: string;
  회신기관명?: string;
  질의기관명?: string;
  소관부처명?: string;
  데이터출처명?: string;
}

/**
 * 도메인별 법제처 API 응답 루트/리스트 키 매핑 (실측 기반, 2026-04-18).
 */
export const DOMAIN_RESPONSE_KEY: Record<DecisionDomain, { root: string; list: string }> = {
  prec:     { root: "PrecSearch",     list: "prec" },
  detc:     { root: "DetcSearch",     list: "Detc" },
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
  ordin:    { root: "OrdinSearch",    list: "law" },
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

// ────────────────────────────────────────────────────────────────────────────
// 도메인별 파라미터 필터링
// ────────────────────────────────────────────────────────────────────────────

export interface DomainSearchOptions {
  curt?: string;
  caseNumber?: string;
  fromDate?: string;
  toDate?: string;
  cls?: string;
  gana?: string;
  dpaYd?: string;
  rslYd?: string;
  knd?: string;
  inq?: string;
  rpl?: string;
  natCd?: string;
  eftYd?: string;
  concYd?: string;
  locGov?: string;
}

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

// ────────────────────────────────────────────────────────────────────────────
// 판례·결정례 검색
// ────────────────────────────────────────────────────────────────────────────

export async function searchDecisions(
  query: string,
  domain: DecisionDomain = "prec",
  page = 1,
  pageSize = 10,
  options: DomainSearchOptions = {}
): Promise<DecisionSearchPage> {
  const extraParams = buildDomainParams(domain, options);
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

  const { root, list } = DOMAIN_RESPONSE_KEY[domain];
  const rootCandidates = [
    root,
    root.toLowerCase(),
    root.toUpperCase(),
    `${domain}Search`,
    `${domain.charAt(0).toUpperCase()}${domain.slice(1)}Search`,
    `${domain.charAt(0).toUpperCase()}${domain.slice(1)}`,
  ];
  let container: Record<string, unknown> = {};
  for (const k of rootCandidates) {
    if (data[k] && typeof data[k] === "object") {
      container = data[k] as Record<string, unknown>;
      break;
    }
  }

  let rawList =
    container[list] ??
    container[list.toLowerCase()] ??
    container[list.charAt(0).toUpperCase() + list.slice(1)] ??
    data[list];

  if (!rawList) {
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
    console.warn(
      `[korean-law] searchDecisions(${domain}, "${query}"): 결과 0건. 응답 최상위 키:`,
      Object.keys(data)
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
