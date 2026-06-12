"use client";

import { useEffect, useState } from "react";
import type { LawArticleResult } from "@/lib/korean-law/types";
import { CurrentLawBadge } from "./LawCurrencyBadge";
import { ArticleImpactMap } from "./ArticleImpactMap";
import { LawArticleBody } from "./LawArticleBody";

/**
 * 조문 본문 영역 — 법제처 조회(fetch) + 로딩/에러/없음 + [현행] 배지 + 본문(표 렌더) +
 * 원문 링크 + 영향 분석. 기존 ArticleModal 본문을 추출해 플로팅 창(LawWindow) 등에서 재사용.
 *
 * 헤더(제목·드래그·최소화·닫기)는 호스트(LawWindow)가 담당 — 여기서는 조문 내용만 렌더.
 * 설계 Ref: docs/01-plan/features/law-floating-windows.plan.md §2.1 FR-2
 */
export function LawArticleContent({
  lawName,
  articleNo,
  autoImpact = false,
}: {
  lawName: string;
  articleNo: string;
  /** 라우팅(impact_map)으로 열렸을 때 영향 분석 자동 실행 */
  autoImpact?: boolean;
}) {
  const [article, setArticle] = useState<LawArticleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/law/law-text?lawName=${encodeURIComponent(lawName)}&articleNo=${encodeURIComponent(articleNo)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (!cancelled) setArticle(data.article ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [lawName, articleNo]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">법제처에서 조문을 조회하는 중...</p>;
  }
  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
        {error}
        <p className="mt-1 text-xs">법제처 API 조회에 실패했습니다. 원문 링크에서 확인하세요.</p>
      </div>
    );
  }
  if (!article) {
    return (
      <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200">
        해당 조문을 찾을 수 없습니다. 법령명·조문번호를 확인하세요.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CurrentLawBadge />
        {article.title && (
          <span className="text-sm font-medium text-foreground">{article.title}</span>
        )}
      </div>
      <LawArticleBody text={article.fullText} />
      {article.sourceUrl && (
        <a
          href={article.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-primary hover:underline"
        >
          법제처 원문 ↗
        </a>
      )}
      <div className="border-t pt-3">
        <ArticleImpactMap lawName={lawName} articleNo={articleNo} autoRun={autoImpact} />
      </div>
    </div>
  );
}
