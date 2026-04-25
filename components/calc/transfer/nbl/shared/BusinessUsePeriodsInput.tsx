"use client";

import { DateInput } from "@/components/ui/date-input";
import type { NblBusinessUsePeriod } from "@/lib/stores/calc-wizard-store";

export interface BusinessUsePeriodsInputProps {
  periods: NblBusinessUsePeriod[];
  onChange: (periods: NblBusinessUsePeriod[]) => void;
  label?: string;
}

export function BusinessUsePeriodsInput({
  periods,
  onChange,
  label = "사업용 사용기간",
}: BusinessUsePeriodsInputProps) {
  function addPeriod() {
    onChange([...periods, { startDate: "", endDate: "", usageType: "자경" }]);
  }

  function removePeriod(i: number) {
    onChange(periods.filter((_, idx) => idx !== i));
  }

  function updatePeriod(i: number, patch: Partial<NblBusinessUsePeriod>) {
    onChange(periods.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  return (
    <div className="space-y-2">
      {periods.length === 0 && (
        <p className="text-xs text-muted-foreground">등록된 기간이 없습니다.</p>
      )}
      {periods.map((p, i) => (
        <div
          key={i}
          className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end rounded-md border px-3 py-2 bg-muted/30"
        >
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">시작일</label>
            <DateInput value={p.startDate} onChange={(v) => updatePeriod(i, { startDate: v })} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">종료일</label>
            <DateInput value={p.endDate} onChange={(v) => updatePeriod(i, { endDate: v })} />
          </div>
          <div className="space-y-1">
            <label className="block text-xs text-muted-foreground">사용 형태</label>
            <input
              type="text"
              value={p.usageType}
              onChange={(e) => updatePeriod(i, { usageType: e.target.value })}
              onFocus={(e) => e.target.select()}
              placeholder="자경"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <button
            type="button"
            onClick={() => removePeriod(i)}
            className="text-xs text-destructive hover:text-destructive/80 px-2 py-1.5 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors"
            aria-label={`${label} ${i + 1}번 삭제`}
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addPeriod}
        className="text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors"
      >
        + 기간 추가
      </button>
    </div>
  );
}
