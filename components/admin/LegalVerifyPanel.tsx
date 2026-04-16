"use client";

import { useState } from "react";

type VerifyStatus = "PASS" | "FAIL" | "ERROR";

interface VerifyResult {
  id: string;
  citation: string;
  status: VerifyStatus;
  articleTitle: string | null;
  failedKeywords: string[] | null;
  foundForbiddenKeywords: string[] | null;
  error: string | null;
}

interface VerifySummary {
  total: number;
  pass: number;
  fail: number;
  error: number;
  elapsed: string;
}

interface VerifyResponse {
  summary: VerifySummary;
  results: VerifyResult[];
  error?: string;
}

const STATUS_STYLE: Record<VerifyStatus, string> = {
  PASS:  "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  FAIL:  "bg-red-100  text-red-800  dark:bg-red-900/40  dark:text-red-300",
  ERROR: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
};

const STATUS_LABEL: Record<VerifyStatus, string> = {
  PASS: "통과",
  FAIL: "실패",
  ERROR: "오류",
};

export function LegalVerifyPanel() {
  const [loading, setLoading]     = useState(false);
  const [data, setData]           = useState<VerifyResponse | null>(null);
  const [expanded, setExpanded]   = useState(false);

  async function runVerify() {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch("/api/admin/verify-legal", { method: "POST" });
      const json: VerifyResponse = await res.json();
      setData(json);
      setExpanded(true);
    } catch {
      setData({ error: "네트워크 오류", summary: { total:0, pass:0, fail:0, error:0, elapsed:"0" }, results: [] });
    } finally {
      setLoading(false);
    }
  }

  const allPass = data && !data.error && data.summary.fail === 0 && data.summary.error === 0;
  const hasProblem = data && !data.error && (data.summary.fail > 0 || data.summary.error > 0);

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">법령 조문 자동 검증</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            법제처 Open API — {35}개 조문 키워드 일치 여부 확인
          </p>
        </div>
        <button
          onClick={runVerify}
          disabled={loading}
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "검증 중…" : "검증 실행"}
        </button>
      </div>

      {/* 로딩 */}
      {loading && (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          법제처 API 조회 중 (캐시 없을 시 약 7~10초)…
        </div>
      )}

      {/* 요약 결과 */}
      {data && !data.error && (
        <div className="mt-3">
          <div
            className={`rounded-md px-3 py-2 text-xs font-medium ${
              allPass
                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"
            }`}
          >
            {allPass
              ? `✓ 전체 통과 — ${data.summary.total}건 모두 현행 법조문과 일치 (${data.summary.elapsed}s)`
              : `✗ 문제 발견 — 실패 ${data.summary.fail}건 · 오류 ${data.summary.error}건 (통과 ${data.summary.pass}/${data.summary.total}건)`}
          </div>

          {/* 펼치기/접기 */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="mt-2 text-xs text-muted-foreground hover:text-foreground transition"
          >
            {expanded ? "▲ 상세 접기" : "▼ 상세 보기"}
          </button>

          {expanded && (
            <div className="mt-2 max-h-72 overflow-y-auto rounded border text-xs">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50 text-left">
                    <th className="px-2 py-1.5 font-medium">상태</th>
                    <th className="px-2 py-1.5 font-medium">규칙 ID</th>
                    <th className="px-2 py-1.5 font-medium">인용</th>
                    <th className="px-2 py-1.5 font-medium">조문 / 메시지</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.map((r) => (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-muted/30">
                      <td className="px-2 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 font-mono font-semibold ${STATUS_STYLE[r.status]}`}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 font-mono text-muted-foreground">{r.id}</td>
                      <td className="px-2 py-1.5 whitespace-nowrap">{r.citation}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">
                        {r.status === "PASS" && (
                          <span className="truncate block max-w-xs">{r.articleTitle}</span>
                        )}
                        {r.failedKeywords && (
                          <span className="text-red-600 dark:text-red-400">
                            누락 키워드: {r.failedKeywords.join(", ")}
                          </span>
                        )}
                        {r.foundForbiddenKeywords && (
                          <span className="text-red-600 dark:text-red-400">
                            금지 키워드: {r.foundForbiddenKeywords.join(", ")}
                          </span>
                        )}
                        {r.error && (
                          <span className="text-yellow-600 dark:text-yellow-400">{r.error}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* API 오류 */}
      {data?.error && (
        <p className="mt-3 text-xs text-red-600 dark:text-red-400">{data.error}</p>
      )}
    </div>
  );
}
