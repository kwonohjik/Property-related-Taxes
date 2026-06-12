"use client";

import { useEffect, useState } from "react";
import { DateInput } from "@/components/ui/date-input";
import type { ApplicableLawResult } from "@/lib/korean-law/types";
import { LawArticleBody } from "./LawArticleBody";

/**
 * 행위시법(applicable_law) 패널 — 기준일에 시행 중이던 조문 + 현행 대비 + 부칙 경과규정.
 *
 * Query Router "2021년 시행 소득세법 89조" → routed props 로 자동 조회.
 * 자체적으로 `/api/law/applicable-law` 호출. 법령·조문 탭에 접이식으로 임베드.
 */
export function ApplicableLawPanel({
  routedLawName,
  routedArticleNo,
  routedBaseDate,
  autoRun,
}: {
  routedLawName?: string;
  routedArticleNo?: string;
  routedBaseDate?: string;
  /** nonce — 증가 시 routed 값으로 자동 조회 */
  autoRun?: number;
} = {}) {
  const [lawName, setLawName] = useState(routedLawName ?? "소득세법");
  const [articleNo, setArticleNo] = useState(routedArticleNo ?? "제89조");
  const [baseDate, setBaseDate] = useState(routedBaseDate ?? "");
  const [result, setResult] = useState<ApplicableLawResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function lookup(name: string, article: string, ymd: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const params = new URLSearchParams({ lawName: name, articleNo: article, baseDate: ymd });
      const res = await fetch(`/api/law/applicable-law?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(data.result ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  // 라우팅 자동 조회 — "YYYYMMDD" → "YYYY-MM-DD" 로 DateInput 동기화
  useEffect(() => {
    if (!autoRun) return;
    setOpen(true);
    if (routedLawName) setLawName(routedLawName);
    if (routedArticleNo) setArticleNo(routedArticleNo);
    const ymd = routedBaseDate ? toDashed(routedBaseDate) : "";
    if (ymd) setBaseDate(ymd);
    if (routedLawName && routedArticleNo && routedBaseDate) {
      void lookup(routedLawName, routedArticleNo, routedBaseDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  function onSubmit() {
    if (!lawName.trim() || !articleNo.trim() || !baseDate) return;
    void lookup(lawName.trim(), articleNo.trim(), baseDate.replace(/-/g, ""));
  }

  return (
    <div className="rounded-md border bg-muted/20">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
      >
        <span className="text-muted-foreground">
          {open ? "▼" : "▶"} 기준일 시점 조회 (행위시법) — 양도·상속·취득 당시 시행 법령
        </span>
        {result && (
          <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">조회됨</span>
        )}
      </button>

      {open && (
        <div className="border-t p-3 space-y-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">법령명</span>
              <input
                value={lawName}
                onChange={(e) => setLawName(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">조문번호</span>
              <input
                value={articleNo}
                onChange={(e) => setArticleNo(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-muted-foreground">기준일 (양도일·상속개시일 등)</span>
              <DateInput value={baseDate} onChange={setBaseDate} />
            </label>
          </div>
          <button
            type="button"
            onClick={onSubmit}
            disabled={loading || !lawName.trim() || !articleNo.trim() || !baseDate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {loading ? "조회 중..." : "행위시법 조회"}
          </button>

          {error && (
            <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
              {error}
            </div>
          )}

          {result && <ApplicableLawResultCard result={result} />}
        </div>
      )}
    </div>
  );
}

function ApplicableLawResultCard({ result }: { result: ApplicableLawResult }) {
  const specific = result.transitionExcerpts.filter((e) => e.articleSpecific);
  const generic = result.transitionExcerpts.filter((e) => !e.articleSpecific);

  return (
    <article className="rounded-md border bg-card p-4 space-y-3">
      <header className="space-y-1">
        <h3 className="text-base font-semibold">
          {result.lawName} {result.articleNo}
          {result.article?.title ? ` (${result.article.title})` : ""}
        </h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <VersionBadge isCurrent={result.isCurrentVersion} efYd={result.version.efYd} />
          <span className="text-muted-foreground">
            {fmtYmd(result.baseDate)} 기준 · {result.version.rrCls} · 공포 제{result.version.ancNo}호(
            {fmtYmd(result.version.ancYd)})
          </span>
        </div>
        {!result.isCurrentVersion && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            ⚠️ 이 본문은 <strong>{fmtYmd(result.baseDate)} 당시 시행</strong>된 연혁 조문입니다. 현행과{" "}
            {result.sameAsCurrentText === true
              ? "동일합니다."
              : result.sameAsCurrentText === false
              ? "다릅니다 — 현행 적용 시 주의."
              : "비교가 확인되지 않았습니다."}
            {result.currentVersion && ` (현행 시행 ${fmtYmd(result.currentVersion.efYd)})`}
          </p>
        )}
      </header>

      {result.article ? (
        <div className="rounded bg-muted/30 p-3">
          <LawArticleBody text={result.article.fullText} />
        </div>
      ) : (
        <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-200">
          해당 버전에서 조문 본문을 찾지 못했습니다 (조문 신설·이동 가능).
        </p>
      )}

      {specific.length > 0 && (
        <section className="space-y-1">
          <h4 className="text-sm font-medium">📌 {result.articleNo} 관련 적용례·경과조치</h4>
          {specific.map((e) => (
            <ExcerptBlock key={`s-${e.ancNo}`} ancNo={e.ancNo} ancYd={e.ancYd} lines={e.lines} />
          ))}
        </section>
      )}

      {generic.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            그 밖의 경과조치 (해당 개정 부칙, 참고용) {generic.length}건
          </summary>
          <div className="mt-1 space-y-1">
            {generic.map((e) => (
              <ExcerptBlock key={`g-${e.ancNo}`} ancNo={e.ancNo} ancYd={e.ancYd} lines={e.lines} />
            ))}
          </div>
        </details>
      )}

      {result.laterVersions.length > 0 && (
        <p className="text-xs text-muted-foreground">
          기준일 이후 {result.laterVersions.length}회 개정 시행됨 (최근 시행{" "}
          {fmtYmd(result.laterVersions[0].efYd)}).
        </p>
      )}

      {result.sourceUrl && (
        <a
          href={result.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-primary hover:underline"
        >
          법제처 현행 원문 ↗
        </a>
      )}
    </article>
  );
}

function ExcerptBlock({ ancNo, ancYd, lines }: { ancNo: string; ancYd: string; lines: string[] }) {
  return (
    <div className="rounded border-l-2 border-primary/40 bg-muted/20 px-3 py-2">
      <p className="text-xs font-medium text-muted-foreground">
        부칙 &lt;제{ancNo}호, {fmtYmd(ancYd)}&gt;
      </p>
      {lines.map((l, i) => (
        <p key={i} className="text-sm leading-relaxed">
          {l}
        </p>
      ))}
    </div>
  );
}

function VersionBadge({ isCurrent, efYd }: { isCurrent: boolean; efYd: string }) {
  return isCurrent ? (
    <span className="rounded bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
      [현행]
    </span>
  ) : (
    <span className="rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
      [연혁 {fmtYmd(efYd)} 시행]
    </span>
  );
}

/** "20210601" → "2021.06.01" */
function fmtYmd(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return ymd;
  return `${ymd.slice(0, 4)}.${ymd.slice(4, 6)}.${ymd.slice(6, 8)}`;
}

/** "20210601" → "2021-06-01" (DateInput용) */
function toDashed(ymd: string): string {
  if (!/^\d{8}$/.test(ymd)) return "";
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}
