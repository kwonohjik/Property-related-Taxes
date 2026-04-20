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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface AddressValue {
  road: string;
  jibun: string;
  building: string;
  detail: string;
  lng: string;
  lat: string;
  pnu?: string;
}

interface UnitItem {
  dong: string;
  ho: string;
  floor: string;
  exclusiveArea?: number;
  price: number;
  year: string;
  announcedDate?: string;
}

interface AddressResult {
  pnu: string;
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

  const [units, setUnits] = useState<UnitItem[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [selectedDong, setSelectedDong] = useState<string>("");
  const [selectedHo, setSelectedHo] = useState<string>("");

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

  async function fetchUnits(pnu: string, jibun: string) {
    setUnitsLoading(true);
    setUnits([]);
    try {
      const base = new URLSearchParams({ propertyType: "housing" });
      // jibun 기반 PNU 구성이 Vworld 검색 item.id보다 정확
      if (jibun) {
        base.set("jibun", jibun);
      } else if (pnu && pnu.length === 19) {
        base.set("pnu", pnu);
      } else {
        return;
      }

      // 현재 연도부터 최대 3년 전까지 순차 시도 (NED 데이터 공표 시차 대응)
      const currentYear = new Date().getFullYear();
      for (let y = currentYear; y >= currentYear - 3; y--) {
        const params = new URLSearchParams(base);
        params.set("year", String(y));
        const res = await fetch(`/api/address/standard-price?${params.toString()}`);
        if (!res.ok) continue;
        const data = await res.json();
        if ((data.units ?? []).length > 0) {
          setUnits(data.units);
          return;
        }
      }
    } catch {
      // API 실패 시 텍스트 input fallback (units 빈 배열 유지)
    } finally {
      setUnitsLoading(false);
    }
  }

  function handleSelect(r: AddressResult) {
    setQuery(r.road || r.jibun);
    setIsOpen(false);
    setSelectedDong("");
    setSelectedHo("");
    setUnits([]);
    onChange({
      road: r.road,
      jibun: r.jibun,
      building: r.building,
      detail: "",
      lng: r.lng,
      lat: r.lat,
      pnu: r.pnu,
    });
    if (r.pnu || r.jibun) void fetchUnits(r.pnu, r.jibun);
  }

  function handleDetailChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange({ ...value, detail: e.target.value });
  }

  function handleClear() {
    setQuery("");
    setResults([]);
    setIsOpen(false);
    setSearched(false);
    setUnits([]);
    setSelectedDong("");
    setSelectedHo("");
    onChange({ road: "", jibun: "", building: "", detail: "", lng: "", lat: "", pnu: "" });
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
                  <li key={`${r.pnu}-${idx}`}>
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
        <div className="space-y-2">
          {unitsLoading ? (
            <div className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground">
              동/호수 조회 중...
            </div>
          ) : units.length > 0 ? (
            <UnitSelector
              units={units}
              selectedDong={selectedDong}
              selectedHo={selectedHo}
              disabled={disabled}
              onDongChange={(dong) => {
                setSelectedDong(dong);
                setSelectedHo("");
                onChange({ ...value, detail: dong });
              }}
              onHoChange={(ho) => {
                setSelectedHo(ho);
                onChange({ ...value, detail: [selectedDong, ho].filter(Boolean).join(" ") });
              }}
            />
          ) : (
            <input
              type="text"
              value={value.detail}
              onChange={handleDetailChange}
              onFocus={(e) => e.target.select()}
              placeholder="상세주소 (동/호수/층 등 — 선택)"
              disabled={disabled}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────
// 동/호수 드롭다운 서브컴포넌트
// ──────────────────────────────────────────────────

interface UnitSelectorProps {
  units: UnitItem[];
  selectedDong: string;
  selectedHo: string;
  disabled?: boolean;
  onDongChange: (dong: string) => void;
  onHoChange: (ho: string) => void;
}

// "101동" → 101, "3703호" → 3703, "202" → 202 으로 앞 숫자 추출 후 비교
function sortNaturalKo(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b, "ko", { numeric: true, sensitivity: "base" });
}

// 호수에서 층 번호 추출 (1804→"18층", 305→"3층", 기타→"")
function extractFloor(ho: string): string {
  const num = ho.replace(/[^0-9]/g, "");
  if (num.length >= 4) return `${parseInt(num.slice(0, num.length - 2), 10)}층`;
  if (num.length === 3) return `${parseInt(num.slice(0, 1), 10)}층`;
  return "";
}

// 층별 네비게이션 바가 있는 호수 커스텀 드롭다운
function HoSelector({
  value,
  hos,
  disabled,
  placeholder,
  onChange,
}: {
  value: string;
  hos: string[];
  disabled?: boolean;
  placeholder: string;
  onChange: (ho: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const floorRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // 층 그룹핑
  const floorGroups = hos.reduce<Record<string, string[]>>((acc, ho) => {
    const floor = extractFloor(ho) || "기타";
    if (!acc[floor]) acc[floor] = [];
    acc[floor].push(ho);
    return acc;
  }, {});
  const floors = Object.keys(floorGroups);
  const hasFloors = floors.length > 1;

  // 외부 클릭 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const scrollToFloor = (floor: string) => {
    const el = floorRefs.current[floor];
    if (el && scrollRef.current) {
      const containerTop = scrollRef.current.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      scrollRef.current.scrollTop += elTop - containerTop - 4;
    }
  };

  if (!hasFloors) {
    // 층 구분 없으면 기본 Select 유지
    return (
      <Select value={value} onValueChange={(v) => v && onChange(v)} disabled={disabled}>
        <SelectTrigger className="flex-1 text-sm">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {hos.map((ho) => (
            <SelectItem key={ho} value={ho}>
              {ho}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <div ref={dropdownRef} className="relative flex-1">
      {/* 트리거 버튼 */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs ring-offset-background",
          "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "ring-2 ring-ring ring-offset-2"
        )}
      >
        <span className={cn(!value && "text-muted-foreground")}>{value || placeholder}</span>
        <svg className="h-4 w-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* 드롭다운 패널 */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
          <div className="flex" style={{ height: "220px" }}>
            {/* 호수 목록 */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto py-1">
              {floors.map((floor) => (
                <div
                  key={floor}
                  ref={(el) => { floorRefs.current[floor] = el; }}
                >
                  <div className="px-3 py-0.5 text-[10px] font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                    {floor}
                  </div>
                  {floorGroups[floor].map((ho) => (
                    <div
                      key={ho}
                      onClick={() => { onChange(ho); setOpen(false); }}
                      className={cn(
                        "px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                        ho === value && "bg-accent font-medium"
                      )}
                    >
                      {ho}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* 층 네비게이션 바 */}
            <div className="flex flex-col overflow-y-auto border-l bg-muted/30 py-1" style={{ minWidth: "36px" }}>
              {floors.map((floor) => (
                <button
                  key={floor}
                  type="button"
                  onClick={() => scrollToFloor(floor)}
                  className="px-1 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-center leading-tight"
                >
                  {floor.replace("층", "")}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UnitSelector({ units, selectedDong, selectedHo, disabled, onDongChange, onHoChange }: UnitSelectorProps) {
  // 고유 동 목록 — 숫자 오름차순 (예: 1동 < 2동 < 10동 < 101동)
  const uniqueDongs = Array.from(new Set(units.map((u) => u.dong))).sort(sortNaturalKo);
  const hasDongColumn = uniqueDongs.some((d) => d !== "");

  // 선택된 동에 해당하는 호 목록 — 숫자 오름차순
  const filteredHos = units
    .filter((u) => !hasDongColumn || u.dong === selectedDong)
    .map((u) => u.ho)
    .filter((ho) => ho !== "");
  const uniqueHos = Array.from(new Set(filteredHos)).sort(sortNaturalKo);

  return (
    <div className="flex gap-2">
      {hasDongColumn && (
        <Select value={selectedDong} onValueChange={(v) => v && onDongChange(v)} disabled={disabled}>
          <SelectTrigger className="flex-1 text-sm">
            <SelectValue placeholder="동 선택" />
          </SelectTrigger>
          <SelectContent>
            {uniqueDongs.map((dong) => (
              <SelectItem key={dong} value={dong}>
                {dong || "단동"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <HoSelector
        value={selectedHo}
        hos={uniqueHos}
        disabled={disabled || (hasDongColumn && !selectedDong)}
        placeholder={hasDongColumn && !selectedDong ? "동 먼저 선택" : "호수 선택"}
        onChange={onHoChange}
      />
    </div>
  );
}
