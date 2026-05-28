"use client";

/**
 * InheritanceStockNameAutocomplete — 상속·증여 상장주식 종목명 typeahead.
 *
 * 회사명 입력 → 300ms debounce → /api/kiwoom/search-by-name 호출
 * → top 10 후보 dropdown → 선택 시 onSelect로 stockCode·stockName 동시 전달.
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (선택 onMouseDown 핸들러에서 onSelect 직접 호출)
 *   - 자동 fallback 채움 0건 (네트워크 실패 silent, 수동 입력 유지)
 *   - EnterKeyNavigationProvider 옵트아웃 (data-enter-nav="off")
 *   - SelectOnFocusProvider 전역 적용 → 별도 onFocus select 불필요
 *
 * Design: docs/02-design/features/listed-stock-name-typeahead.design.md §3
 */

import { useEffect, useId, useRef, useState } from "react";

export interface InheritanceStockMatch {
  stockCode: string;
  stockName: string;
  marketName: string;
  tradingHalt: boolean;
}

interface ApiMatch extends InheritanceStockMatch {
  marketCode: string;
  marketTypeStore: string;
  adminIssue: boolean;
}

interface Props {
  value: string;
  onSelect: (match: InheritanceStockMatch) => void;
  onNameChange: (name: string) => void;
  placeholder?: string;
  className?: string;
  testId?: string;
}

const DEBOUNCE_MS = 300;
const FETCH_TIMEOUT_MS = 5000;

export function InheritanceStockNameAutocomplete({
  value,
  onSelect,
  onNameChange,
  placeholder = "종목명 검색 또는 자동조회 시 자동 입력 (예: 삼성전자)",
  className,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<InheritanceStockMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFetchedQRef = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);
  const listboxId = useId();

  // debounce 검색 — value 외부 변경 시 lastFetchedQRef 가드로 fetch skip (C14)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setMatches([]);
      return;
    }
    if (q === lastFetchedQRef.current) {
      return;
    }
    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      setLoading(true);
      try {
        const res = await fetch("/api/kiwoom/search-by-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 10 }),
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (!res.ok) {
          setMatches([]);
          return;
        }
        const data = (await res.json()) as { matches: ApiMatch[] };
        setMatches(
          data.matches.map((m) => ({
            stockCode: m.stockCode,
            stockName: m.stockName,
            marketName: m.marketName,
            tradingHalt: m.tradingHalt,
          })),
        );
        setActiveIdx(-1);
        lastFetchedQRef.current = q;
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // 외부 클릭 시 dropdown 닫기
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectMatch(m: InheritanceStockMatch) {
    onSelect(m);
    setOpen(false);
    setMatches([]);
    setActiveIdx(-1);
    lastFetchedQRef.current = m.stockName;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectMatch(matches[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      data-enter-nav="off"
      data-testid={testId}
    >
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={
          activeIdx >= 0 ? `${listboxId}-opt-${activeIdx}` : undefined
        }
        value={value}
        onChange={(e) => {
          lastFetchedQRef.current = "";
          onNameChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (matches.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        data-testid={testId ? `${testId}-input` : undefined}
      />
      {open && (loading || matches.length > 0) && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-sky-200 bg-white shadow-lg text-sm"
        >
          {loading && matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              🔄 검색 중...
            </li>
          )}
          {matches.map((m, i) => (
            <li
              key={m.stockCode}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                e.preventDefault();
                selectMatch(m);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                i === activeIdx ? "bg-sky-100" : "hover:bg-sky-50"
              }`}
            >
              <span className="flex-1">
                <span className="font-semibold">{m.stockName}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {m.stockCode}
                </span>
              </span>
              <span className="text-xs text-sky-700 bg-sky-50 px-1.5 py-0.5 rounded">
                {m.marketName}
              </span>
              {m.tradingHalt && (
                <span className="ml-1 text-xs text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded">
                  거래정지
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
