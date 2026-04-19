"use client";

import { useState, useEffect } from "react";
import {
  CHAIN_TYPES,
  CHAIN_LABELS,
  type ChainResult,
  type ChainType,
} from "@/lib/korean-law/types";
import { SectionView } from "./SectionView";

/** 리서치 체인 8종 탭 */
export function ChainResearchTab({
  initialQuery,
  initialType,
  autoRun,
}: {
  initialQuery?: string;
  initialType?: ChainType;
  autoRun?: number;
} = {}) {
  const [type, setType] = useState<ChainType>(initialType ?? "full_research");
  const [query, setQuery] = useState(initialQuery ?? "양도소득세 비과세");
  const [rawText, setRawText] = useState("");
  const [result, setResult] = useState<ChainResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDocumentReview = type === "document_review";

  // Query Router에서 chain 탭으로 라우팅되면 자동 실행 (closure 안전)
  useEffect(() => {
    if (!autoRun) return;
    if (initialQuery) setQuery(initialQuery);
    if (initialType) setType(initialType);
    void runWith(initialType ?? type, initialQuery ?? query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  async function run() {
    await runWith(type, query);
  }

  async function runWith(t: ChainType, q: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/law/chain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: t,
          query: q,
          rawText: t === "document_review" ? rawText : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as ChainType)}
          className="rounded-md border bg-background px-2 py-2 text-sm"
        >
          {CHAIN_TYPES.map((t) => (
            <option key={t} value={t}>
              {CHAIN_LABELS[t]}
            </option>
          ))}
        </select>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="핵심 키워드 또는 법령명"
          className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <button
          onClick={run}
          disabled={loading || !query}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "실행 중..." : "체인 실행"}
        </button>
      </div>

      {isDocumentReview && (
        <textarea
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder="인용이 포함된 문서 원문을 붙여넣으세요 (예: '소득세법 제89조에 따라 ...')"
          rows={5}
          className="w-full rounded-md border bg-background p-3 text-sm"
        />
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {CHAIN_LABELS[result.chainType]} · {result.query} · {result.elapsedMs}ms
          </p>
          {result.sections.map((sec, i) => (
            <SectionView key={i} section={sec} />
          ))}
        </div>
      )}
    </div>
  );
}

