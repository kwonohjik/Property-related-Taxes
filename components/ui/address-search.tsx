"use client";

/**
 * AddressSearch — Vworld API 기반 도로명/지번 주소 검색 컴포넌트
 *
 * - 입력 후 300ms debounce → /api/address/search 호출
 * - 드롭다운에서 선택 시 도로명·지번·건물명·좌표를 상위로 전달
 * - 선택된 주소는 하단 요약 박스로 표시
 * - 상세주소(동/호수)는 별도 input으로 입력
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface AddressValue {
  road: string;
  jibun: string;
  building: string;
  detail: string;
  lng: string;
  lat: string;
}

interface AddressResult {
  id: string;
  title: string;
  road: string;
  jibun: string;
  building: string;
  zipcode: string;
  lng: string;
  lat: string;
}

interface AddressSearchProps {
  value: AddressValue;
  onChange: (v: AddressValue) => void;
  className?: string;
  disabled?: boolean;
}

export function AddressSearch({ value, onChange, className, disabled }: AddressSearchProps) {
  const [query, setQuery] = useState(value.road || value.jibun || "");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // 외부 value 변경 시 검색어 동기화 (리셋 등)
  useEffect(() => {
    const external = value.road || value.jibun;
    if (!external && query) setQuery("");
  }, [value.road, value.jibun]);

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setSearched(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setSearched(false);
    try {
      const res = await fetch(`/api/address/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "주소 검색 중 오류가 발생했습니다.");
        setResults([]);
      } else {
        setResults(data.results ?? []);
      }
      setIsOpen(true);
      setSearched(true);
    } catch {
      setError("네트워크 오류로 검색에 실패했습니다.");
      setResults([]);
      setIsOpen(true);
      setSearched(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(q), 300);
  }

  function handleSelect(r: AddressResult) {
    setQuery(r.road || r.jibun);
    setIsOpen(false);
    onChange({
      road: r.road,
      jibun: r.jibun,
      building: r.building,
      detail: value.detail, // 상세주소는 유지
      lng: r.lng,
      lat: r.lat,
    });
  }

  function handleDetailChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, detail: e.target.value });
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSearched(false);
    onChange({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "" });
  }

  const hasSelected = Boolean(value.road || value.jibun);

  return (
    <div ref={containerRef} className={cn("space-y-2", className)}>
      {/* 검색 입력 */}
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={(e) => {
            e.target.select();
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="도로명 또는 지번 주소 입력 (예: 테헤란로 123)"
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-20 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        />
        <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs text-muted-foreground">
          {isLoading ? "검색중..." : "🔍"}
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* 검색 결과 드롭다운 */}
      {isOpen && (
        <div className="relative">
          <div className="absolute left-0 right-0 top-0 z-50 max-h-72 overflow-auto rounded-md border border-border bg-background shadow-lg">
            {results.length > 0 ? (
              <ul className="divide-y divide-border">
                {results.map((r, idx) => (
                  <li key={`${r.id}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => handleSelect(r)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium">{r.road || r.jibun}</span>
                      {r.road && r.jibun && (
                        <span className="text-xs text-muted-foreground">
                          <span className="inline-block rounded bg-muted px-1.5 py-0.5 mr-1 text-[10px] font-medium">
                            지번
                          </span>
                          {r.jibun}
                        </span>
                      )}
                      {r.building && (
                        <span className="text-xs text-muted-foreground">🏢 {r.building}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              searched &&
              !isLoading && (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  검색 결과가 없습니다. 도로명 또는 지번 주소를 정확히 입력해 주세요.
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* 선택된 주소 요약 */}
      {hasSelected && (
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5">
              {value.road && (
                <p>
                  <span className="inline-block rounded bg-primary/10 px-1.5 py-0.5 mr-1 text-[10px] font-semibold text-primary">
                    도로명
                  </span>
                  <span className="font-medium">{value.road}</span>
                </p>
              )}
              {value.jibun && (
                <p className="text-xs text-muted-foreground">
                  <span className="inline-block rounded bg-muted px-1.5 py-0.5 mr-1 text-[10px] font-medium">
                    지번
                  </span>
                  {value.jibun}
                </p>
              )}
              {value.building && (
                <p className="text-xs text-muted-foreground">🏢 {value.building}</p>
              )}
              {value.lng && value.lat && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  좌표: {Number(value.lng).toFixed(6)}, {Number(value.lat).toFixed(6)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={handleClear}
              disabled={disabled}
              className="shrink-0 text-xs text-muted-foreground hover:text-destructive disabled:opacity-50"
            >
              지우기
            </button>
          </div>
        </div>
      )}

      {/* 상세주소 */}
      {hasSelected && (
        <div>
          <input
            type="text"
            value={value.detail}
            onChange={handleDetailChange}
            onFocus={(e) => e.target.select()}
            placeholder="상세주소 (동/호수/층 등 — 선택)"
            disabled={disabled}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
        </div>
      )}
    </div>
  );
}
