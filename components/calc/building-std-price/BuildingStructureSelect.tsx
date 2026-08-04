"use client";

/**
 * 건물 구조 드롭다운 — 해당 연도 구조지수표 개별 구조명 옵션(listStructureOptions).
 * 연도별 옵션셋 상이. 옵션은 지수 내림차순(데이터 함수가 정렬). SelectValue 단독 금지 → 명시 라벨.
 */
import { useMemo } from "react";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { listStructureOptions } from "@/lib/tax-engine/data/building-standard-price";

interface Props {
  /** 구조지수표 기준 연도(취득 2000이전 = 2001) */
  year: number | undefined;
  value: string;
  onChange: (key: string) => void;
  placeholder?: string;
}

export function BuildingStructureSelect({ year, value, onChange, placeholder = "구조 선택" }: Props) {
  const options = useMemo(() => (year ? listStructureOptions(year) : []), [year]);
  const selected = options.find((o) => o.key === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")} disabled={!year}>
      <SelectTrigger className="h-9 w-full">
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? `${selected.label} (지수 ${selected.index})` : placeholder}
        </span>
      </SelectTrigger>
      {/* 폭만 넓힌다 — 이유는 BuildingUsageSelect 주석 참조(alignItemWithTrigger 회귀). */}
      <SelectContent className="w-auto max-w-[min(92vw,44rem)] min-w-(--anchor-width) [&_[data-slot=select-item]]:items-start [&_[data-slot=select-item]>div]:whitespace-normal">
        {options.map((o) => (
          <SelectItem key={o.key} value={o.key}>
            {o.label} (지수 {o.index})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
