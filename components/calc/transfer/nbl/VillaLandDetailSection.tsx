"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { BusinessUsePeriodsInput } from "./shared/BusinessUsePeriodsInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface VillaLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function VillaLandDetailSection({
  asset,
  onAssetChange,
}: VillaLandDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="별장 부속토지 세부 정보"
        description="§168-13 별장 판정"
      />

      <FieldCard label="별장 사용기간">
        <BusinessUsePeriodsInput
          periods={asset.nblVillaUsePeriods}
          onChange={(periods) => onAssetChange({ nblVillaUsePeriods: periods })}
          label="별장 사용기간"
        />
      </FieldCard>

      <FieldCard label="읍·면 지역">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblVillaIsEupMyeon}
            onChange={(e) => onAssetChange({ nblVillaIsEupMyeon: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">읍·면 지역 소재</span>
        </label>
      </FieldCard>

      <FieldCard label="농어촌주택 요건">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblVillaIsRuralHousing}
            onChange={(e) => onAssetChange({ nblVillaIsRuralHousing: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">농어촌주택 요건 충족 (연면적 150㎡, 기준가액 이하)</span>
        </label>
      </FieldCard>

      <FieldCard label="2015.1.1. 이후 취득">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblVillaIsAfter20150101}
            onChange={(e) => onAssetChange({ nblVillaIsAfter20150101: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">2015.1.1. 이후 취득</span>
        </label>
      </FieldCard>
    </div>
  );
}
