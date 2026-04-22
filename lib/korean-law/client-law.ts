/**
 * 법령 검색·조문 조회 및 URL 빌더
 */

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
  LawApiError,
  fetchJson,
  safeCacheKey,
  readCache,
  writeCache,
  strip,
  toArray,
} from "./client-core";
import type { LawSearchItem, LawArticleResult, DecisionDomain } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// 법령 URL 빌더 (결정례 URL 포함 — getDecisionText 에서 사용)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 법제처 법령·조문 직접 링크 URL 생성.
 */
export function buildLawSourceUrl(lawName: string, articleNo?: string): string {
  const base = `https://www.law.go.kr/법령/${encodeURIComponent(lawName)}`;
  return articleNo ? `${base}/${encodeURIComponent(articleNo)}` : base;
}

/**
 * 판례·결정례 원문 URL 생성. 도메인별 법제처 페이지가 달라 매핑.
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

// ────────────────────────────────────────────────────────────────────────────
// 법령 검색
// ────────────────────────────────────────────────────────────────────────────

export async function searchLaw(lawName: string): Promise<LawSearchItem | null> {
  const resolved = resolveLawAlias(lawName);
  const result = await searchLawInternal(resolved);
  if (!result) return null;
  return mapLawSearchResult(result);
}

/**
 * 법제처 법령 검색 정렬 옵션.
 */
export type LawSearchSort = "relevance" | "promulgation_desc" | "promulgation_asc";

export async function searchLawMany(
  query: string,
  limit = 5,
  options: {
    mode?: "name" | "fallback" | "content";
    sort?: LawSearchSort;
    ancYd?: string;
    efYd?: string;
  } = {}
): Promise<LawSearchItem[]> {
  const mode = options.mode ?? "fallback";
  const sort = options.sort ?? "relevance";
  const normalized = normalizeLawSearchText(query);
  const resolved = resolveLawAlias(normalized);
  const sortKey = sort !== "relevance" ? `_${sort}` : "";
  const ancKey = options.ancYd ? `_anc${options.ancYd}` : "";
  const efKey = options.efYd ? `_ef${options.efYd}` : "";
  const cacheKey = `search_many_${safeCacheKey(resolved)}_${limit}_${mode}${sortKey}${ancKey}${efKey}`;
  const cached = await readCache<LawSearchItem[]>(cacheKey);
  if (cached) return cached;

  const searchDisplay = Math.max(limit, 20);
  let entries = mode === "content" ? [] : await doLawNameSearch(resolved, searchDisplay, "1");

  if (entries.length === 0 && mode !== "content") {
    const stripped = stripNonLawKeywords(resolved);
    if (stripped && stripped !== resolved && stripped.length >= 2) {
      entries = await doLawNameSearch(stripped, searchDisplay, "1");
    }
  }

  if (entries.length === 0 && mode !== "content") {
    const lawNames = extractLawNames(resolved);
    if (lawNames.length > 0) {
      const collected: LawSearchItem[] = [];
      for (const name of lawNames.slice(0, 3)) {
        const partial = await doLawNameSearch(name, Math.min(searchDisplay, 10), "1");
        collected.push(...partial);
      }
      const seen = new Set<string>();
      entries = collected.filter((e) => {
        if (seen.has(e.mst)) return false;
        seen.add(e.mst);
        return true;
      });
    }
  }

  if (entries.length === 0 && mode !== "content") {
    const expansions = expandTaxKeywords(resolved);
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

  if (entries.length > 1) {
    if (sort === "promulgation_desc") {
      entries.sort((a, b) => (b.promulgationDate ?? "").localeCompare(a.promulgationDate ?? ""));
    } else if (sort === "promulgation_asc") {
      entries.sort((a, b) => (a.promulgationDate ?? "").localeCompare(b.promulgationDate ?? ""));
    } else {
      const queryWords = resolved.split(/\s+/).filter((w) => w.length > 0);
      entries.sort((a, b) => {
        const sA = scoreLawRelevance(a.lawName, resolved, queryWords);
        const sB = scoreLawRelevance(b.lawName, resolved, queryWords);
        if (sB !== sA) return sB - sA;
        return (b.promulgationDate ?? "").localeCompare(a.promulgationDate ?? "");
      });
    }
  }

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
 * "YYYYMMDD~YYYYMMDD" 또는 "YYYYMMDD-YYYYMMDD" → [from, to].
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
// 조문 본문 조회
// ────────────────────────────────────────────────────────────────────────────

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
 * 사용자 입력 조문번호를 법제처 내부 포맷 "제N조[의M]" 으로 정규화.
 *
 * 허용 입력: "21" → "제21조", "21의2" → "제21조의2", "제21조의2" → 그대로
 */
export function normalizeArticleNo(input: string): string {
  const trimmed = input.replace(/\s/g, "");
  if (!trimmed) return trimmed;
  if (/^제\d+조(의\d+)?$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^제?(\d+)(?:조)?(의\d+)?$/);
  if (!m) return trimmed;
  const main = m[1];
  const suffix = m[2] ?? "";
  return `제${main}조${suffix}`;
}

