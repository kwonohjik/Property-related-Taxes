"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { SigunguSelect } from "./shared/SigunguSelect";
import type { AssetForm, ResidenceHistoryInput } from "@/lib/stores/calc-wizard-store";

export interface ResidenceHistorySectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function ResidenceHistorySection({
  asset,
  onAssetChange,
}: ResidenceHistorySectionProps) {
  const histories = asset.nblResidenceHistories ?? [];

  function updateHistory(i: number, patch: Partial<ResidenceHistoryInput>) {
    const updated = histories.map((h, idx) => (idx === i ? { ...h, ...patch } : h));
    onAssetChange({ nblResidenceHistories: updated });
  }

  function addHistory() {
    onAssetChange({
      nblResidenceHistories: [
        ...histories,
        { sigunguCode: "", sigunguName: "", startDate: "", endDate: "", hasResidentRegistration: false },
      ],
    });
  }

  function removeHistory(i: number) {
    onAssetChange({ nblResidenceHistories: histories.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="소유자 거주 이력"
        description="농지 자경·임야 재촌 판정에 사용됩니다."
      />

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
        임야의 경우 주민등록이 있어야 재촌이 인정됩니다.
      </div>

      {histories.length === 0 && (
        <p className="text-xs text-muted-foreground">등록된 거주 이력이 없습니다.</p>
      )}

      {histories.map((h, i) => (
        <div key={i} className="space-y-2 rounded-lg border px-4 py-3 bg-card">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">거주지 {i + 1}</span>
            <button
              type="button"
              onClick={() => removeHistory(i)}
              className="text-xs text-destructive hover:text-destructive/80 px-2 py-1 rounded border border-destructive/30 hover:bg-destructive/10 transition-colors"
            >
              삭제
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">시작일</label>
              <DateInput
                value={h.startDate}
                onChange={(v) => updateHistory(i, { startDate: v })}
              />
            </div>
            <div className="space-y-1">
              <label className="block text-xs text-muted-foreground">종료일</label>
              <DateInput
                value={h.endDate}
                onChange={(v) => updateHistory(i, { endDate: v })}
              />
            </div>
          </div>

          <FieldCard label="시군구">
            <SigunguSelect
              code={h.sigunguCode}
              name={h.sigunguName}
              onChange={(c, n) => updateHistory(i, { sigunguCode: c, sigunguName: n })}
            />
          </FieldCard>

          <FieldCard label="주민등록">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={h.hasResidentRegistration}
                onChange={(e) => updateHistory(i, { hasResidentRegistration: e.target.checked })}
                className="h-4 w-4 rounded accent-primary"
              />
              <span className="text-sm">주민등록 있음</span>
            </label>
          </FieldCard>
        </div>
      ))}

      <button
        type="button"
        onClick={addHistory}
        className="text-xs text-primary hover:text-primary/80 px-3 py-1.5 rounded border border-primary/30 hover:bg-primary/10 transition-colors"
      >
        + 거주지 추가
      </button>

      {/* 거주지 이력 미입력 시 fallback — 거주지~토지 직선거리로 재촌 판정 */}
      {histories.length === 0 && (
        <FieldCard
          label="직선거리 (km)"
          hint="거주지 이력 미입력 시 대체 판정에 사용됩니다. (소득령 §168-8)"
        >
          <input
            type="number"
            min="0"
            step="0.1"
            value={asset.nblFarmerResidenceDistance}
            onChange={(e) => onAssetChange({ nblFarmerResidenceDistance: e.target.value })}
            onFocus={(e) => e.target.select()}
            placeholder="0.0"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FieldCard>
      )}
    </div>
  );
}
