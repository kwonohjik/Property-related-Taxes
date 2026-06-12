"use client";

import { useState } from "react";
import type { CiteCheckResult } from "@/lib/korean-law/types";

/**
 * 판례 생사 확인 — "후속 인용 확인" 버튼 → /api/law/cite-check.
 *
 * ⚠ 단정 금지(법령 정확성 최우선): "폐기됨"이 아니라 "검토 필요" 위계로만 표기하고
 *    근거 후속 판례를 함께 제시한다. 한국형 Shepard's 보조 도구.
 */
export function CitePrecedentStatus({ caseNo }: { caseNo: string }) {
  const [result, setResult] = useState<CiteCheckResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/law/cite-check?caseNo=${encodeURIComponent(caseNo)}`);
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
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={loading}
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        {loading ? "후속 인용 확인 중..." : "후속 인용 확인 (생사 보조)"}
      </button>

      {error && (
        <p className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </p>
      )}

      {result && <CiteResultCard result={result} />}
    </div>
  );
}

function CiteResultCard({ result }: { result: CiteCheckResult }) {
  return (
    <div className="space-y-2 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={result.status} />
        <span className="text-xs text-muted-foreground">
          후속 인용 {result.citingCount}건 · 대법원 본문 {result.scannedCount}건 스캔
        </span>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ 자동 휴리스틱 보조입니다. 변경·폐기 여부는 후속 판결 전문으로 직접 확인하세요.
      </p>

      {result.signals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-rose-700 dark:text-rose-300">변경·폐기 신호</p>
          {result.signals.map((s, i) => (
            <div
              key={i}
              className="rounded border-l-2 border-rose-400 bg-rose-50 px-2 py-1 text-xs dark:bg-rose-900/15"
            >
              <span className="font-medium">
                {s.citingCaseNo}
                {s.citingDate ? ` (${s.citingDate})` : ""} · {s.label}
              </span>
              <p className="mt-0.5 text-muted-foreground">…{s.excerpt}…</p>
            </div>
          ))}
        </div>
      )}

      {result.enBancUnscanned.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            후속 전원합의체 (본문 미확보 — 수동 확인 권장)
          </p>
          {result.enBancUnscanned.slice(0, 5).map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">
              · {c.caseNo} {c.date && `· ${c.date}`} {c.court && `· ${c.court}`}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: CiteCheckResult["status"] }) {
  if (status === "review_needed") {
    return (
      <span className="rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
        ⚠ 검토 필요
      </span>
    );
  }
  if (status === "no_signal") {
    return (
      <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
        변경·폐기 신호 미감지
      </span>
    );
  }
  return (
    <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      후속 인용 없음
    </span>
  );
}
