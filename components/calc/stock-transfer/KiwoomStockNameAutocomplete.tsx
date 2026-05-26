"use client";

/**
 * KiwoomStockNameAutocomplete — F-10 종목명 자동완성 typeahead.
 *
 * 사용자가 종목명 입력 → 300ms debounce → /api/kiwoom/search-by-name 호출
 * → top 10 후보 dropdown → 클릭/Enter 선택 시 securityCode·marketType·tradingHalt 자동 mirror.
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (선택 onClick 핸들러 내 직접 onChange)
 *   - 자동 fallback 채움 0건 (네트워크 실패 silent, 사용자 수동 입력 유지)
 */

import { useEffect, useRef, useState } from "react";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface Match {
  stockCode: string;
  stockName: string;
  marketCode: string;
  marketName: string;
  marketTypeStore: "kospi" | "kosdaq" | "konex" | "";
  tradingHalt: boolean;
  adminIssue: boolean;
}

interface Props {
  value: string; // form.securityName
  onChange: (patch: Partial<StockTransferFormData>) => void;
  placeholder?: string;
  className?: string;
}

export function KiwoomStockNameAutocomplete({
  value,
  onChange,
  placeholder = "종목명을 입력하세요",
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // debounce 검색 (useEffect 사용 OK — store mirror 아닌 로컬 검색 결과 fetching)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = value.trim();
    if (q.length < 1) {
      setMatches([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/kiwoom/search-by-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: q, limit: 10 }),
        });
        if (!res.ok) {
          setMatches([]);
          return;
        }
        const data = (await res.json()) as { matches: Match[] };
        setMatches(data.matches);
        setActiveIdx(-1);
      } catch {
        setMatches([]);
      } finally {
        setLoading(false);
      }
    }, 300);
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

  function selectMatch(m: Match) {
    // 자동 mirror — onChange 단일 호출 (useEffect → store 미러링 금지 정책)
    onChange({
      securityName: m.stockName,
      securityCode: m.stockCode,
      marketType: m.marketTypeStore || "",
      kiwoomTradingHalt: m.tradingHalt,
    });
    setOpen(false);
    setMatches([]);
    setActiveIdx(-1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || matches.length === 0) return;
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
    <div ref={containerRef} className="relative" data-enter-nav="off">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange({ securityName: e.target.value });
          setOpen(true);
        }}
        onFocus={() => {
          if (matches.length > 0) setOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
      />
      {open && (loading || matches.length > 0) && (
        <ul className="absolute z-50 mt-1 w-full max-h-72 overflow-y-auto rounded-md border border-sky-200 bg-white shadow-lg text-sm">
          {loading && matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">🔄 검색 중...</li>
          )}
          {matches.map((m, i) => (
            <li
              key={m.stockCode}
              onMouseDown={(e) => {
                e.preventDefault(); // input blur 방지
                selectMatch(m);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`px-3 py-2 cursor-pointer flex justify-between items-center ${
                i === activeIdx ? "bg-sky-100" : "hover:bg-sky-50"
              }`}
            >
              <span className="flex-1">
                <span className="font-semibold">{m.stockName}</span>
                <span className="ml-2 text-xs text-muted-foreground">{m.stockCode}</span>
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
