"use client";

import { useEffect, useState } from "react";
import type { ImpactMapResult } from "@/lib/korean-law/types";

/**
 * 조문 영향 분석 — "영향 분석" 버튼 → /api/law/impact-map.
 * 조문을 인용한 판례·해석례·심판례·자치법규를 도메인별 아코디언 트리로 표시.
 * 호출량 제어: 버튼 클릭(또는 라우팅 autoRun) 시에만 실행.
 */
export function ArticleImpactMap({
  lawName,
  articleNo,
  autoRun = false,
}: {
  lawName: string;
  articleNo: string;
  autoRun?: boolean;
}) {
  const [result, setResult] = useState<ImpactMapResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ lawName, articleNo });
      const res = await fetch(`/api/law/impact-map?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (autoRun) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, lawName, articleNo]);

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        {loading ? "영향 분석 중..." : "영향 분석 (인용 역추적)"}
      </button>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </p>
      )}

      {result && <ImpactResult result={result} />}
    </div>
  );
}

function ImpactResult({ result }: { result: ImpactMapResult }) {
  if (result.groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
        {result.citationQuery}를 인용한 결정을 법제처 수록 범위에서 찾지 못했습니다.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{result.citationQuery}</span> 인용 ·
        총 {result.totalCitations}건 (도메인 {result.groups.length})
      </p>
      {result.groups.map((g) => (
        <details key={g.domain} className="text-sm" open>
          <summary className="cursor-pointer font-medium">
            {g.label} <span className="text-xs text-muted-foreground">{g.totalCount}건</span>
          </summary>
          <ul className="mt-1 space-y-1 border-l-2 border-primary/30 pl-3">
            {g.items.map((it, i) => (
              <li key={it.id || i} className="text-xs">
                <span className="text-foreground">{it.title || "(제목 없음)"}</span>
                <span className="ml-1 text-muted-foreground">
                  {[it.court, it.caseNo, it.date].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
