"use client";

import { useState } from "react";
import type { RouteResult } from "@/lib/korean-law/types";

/**
 * 통합 검색창 — Query Router 기반 자연어 질의 자동 라우팅.
 *
 * Design Ref: §5.3 UnifiedSearchBar / Plan FR-09, FR-15
 *
 * 동작:
 *   1) 입력 + Enter/검색 버튼 → /api/law/route-router 호출
 *   2) 반환된 targetTab + params 를 부모 콜백으로 전달
 *   3) "라우팅 해제" 토글이 ON이면 일반 검색(search_law) 고정
 *   4) 매칭 사유(reason)를 인라인 배너로 표시
 */
export function UnifiedSearchBar({
  onRoute,
}: {
  onRoute: (route: RouteResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [routingDisabled, setRoutingDisabled] = useState(false);
  const [lastRoute, setLastRoute] = useState<RouteResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      if (routingDisabled) {
        const fallback: RouteResult = {
          tool: "search_law",
          params: { q: query },
          reason: "라우팅 해제 모드 — 일반 법령 검색으로 이동",
          patternName: "manual_disabled",
          priority: 999,
          confidence: "low",
          targetTab: "law",
        };
        setLastRoute(fallback);
        onRoute(fallback);
      } else {
        const res = await fetch("/api/law/route-router", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        setLastRoute(data as RouteResult);
        onRoute(data as RouteResult);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const examples = ["민법 제750조", "양도소득세 개정 이력", "관세 FTA 세율"];

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder='"소득세법 제89조", "양도소득세 개정", "관세 FTA" 등 자연어로 질의'
          className="flex-1 min-w-64 rounded-md border bg-background px-3 py-2 text-sm"
          aria-label="통합 검색창"
        />
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={loading || !query.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "라우팅 중..." : "검색"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">예시:</span>
        {examples.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => {
              setQuery(ex);
            }}
            className="rounded-full border border-muted bg-muted/30 px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
          >
            {ex}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={routingDisabled}
            onChange={(e) => setRoutingDisabled(e.target.checked)}
          />
          라우팅 해제 (탭 수동 선택)
        </label>
      </div>

      {lastRoute && (
        <div
          className={
            "mt-3 rounded-md border p-2 text-xs " +
            (lastRoute.confidence === "high"
              ? "border-green-300 bg-green-50 text-green-900 dark:border-green-900/40 dark:bg-green-900/10 dark:text-green-200"
              : lastRoute.confidence === "low"
              ? "border-yellow-300 bg-yellow-50 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200"
              : "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-200")
          }
        >
          <span className="font-medium">
            [{lastRoute.confidence === "high" ? "✓" : lastRoute.confidence === "low" ? "⚠" : "→"}]
          </span>{" "}
          <span className="font-mono text-[10px]">{lastRoute.patternName}</span> · {lastRoute.reason}
        </div>
      )}

      {error && (
        <div className="mt-2 rounded-md border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
