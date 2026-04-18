"use client";

import { useState } from "react";

/**
 * 인용 검증 탭 (verify_citations)
 *
 * LLM이 생성한 세법 안내 문서를 붙여넣으면 내부 법령 조문 인용(예: "소득세법 제89조")을
 * 법제처 API에 실제 조회해 ✓/✗/⚠ 3분류한다. 환각(존재하지 않는 조문)이 1건이라도
 * 발견되면 [HALLUCINATION_DETECTED] 배너로 경고한다.
 */

type Status = "verified" | "not_found" | "failed";

interface Citation {
  raw: string;
  status: Status;
  lawName?: string;
  articleNo?: string;
  hang?: number;
  ho?: number;
  reason?: string;
  sourceUrl?: string;
  title?: string;
}

interface Result {
  header: "[VERIFIED]" | "[PARTIAL_VERIFIED]" | "[HALLUCINATION_DETECTED]";
  isError: boolean;
  totalCount: number;
  verifiedCount: number;
  hallucinationCount: number;
  failedCount: number;
  citations: Citation[];
  summary: string;
}

const SAMPLE_TEXT = `1세대 1주택 비과세는 소득세법 제89조 제1항 제3호에 따라 보유기간 2년 이상 주택을 양도할 때 적용됩니다. 다만 소득세법 제95조 제2항에 따라 고가주택(12억 초과분)은 과세 대상이며, 조정대상지역 다주택자는 소득세법 제104조 제7항에 따라 중과세됩니다. 또한 상증법 제18조의2(동거주택 상속공제) 및 지방세법 제111조 제1항 제2호의 취득세율이 적용됩니다.`;

export function VerifyCitationsTab() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/law/verify-citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.result as Result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300">
        <p className="font-medium">법령 조문 인용 실존 검증</p>
        <p className="mt-1 text-xs">
          LLM이 생성한 세무 안내·가이드 문서를 붙여넣으면 내부 법령 조문 인용(예:
          &ldquo;소득세법 제89조 제1항 제3호&rdquo;)을 법제처 API에 조회해 실제 존재 여부를
          확인합니다. 환각(존재하지 않는 조문)이 감지되면 상단에 경고 배너가 표시됩니다.
        </p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="검증할 텍스트를 붙여넣으세요."
        rows={8}
        className="w-full rounded-md border bg-background p-3 text-sm font-mono"
      />

      <div className="flex items-center gap-3">
        <button
          onClick={run}
          disabled={loading || !text.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "검증 중..." : "인용 검증 실행"}
        </button>
        <span className="text-xs text-muted-foreground">
          {text.length.toLocaleString()} / 10,000자 · 최대 20건 검증
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          {/* 헤더 배너 */}
          <div
            className={`rounded-md border p-3 text-sm font-medium ${
              result.isError
                ? "border-red-400 bg-red-100 text-red-900 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-200"
                : result.header === "[PARTIAL_VERIFIED]"
                  ? "border-yellow-400 bg-yellow-50 text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200"
                  : "border-green-400 bg-green-50 text-green-900 dark:border-green-900/40 dark:bg-green-900/10 dark:text-green-200"
            }`}
          >
            <p className="font-mono">{result.header}</p>
            <p className="mt-1 text-xs font-normal">{result.summary}</p>
            {result.isError && (
              <p className="mt-2 text-xs font-normal">
                ⚠️ 존재하지 않는 조문이 인용되었습니다. LLM 출력은 추가 검증 없이 사용할 수
                없습니다.
              </p>
            )}
          </div>

          {/* 요약 통계 */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="rounded-md border bg-muted/30 p-2">
              <div className="text-lg font-bold">{result.totalCount}</div>
              <div className="text-muted-foreground">전체 인용</div>
            </div>
            <div className="rounded-md border border-green-300 bg-green-50 p-2 dark:border-green-900/40 dark:bg-green-900/10">
              <div className="text-lg font-bold text-green-800 dark:text-green-300">
                {result.verifiedCount}
              </div>
              <div className="text-muted-foreground">✓ 실존</div>
            </div>
            <div className="rounded-md border border-red-300 bg-red-50 p-2 dark:border-red-900/40 dark:bg-red-900/10">
              <div className="text-lg font-bold text-red-800 dark:text-red-300">
                {result.hallucinationCount}
              </div>
              <div className="text-muted-foreground">✗ 환각</div>
            </div>
            <div className="rounded-md border border-yellow-300 bg-yellow-50 p-2 dark:border-yellow-900/40 dark:bg-yellow-900/10">
              <div className="text-lg font-bold text-yellow-800 dark:text-yellow-300">
                {result.failedCount}
              </div>
              <div className="text-muted-foreground">⚠ 실패</div>
            </div>
          </div>

          {/* 인용별 상세 */}
          <ul className="space-y-2">
            {result.citations.map((c, i) => (
              <CitationItem key={i} citation={c} />
            ))}
          </ul>

          {result.citations.length === 0 && (
            <p className="rounded-md border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
              텍스트에서 법령 조문 인용을 찾지 못했습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function CitationItem({ citation: c }: { citation: Citation }) {
  const colors =
    c.status === "verified"
      ? {
          border: "border-green-400",
          bg: "bg-green-50 dark:bg-green-900/10",
          text: "text-green-900 dark:text-green-300",
          icon: "✓",
        }
      : c.status === "not_found"
        ? {
            border: "border-red-400",
            bg: "bg-red-50 dark:bg-red-900/10",
            text: "text-red-900 dark:text-red-300",
            icon: "✗",
          }
        : {
            border: "border-yellow-400",
            bg: "bg-yellow-50 dark:bg-yellow-900/10",
            text: "text-yellow-900 dark:text-yellow-300",
            icon: "⚠",
          };

  return (
    <li className={`rounded-md border-l-4 ${colors.border} ${colors.bg} p-3 text-sm`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className={`font-medium ${colors.text}`}>
            <span className="mr-1">{colors.icon}</span>
            {c.raw}
          </div>
          {c.title && (
            <div className="mt-1 text-xs text-muted-foreground">
              {c.title}
            </div>
          )}
          {c.reason && (
            <div className="mt-1 text-xs text-muted-foreground">{c.reason}</div>
          )}
          {(c.hang !== undefined || c.ho !== undefined) && (
            <div className="mt-1 text-xs text-muted-foreground">
              {c.hang !== undefined && `제${c.hang}항`}
              {c.ho !== undefined && ` 제${c.ho}호`}
            </div>
          )}
        </div>
        {c.sourceUrl && (
          <a
            href={c.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="whitespace-nowrap text-xs text-primary hover:underline"
          >
            원문 ↗
          </a>
        )}
      </div>
    </li>
  );
}
