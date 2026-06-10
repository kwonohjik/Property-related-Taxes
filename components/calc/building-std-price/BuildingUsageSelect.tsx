"use client";

/**
 * 건물 용도 드롭다운 — 해당 연도 용도지수표 옵션(listUsageOptions). 번호(usageNo) 기반.
 * 연도별 항목 수·번호 체계 상이(시대별 스킴). 기계식주차(maxGeneralNo+1)는 제외(별도 토글).
 */
import { useMemo } from "react";
import { Select, SelectTrigger, SelectContent, SelectItem } from "@/components/ui/select";
import { listUsageOptions } from "@/lib/tax-engine/data/building-standard-price";

interface Props {
  /** 용도지수표 기준 연도 */
  year: number | undefined;
  /** 선택된 용도번호(문자열) */
  value: string;
  onChange: (usageNo: string) => void;
  placeholder?: string;
}

export function BuildingUsageSelect({ year, value, onChange, placeholder = "용도 선택" }: Props) {
  const options = useMemo(() => (year ? listUsageOptions(year) : []), [year]);
  const selected = options.find((o) => String(o.no) === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? "")} disabled={!year}>
      <SelectTrigger className="h-9 w-full">
        <span className={selected ? "" : "text-muted-foreground"}>
          {selected ? `${selected.label} (지수 ${selected.index})` : placeholder}
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.no} value={String(o.no)}>
            {o.no}. {o.label} (지수 {o.index})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
