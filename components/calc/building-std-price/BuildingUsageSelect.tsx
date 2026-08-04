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
      {/* 폭만 넓힌다 — `alignItemWithTrigger`를 끄면 팝업이 스크롤 컨테이너가 되어
          목록 아래쪽 항목이 뷰포트 밖에 남아 클릭 불가가 된다(2023 기준시가 계산서 E2E 회귀). */}
      <SelectContent className="w-auto max-w-[min(92vw,44rem)] min-w-(--anchor-width) [&_[data-slot=select-item]]:items-start [&_[data-slot=select-item]>div]:whitespace-normal">
        {options.map((o) => (
          <SelectItem key={o.no} value={String(o.no)}>
            {o.no}. {o.label} (지수 {o.index})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
