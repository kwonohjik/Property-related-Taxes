"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { BusinessUsePeriodsInput } from "./shared/BusinessUsePeriodsInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface PastureDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

const LIVESTOCK_OPTIONS = [
  { value: "hanwoo", label: "한우" },
  { value: "dairy", label: "젖소" },
  { value: "pig_sow", label: "돼지(모돈)" },
  { value: "pig_fattening", label: "돼지(비육)" },
  { value: "poultry", label: "가금" },
  { value: "horse", label: "말" },
  { value: "sheep", label: "양" },
  { value: "goat", label: "염소" },
] as const;

export function PastureDetailSection({
  asset,
  onAssetChange,
}: PastureDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="목장용지 세부 정보"
        description="§168-10 목장용지 판정"
      />

      <FieldCard label="축산업 영위">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblPastureIsLivestockOperator}
            onChange={(e) => onAssetChange({ nblPastureIsLivestockOperator: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">축산업 영위</span>
        </label>
      </FieldCard>

      <FieldCard label="축종">
        <select
          value={asset.nblPastureLivestockType}
          onChange={(e) => onAssetChange({ nblPastureLivestockType: e.target.value })}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택 안 함</option>
          {LIVESTOCK_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </FieldCard>

      <FieldCard label="사육 두수" unit="두">
        <input
          type="number"
          value={asset.nblPastureLivestockCount}
          onChange={(e) => onAssetChange({ nblPastureLivestockCount: e.target.value })}
          onFocus={(e) => e.target.select()}
          min={0}
          placeholder="0"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      <FieldCard label="상속일">
        <DateInput
          value={asset.nblPastureInheritanceDate}
          onChange={(v) => onAssetChange({ nblPastureInheritanceDate: v })}
        />
        <p className="text-xs text-muted-foreground mt-1">상속 3년 내 해당 시 입력</p>
      </FieldCard>

      <FieldCard label="특수법인 직접 사용">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblPastureIsSpecialOrgUse}
            onChange={(e) => onAssetChange({ nblPastureIsSpecialOrgUse: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">사회복지법인·학교·종교·정당 직접 사용</span>
        </label>
      </FieldCard>

      <FieldCard label="축산 사육기간">
        <BusinessUsePeriodsInput
          periods={asset.nblPastureLivestockPeriods}
          onChange={(periods) => onAssetChange({ nblPastureLivestockPeriods: periods })}
          label="축산 사육기간"
        />
      </FieldCard>
    </div>
  );
}
