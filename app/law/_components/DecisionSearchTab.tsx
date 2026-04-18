"use client";

import { useState, useEffect } from "react";
import { Pagination } from "@/components/ui/pagination";
import {
  DECISION_DOMAINS,
  DECISION_DOMAIN_LABELS,
  type DecisionDomain,
  type DecisionSearchItem,
  type DecisionSearchPage,
  type DecisionText,
} from "@/lib/korean-law/types";
import { parseDateRange } from "@/lib/korean-law/date-parser";
import { HighlightedText } from "./HighlightedText";
import { RefLawChip } from "./RefLawChip";
import { RefPrecedentChip } from "./RefPrecedentChip";

const PAGE_SIZE = 10;

/**
 * 도메인별 고급 옵션 상태.
 * 법제처 API는 도메인마다 다른 필터 파라미터를 받으므로 UI도 동적으로 노출.
 */
interface AdvancedOptions {
  // prec
  curt?: string;
  caseNumber?: string;
  fromDate?: string;
  toDate?: string;
  // ppc
  cls?: string;
  gana?: string;
  dpaYd?: string;
  rslYd?: string;
}

/** 판례·결정례 검색 탭 (페이지네이션 포함) */
export function DecisionSearchTab({
  initialQuery,
  initialDomain,
  autoSearch,
}: {
  initialQuery?: string;
  initialDomain?: DecisionDomain;
  autoSearch?: number; // 변화 감지용 nonce
} = {}) {
  const [query, setQuery] = useState(initialQuery ?? "양도소득세");
  const [domain, setDomain] = useState<DecisionDomain>(initialDomain ?? "prec");
  const [advanced, setAdvanced] = useState<AdvancedOptions>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [items, setItems] = useState<DecisionSearchItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<DecisionText | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [autoDateHint, setAutoDateHint] = useState<string | null>(null);

  async function fetchPage(targetPage: number) {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSearched(true);
    try {
      // 자연어 날짜 범위 자동 추출 — "최근 3년 양도세" → fromDate/toDate + "양도세"
      const { fromDate, toDate, cleanedQuery } = parseDateRange(query);
      const effectiveQuery = cleanedQuery || query;
      const allow = allowedOptionsForDomain(domain);

      const params = new URLSearchParams({
        q: effectiveQuery,
        domain,
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      // 도메인별 허용 필드만 passthrough
      for (const [k, v] of Object.entries(advanced)) {
        if (v && allow.has(k)) params.set(k, v);
      }
      // 자동 추출 날짜(사용자 수동 설정이 없을 때만)
      if (fromDate && allow.has("fromDate") && !advanced.fromDate) {
        params.set("fromDate", fromDate);
      }
      if (toDate && allow.has("toDate") && !advanced.toDate) {
        params.set("toDate", toDate);
      }
      setAutoDateHint(
        fromDate || toDate
          ? `자동 추출: ${fromDate ?? "?"} ~ ${toDate ?? "?"} (쿼리 "${effectiveQuery}" 로 검색)`
          : null
      );

      const url = `/api/law/search-decisions?${params.toString()}`;
      const res = await fetch(url);
      const data: DecisionSearchPage | { error: string } = await res.json();
      if (!res.ok) throw new Error(("error" in data ? data.error : null) ?? `HTTP ${res.status}`);
      const payload = data as DecisionSearchPage;
      setItems(payload.items ?? []);
      setTotalCount(payload.totalCount ?? 0);
      setPage(payload.page ?? targetPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setItems([]);
    setTotalCount(0);
    setPage(1);
    void fetchPage(1);
  }

  // 라우팅으로 externally initialQuery/initialDomain이 변하면 자동 검색
  // closure 안전을 위해 명시적 파라미터로 직접 호출
  useEffect(() => {
    if (autoSearch && initialQuery) {
      setQuery(initialQuery);
      if (initialDomain) setDomain(initialDomain);
      setItems([]);
      setTotalCount(0);
      setPage(1);
      void fetchPageWith(1, initialQuery, initialDomain ?? domain);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSearch]);

  async function fetchPageWith(targetPage: number, q: string, dom: DecisionDomain) {
    setLoading(true);
    setError(null);
    setDetail(null);
    setSearched(true);
    try {
      const { fromDate, toDate, cleanedQuery } = parseDateRange(q);
      const effectiveQuery = cleanedQuery || q;
      const allow = allowedOptionsForDomain(dom);
      const params = new URLSearchParams({
        q: effectiveQuery,
        domain: dom,
        page: String(targetPage),
        pageSize: String(PAGE_SIZE),
      });
      if (fromDate && allow.has("fromDate")) params.set("fromDate", fromDate);
      if (toDate && allow.has("toDate")) params.set("toDate", toDate);
      const res = await fetch(`/api/law/search-decisions?${params.toString()}`);
      const data: DecisionSearchPage | { error: string } = await res.json();
      if (!res.ok) throw new Error(("error" in data ? data.error : null) ?? `HTTP ${res.status}`);
      const payload = data as DecisionSearchPage;
      setItems(payload.items ?? []);
      setTotalCount(payload.totalCount ?? 0);
      setPage(payload.page ?? targetPage);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }

  function handlePageChange(p: number) {
    void fetchPage(p);
    // 결과 상단으로 자연스럽게 스크롤
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function openDetail(id: string, full = false) {
    setLoading(true);
    setError(null);
    try {
      const url =
        `/api/law/decision-text?id=${encodeURIComponent(id)}&domain=${domain}` +
        (full ? "&full=true" : "");
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDetail(data.decision ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const hasAdvanced = ["prec", "ppc"].includes(domain);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="검색어 (예: 양도소득세 중과)"
          className="flex-1 min-w-48 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <select
          value={domain}
          onChange={(e) => {
            setDomain(e.target.value as DecisionDomain);
            setAdvanced({});
          }}
          className="rounded-md border bg-background px-2 py-2 text-sm"
        >
          {DECISION_DOMAINS.map((d) => (
            <option key={d} value={d}>
              {DECISION_DOMAIN_LABELS[d]}
            </option>
          ))}
        </select>
        <button
          onClick={handleSearch}
          disabled={loading || !query}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {loading ? "검색 중..." : "검색"}
        </button>
      </div>

      {hasAdvanced && (
        <div className="rounded-md border bg-muted/20">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm"
          >
            <span className="text-muted-foreground">
              {showAdvanced ? "▼" : "▶"} 고급 검색 옵션 ({DECISION_DOMAIN_LABELS[domain]})
            </span>
            {Object.values(advanced).some(Boolean) && (
              <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">
                필터 적용 중
              </span>
            )}
          </button>
          {showAdvanced && (
            <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
              {domain === "prec" && (
                <>
                  <OptionField
                    label="법원명"
                    placeholder="예: 대법원, 서울고등법원"
                    value={advanced.curt ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, curt: v })}
                  />
                  <OptionField
                    label="사건번호"
                    placeholder="예: 2023두56077"
                    value={advanced.caseNumber ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, caseNumber: v })}
                  />
                  <OptionField
                    label="선고일 시작 (YYYYMMDD)"
                    placeholder="예: 20230101"
                    value={advanced.fromDate ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, fromDate: v })}
                  />
                  <OptionField
                    label="선고일 종료 (YYYYMMDD)"
                    placeholder="예: 20251231"
                    value={advanced.toDate ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, toDate: v })}
                  />
                </>
              )}
              {domain === "ppc" && (
                <>
                  <OptionField
                    label="분류 (cls)"
                    placeholder="예: 양도, 상속, 증여"
                    value={advanced.cls ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, cls: v })}
                  />
                  <OptionField
                    label="가나다순 (gana)"
                    placeholder="ga / na / da / ra / ma"
                    value={advanced.gana ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, gana: v })}
                  />
                  <OptionField
                    label="처분일 (YYYYMMDD)"
                    placeholder="예: 20240101"
                    value={advanced.dpaYd ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, dpaYd: v })}
                  />
                  <OptionField
                    label="결정일 (YYYYMMDD)"
                    placeholder="예: 20241231"
                    value={advanced.rslYd ?? ""}
                    onChange={(v) => setAdvanced({ ...advanced, rslYd: v })}
                  />
                </>
              )}
              <div className="col-span-full flex gap-2">
                <button
                  type="button"
                  onClick={() => setAdvanced({})}
                  className="rounded border px-3 py-1 text-xs hover:bg-accent"
                >
                  필터 초기화
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {autoDateHint && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-300">
          📅 {autoDateHint}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/40 dark:bg-red-900/10 dark:text-red-300">
          {error}
        </div>
      )}

      {loading && !error && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
          법제처에 검색 요청 중...
        </div>
      )}

      {searched && !loading && !error && items.length === 0 && (
        <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
          <p>검색 결과가 없습니다.</p>
          <ul className="mt-2 ml-4 list-disc text-xs">
            <li>짧은 키워드로 다시 시도해 보세요 (예: &quot;증여세 감정평가&quot;).</li>
            <li>띄어쓰기·오타를 확인하세요. 법제처 검색은 완전일치에 민감합니다.</li>
            <li>도메인을 &quot;법령해석례&quot; 또는 &quot;조세심판원 결정&quot;으로 바꿔보세요.</li>
          </ul>
        </div>
      )}

      {items.length > 0 && (
        <>
          <ul className="divide-y rounded-md border">
            {items.map((it) => {
              const isFullTextAvailable = it.source === "대법원";
              return (
                <li key={it.id || `${it.caseNo}-${it.date}`} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{it.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {it.source && (
                          <span
                            className={`rounded px-1.5 py-0.5 ${
                              isFullTextAvailable
                                ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                                : "bg-muted"
                            }`}
                            title={
                              isFullTextAvailable
                                ? "본문 전문 조회 가능"
                                : "본문은 법제처 원문 링크에서 확인"
                            }
                          >
                            {it.source}
                          </span>
                        )}
                        <span>
                          {[it.court, it.caseNo, it.date].filter(Boolean).join(" · ")}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {it.id && (
                        <button
                          onClick={() => openDetail(it.id)}
                          className="rounded border px-2 py-1 text-xs hover:bg-accent"
                        >
                          본문
                        </button>
                      )}
                      <a
                        href={`https://www.law.go.kr/LSW/precInfoP.do?precSeq=${it.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border px-2 py-1 text-xs hover:bg-accent"
                      >
                        원문 ↗
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            totalCount={totalCount}
            onChange={handlePageChange}
            disabled={loading}
          />
        </>
      )}

      {detail && (
        <article className="rounded-md border bg-card p-4">
          <header className="mb-3 space-y-1">
            <h3 className="text-base font-semibold">{detail.title}</h3>
            {(detail.court || detail.caseNo || detail.date) && (
              <p className="text-xs text-muted-foreground">
                {[detail.court, detail.caseNo, detail.date].filter(Boolean).join(" · ")}
              </p>
            )}
            {(detail.caseType || detail.judgmentType) && (
              <p className="flex flex-wrap gap-2">
                {detail.caseType && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    사건종류: {detail.caseType}
                  </span>
                )}
                {detail.judgmentType && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                    판결유형: {detail.judgmentType}
                  </span>
                )}
              </p>
            )}
          </header>

          {detail.title === "(본문 제공 불가)" ? (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm dark:border-yellow-900/40 dark:bg-yellow-900/10">
              <p className="font-medium text-yellow-900 dark:text-yellow-200">
                본문을 API에서 받을 수 없는 판례입니다.
              </p>
              <p className="mt-2 text-yellow-900/80 dark:text-yellow-100/80">{detail.reasoning}</p>
              {detail.sourceUrl && (
                <a
                  href={detail.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-block rounded-md bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700"
                >
                  법제처 원문 열기 ↗
                </a>
              )}
            </div>
          ) : (
            <>
              {detail.holdings && (
                <details className="mb-2 rounded border bg-muted/20 p-2" open>
                  <summary className="cursor-pointer text-sm font-semibold">판시사항</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <HighlightedText text={detail.holdings} query={query} />
                  </p>
                </details>
              )}
              {detail.summary && (
                <details className="mb-2 rounded border bg-muted/20 p-2" open>
                  <summary className="cursor-pointer text-sm font-semibold">판결요지</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <HighlightedText text={detail.summary} query={query} />
                  </p>
                </details>
              )}
              {detail.ruling && (
                <details className="mb-2 rounded border bg-muted/20 p-2">
                  <summary className="cursor-pointer text-sm font-semibold">주문</summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <HighlightedText text={detail.ruling} query={query} />
                  </p>
                </details>
              )}
              {(detail.refLawsStructured && detail.refLawsStructured.length > 0) ||
              detail.refLaws ? (
                <details className="mb-2 rounded border bg-muted/20 p-2" open>
                  <summary className="cursor-pointer text-sm font-semibold">
                    참조 조문
                    {detail.refLawsStructured && detail.refLawsStructured.length > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        (클릭 시 조문 본문 조회)
                      </span>
                    )}
                  </summary>
                  {detail.refLawsStructured && detail.refLawsStructured.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detail.refLawsStructured.map((r, i) => (
                        <RefLawChip key={`${r.lawName}-${r.articleNo}-${i}`} lawRef={r} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {detail.refLaws}
                    </p>
                  )}
                </details>
              ) : null}
              {(detail.refPrecedentsStructured && detail.refPrecedentsStructured.length > 0) ||
              detail.refPrecedents ? (
                <details className="mb-2 rounded border bg-muted/20 p-2">
                  <summary className="cursor-pointer text-sm font-semibold">참조 판례</summary>
                  {detail.refPrecedentsStructured && detail.refPrecedentsStructured.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detail.refPrecedentsStructured.map((r, i) => (
                        <RefPrecedentChip key={`${r.court}-${r.caseNo}-${i}`} precRef={r} />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                      {detail.refPrecedents}
                    </p>
                  )}
                </details>
              ) : null}
              {detail.reasoning && (
                <details className="rounded border bg-muted/20 p-2" open>
                  <summary className="flex items-center justify-between text-sm font-semibold">
                    <span className="cursor-pointer">이유 / 전문</span>
                    {detail.compacted && detail.id && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          openDetail(detail.id, true);
                        }}
                        className="rounded border px-2 py-0.5 text-xs font-normal hover:bg-accent"
                      >
                        전문 보기
                      </button>
                    )}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    <HighlightedText text={detail.reasoning} query={query} />
                  </p>
                </details>
              )}
              {detail.sourceUrl && (
                <p className="mt-3 text-xs text-muted-foreground">
                  <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    법제처 원문에서 전체 보기 ↗
                  </a>
                </p>
              )}
            </>
          )}
        </article>
      )}
    </div>
  );
}

function OptionField({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-md border bg-background px-2 py-1.5 text-sm"
      />
    </label>
  );
}

/** 도메인별 허용 옵션 키 집합 (client.ts:DOMAIN_OPTION_WHITELIST와 동기) */
function allowedOptionsForDomain(domain: DecisionDomain): Set<string> {
  switch (domain) {
    case "prec":
      return new Set(["curt", "caseNumber", "fromDate", "toDate"]);
    case "ppc":
      return new Set(["cls", "gana", "dpaYd", "rslYd"]);
    case "detc":
    case "admrul":
      return new Set(["knd", "inq", "rpl"]);
    case "expc":
      return new Set(["caseNumber", "fromDate", "toDate"]);
    case "trty":
      return new Set(["cls", "natCd", "eftYd", "concYd"]);
    case "ordin":
      return new Set(["locGov"]);
    default:
      return new Set();
  }
}
