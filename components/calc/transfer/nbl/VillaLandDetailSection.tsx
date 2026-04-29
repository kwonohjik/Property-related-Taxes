"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
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

      <ToggleCard
        tone="sky"
        title="읍·면 지역 소재"
        checked={asset.nblVillaIsEupMyeon}
        onCheckedChange={(v) => onAssetChange({ nblVillaIsEupMyeon: v })}
      />

      <ToggleCard
        tone="sky"
        title="농어촌주택 요건 충족"
        description="연면적 150㎡, 기준가액 이하"
        checked={asset.nblVillaIsRuralHousing}
        onCheckedChange={(v) => onAssetChange({ nblVillaIsRuralHousing: v })}
      />

      <ToggleCard
        tone="sky"
        title="2015.1.1. 이후 취득"
        checked={asset.nblVillaIsAfter20150101}
        onCheckedChange={(v) => onAssetChange({ nblVillaIsAfter20150101: v })}
      />
    </div>
  );
}
