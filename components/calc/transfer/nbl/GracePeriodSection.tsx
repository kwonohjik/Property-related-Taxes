"use client";

import { DateInput } from "@/components/ui/date-input";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import type { AssetForm, GracePeriodInput } from "@/lib/stores/calc-wizard-store";

const GRACE_TYPE_OPTIONS: { value: GracePeriodInput["type"]; label: string }[] = [
  { value: "inheritance",        label: "상속으로 인한 부득이" },
  { value: "legal_restriction",  label: "법령상 사용 제한" },
  { value: "sale_contract",      label: "매매계약 중" },
  { value: "construction",       label: "공사 중" },
  { value: "unavoidable",        label: "질병·취학·근무상 형편" },
  { value: "preparation",        label: "사업 준비 중" },
  { value: "land_replotting",    label: "환지처분 대기" },
];

export function GracePeriodSection({
  asset,
  onAssetChange,
}: {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}) {
  const periods = asset.nblGracePeriods ?? [];

  function addPeriod() {
    onAssetChange({
      nblGracePeriods: [
        ...periods,
        { type: "unavoidable", startDate: "", endDate: "", description: "" },
      ],
    });
  }

  function removePeriod(idx: number) {
    onAssetChange({ nblGracePeriods: periods.filter((_, i) => i !== idx) });
  }

  function updatePeriod(idx: number, patch: Partial<GracePeriodInput>) {
    onAssetChange({
      nblGracePeriods: periods.map((p, i) => (i === idx ? { ...p, ...patch } : p)),
    });
  }

  return (
    <div className="space-y-3">
      <SectionHeader
        title="부득이한 사유 유예기간 (§168-14①)"
        description="해당 기간은 사업용 사용 기간에 가산됩니다."
      />

      {periods.length === 0 && (
        <p className="text-xs text-muted-foreground px-1">
          부득이한 사유가 없으면 비워두세요.
        </p>
      )}

      {periods.map((p, idx) => (
        <div key={idx} className="rounded-lg border border-dashed border-border/60 bg-muted/10 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">유예기간 {idx + 1}</span>
            <button
              type="button"
              onClick={() => removePeriod(idx)}
              className="text-xs text-destructive hover:underline"
            >
              삭제
            </button>
          </div>

          <FieldCard label="사유">
            <select
              value={p.type}
              onChange={(e) => updatePeriod(idx, { type: e.target.value as GracePeriodInput["type"] })}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GRACE_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </FieldCard>

          <div className="grid grid-cols-2 gap-2">
            <FieldCard label="시작일">
              <DateInput
                value={p.startDate}
                onChange={(v) => updatePeriod(idx, { startDate: v })}
              />
            </FieldCard>
            <FieldCard label="종료일">
              <DateInput
                value={p.endDate}
                onChange={(v) => updatePeriod(idx, { endDate: v })}
              />
            </FieldCard>
          </div>

          <FieldCard label="설명" hint="간략한 사유 메모 (선택)">
            <input
              type="text"
              value={p.description}
              onChange={(e) => updatePeriod(idx, { description: e.target.value })}
              onFocus={(e) => e.target.select()}
              placeholder="예: 질병으로 인한 입원 기간"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FieldCard>
        </div>
      ))}

      <button
        type="button"
        onClick={addPeriod}
        className="w-full rounded-lg border border-dashed border-border py-2 text-xs text-primary hover:border-primary/50 hover:bg-primary/5 transition-colors"
      >
        + 유예기간 추가
      </button>
    </div>
  );
}
