"use client";

import { useEffect, useState } from "react";
import type { LawArticleResult } from "@/lib/korean-law/types";

/**
 * 참조조문 칩 클릭 시 자동 로드되는 조문 본문 모달.
 *
 * Design Ref: §5.3 ArticleModal / Plan FR-11
 * Plan SC: 참조조문 칩 클릭 → get_law_text 자동 호출 → 모달 로드
 *
 * 접근성: ESC 닫기, 배경 클릭 닫기, role="dialog".
 */
export function ArticleModal({
  lawName,
  articleNo,
  onClose,
}: {
  lawName: string;
  articleNo: string;
  onClose: () => void;
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

  useEffect(() => {
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${lawName} ${articleNo}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-lg border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="mb-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold">
              {lawName} {articleNo}
            </h3>
            {article?.title && (
              <p className="mt-0.5 text-sm text-muted-foreground">{article.title}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            ✕
          </button>
        </header>

        {loading && (
          <p className="text-sm text-muted-foreground">법제처에서 조문을 조회하는 중...</p>
        )}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
            {error}
            <p className="mt-1 text-xs">법제처 API 조회에 실패했습니다. 원문 링크에서 확인하세요.</p>
          </div>
        )}
        {!loading && !error && article && (
          <>
            <pre className="whitespace-pre-wrap text-sm leading-relaxed">
              {article.fullText}
            </pre>
            {article.sourceUrl && (
              <a
                href={article.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block text-xs text-primary hover:underline"
              >
                법제처 원문 ↗
              </a>
            )}
          </>
        )}
        {!loading && !error && !article && (
          <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200">
            해당 조문을 찾을 수 없습니다. 법령명·조문번호를 확인하세요.
          </p>
        )}
      </div>
    </div>
  );
}
