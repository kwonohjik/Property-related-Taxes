/**
 * 판례·결정례 검색 (searchDecisions)
 */

import {
  fetchJson,
  safeCacheKey,
  normalizeCaseNo,
  readCacheNonEmpty,
  writeCacheNonEmpty,
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
  acr:      { root: "Acr",            list: "acr" },
  ordin:    { root: "OrdinSearch",    list: "law" },
  public:   { root: "PublicSearch",   list: "public" },
  trty:     { root: "TrtySearch",     list: "trty" },
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

/**
 * 도메인별 검색 옵션 — **법제처 DRF 가 실제로 반영하는 것만** 남긴다.
 *
 * 🔴 2026-09-11 전수 차등 실측(동일 쿼리에서 옵션 유/무 totalCnt 비교): 종전 20개 키 중
 *    **16개가 법제처에서 조용히 무시**됐다. 무시되는 옵션은 없느니만 못하다 —
 *    UI 가 "필터 적용 중" 배지까지 띄우므로 사용자는 걸리지 않은 필터를 걸렸다고 믿는다.
 *
 *    무시 확인(제거): prec caseNumber·fromDate·toDate / ppc cls·dpaYd·rslYd /
 *      detc knd·inq·rpl / expc caseNumber·fromDate·toDate / trty cls·eftYd·concYd / ordin locGov
 *    "반응은 하지만 쓸 수 없음"(제거): admrul knd — 사람이 읽는 값(훈령·고시)이면 전부 0건.
 *      trty natCd — ZZ·QQ·US·미국 **전부 동일한 15건** → 국가 필터가 아니다.
 *    작동 확인(유지): prec curt(3382→대법원 1392·서울고법 183·없는법원 0) · ppc gana(18→3).
 *
 * 이름은 **사용자 관점**을 유지하고 DRF 파라미터명 변환은 buildDomainParams 가 맡는다.
 */
export interface DomainSearchOptions {
  /** prec — 법원명. DRF `curt`. */
  curt?: string;
  /** prec — 사건번호. DRF `nb` (종전엔 `caseNumber` 로 보내 무시됐다). */
  caseNumber?: string;
  /** prec — 선고일 시작 YYYYMMDD. DRF `prncYd` 범위의 앞쪽. */
  fromDate?: string;
  /** prec — 선고일 종료 YYYYMMDD. DRF `prncYd` 범위의 뒤쪽. */
  toDate?: string;
  /** ppc — 가나다순. DRF `gana`. */
  gana?: string;
}

const DOMAIN_OPTION_WHITELIST: Record<DecisionDomain, ReadonlyArray<keyof DomainSearchOptions>> = {
  prec:     ["curt", "caseNumber", "fromDate", "toDate"],
  ppc:      ["gana"],
  detc:     [],
  expc:     [],
  admrul:   [],
  trty:     [],
  ordin:    [],
  fsc:      [],
  ftc:      [],
  nlrc:     [],
  kcc:      [],
  acr:      [],
  public:   [],
};

/** 공개 옵션명 → DRF 파라미터명 (1:1 인 것만. 선고일 범위는 buildPrncYd 가 조립). */
const DRF_PARAM_NAME = {
  curt: "curt",
  caseNumber: "nb",
  gana: "gana",
} as const satisfies Partial<Record<keyof DomainSearchOptions, string>>;

/** 선고일 범위 상한 sentinel — "시작만 지정" 을 유효 범위로 만들기 위한 원거리 종료값. */
const PRNC_OPEN_END = "99991231";

/**
 * DRF `prncYd` 조립. 실측 제약 3가지(2026-09-11):
 *   · `YYYYMMDD~YYYYMMDD` 만 필터로 동작한다.
 *   · 단일 날짜 `YYYYMMDD` 는 **무시**된다 (기준선 3382 → 3382).
 *   · 열린 끝 `YYYYMMDD~` 는 **0건**을 돌려준다 — 조용한 전멸이라 절대 보내면 안 된다.
 * 시작만 있으면 원거리 종료값으로 닫고(`~99991231` = `~20991231` = `~20261231` = 474건 동일),
 * 종료만 있으면 `~종료`(실측 동작, 2984건)를 쓴다.
 */
export function buildPrncYd(from?: string, to?: string): string | null {
  const f = normalizeYmd8(from);
  const t = normalizeYmd8(to);
  if (f && t) return `${f}~${t}`;
  if (f) return `${f}~${PRNC_OPEN_END}`;
  if (t) return `~${t}`;
  return null;
}

function normalizeYmd8(v?: string): string | null {
  const s = (v ?? "").replace(/[-.\s]/g, "");
  return /^\d{8}$/.test(s) ? s : null;
}

export function buildDomainParams(
  domain: DecisionDomain,
  options: DomainSearchOptions = {}
): Record<string, string> {
  const allowed = new Set<keyof DomainSearchOptions>(DOMAIN_OPTION_WHITELIST[domain]);
  const out: Record<string, string> = {};
  for (const [key, drfName] of Object.entries(DRF_PARAM_NAME) as [
    keyof DomainSearchOptions,
    string,
  ][]) {
    if (!allowed.has(key)) continue;
    const v = options[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") {
      // 사건번호는 평문 표기로만 검색된다 — 화면에 보이는 출처별 표기를 그대로 넣어도 걸리도록.
      out[drfName] = key === "caseNumber" ? normalizeCaseNo(String(v)) : String(v).trim();
    }
  }
  if (allowed.has("fromDate") || allowed.has("toDate")) {
    const prncYd = buildPrncYd(options.fromDate, options.toDate);
    if (prncYd) out.prncYd = prncYd;
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
  const cached = await readCacheNonEmpty<DecisionSearchPage>(cacheKey);
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
  await writeCacheNonEmpty(cacheKey, result);
  return result;
}
