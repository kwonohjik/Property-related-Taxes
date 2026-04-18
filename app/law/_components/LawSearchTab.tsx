"use client";

import { useState, useEffect } from "react";
import type { LawSearchItem, LawArticleResult } from "@/lib/korean-law/types";
import { HighlightedText } from "./HighlightedText";

/** 법령 검색 + 조문 열람 탭 */
export function LawSearchTab({
  initialQuery,
  initialArticleNo,
  autoSearch,
}: {
  initialQuery?: string;
  initialArticleNo?: string;
  autoSearch?: number;
} = {}) {
  const [query, setQuery] = useState(initialQuery ?? "소득세법");
  const [articleNo, setArticleNo] = useState(initialArticleNo ?? "제89조");
  const [results, setResults] = useState<LawSearchItem[]>([]);
  const [article, setArticle] = useState<LawArticleResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<"relevance" | "promulgation_desc" | "promulgation_asc">("relevance");
  const [ancYd, setAncYd] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function search() {
    setLoading(true);
    setError(null);
    setArticle(null);
    setResults([]);
    try {
      const params = new URLSearchParams({ q: query });
      if (sort !== "relevance") params.set("sort", sort);
      if (ancYd.trim()) params.set("ancYd", ancYd.trim());
      const res = await fetch(`/api/law/search-law?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setResults((await res.json()).results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 라우팅으로 initialQuery/initialArticleNo 변경 시 자동 실행
  // closure 안전성 위해 명시적 파라미터 전달
  useEffect(() => {
    if (!autoSearch) return;
    if (initialQuery) setQuery(initialQuery);
    if (initialArticleNo) {
      setArticleNo(initialArticleNo);
      if (initialQuery) void openArticleWith(initialQuery, initialArticleNo);
    } else if (initialQuery) {
      void searchWith(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch]);

  async function openArticle() {
    await openArticleWith(query, articleNo);
  }

  async function openArticleWith(lawName: string, article: string) {
    setLoading(true);
    setError(null);
    setArticle(null);
    try {
      const url = `/api/law/law-text?lawName=${encodeURIComponent(lawName)}&articleNo=${encodeURIComponent(article)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setArticle(data.article ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function searchWith(q: string) {
    setLoading(true);
    setError(null);
    setArticle(null);
    setResults([]);
    try {
      const params = new URLSearchParams({ q });
      if (sort !== "relevance") params.set("sort", sort);
      if (ancYd.trim()) params.set("ancYd", ancYd.trim());
      const res = await fetch(`/api/law/search-law?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setResults((await res.json()).results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="법령명 (예: 소득세법, 상증법)"
          className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={search}
          disabled={loading || !query}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          value={articleNo}
          onChange={(e) => setArticleNo(e.target.value)}
          placeholder="조문 번호 (숫자만 가능 · 예: 89, 제89조, 18의2, 제18조의2)"
          className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={openArticle}
          disabled={loading || !query || !articleNo}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? "조회 중..." : "조문 본문 보기"}
        </button>
      </div>

      <div className="rounded-md border bg-muted/20">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
        >
          <span className="text-muted-foreground">
            {showAdvanced ? "▼" : "▶"} 고급 검색 옵션 (정렬·공포일자)
          </span>
          {(sort !== "relevance" || ancYd) && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">필터 적용 중</span>
          )}
        </button>
        {showAdvanced && (
          <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">정렬</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as typeof sort)}
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="relevance">관련도 순 (기본)</option>
                <option value="promulgation_desc">공포일자 내림차순 (최신순)</option>
                <option value="promulgation_asc">공포일자 오름차순 (오래된순)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">공포일자 범위 (YYYYMMDD~YYYYMMDD)</span>
              <input
                value={ancYd}
                onChange={(e) => setAncYd(e.target.value)}
                placeholder="예: 20240101~20241231"
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
        )}
      </div>

      {loading && !error && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          법제처에 요청 중...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <ul className="divide-y rounded-md border">
          {results.map((r) => (
            <li key={r.mst} className="p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-medium">
                    <HighlightedText text={r.lawName} query={query} />
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">공포일 {r.promulgationDate}</span>
                </div>
                <a
                  href={`https://www.law.go.kr/법령/${encodeURIComponent(r.lawName)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  법제처 원문 ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {article && (
        <article className="rounded-md border bg-card p-4">
          <header className="mb-2">
            <h3 className="text-base font-semibold">
              {article.lawName} {article.title}
            </h3>
            {article.sourceUrl && (
              <a href={article.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
                법제처 원문 ↗
              </a>
            )}
          </header>
          <pre className="whitespace-pre-wrap text-sm leading-relaxed">{article.fullText}</pre>
        </article>
      )}
    </div>
  );
}
