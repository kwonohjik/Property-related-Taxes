"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
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
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의13" label="§168의13 별장" />}
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
        tone="violet"
        title="농어촌주택 (§168의13① 3요건)"
        description="아래 3요건을 모두 충족해야 사업용으로 인정됩니다. 미입력 항목은 요건 미충족으로 처리됩니다."
        checked={asset.nblVillaIsRuralHousing}
        onCheckedChange={(v) => onAssetChange({ nblVillaIsRuralHousing: v })}
      >
        <div className="space-y-3">
          {/* ① 면적 요건 (§168의13①1호) */}
          <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-micro font-bold text-sky-800 select-none">
                1
              </span>
              <p className="text-xs font-semibold text-sky-700">면적 요건 (①1호)</p>
            </div>
            <FieldCard label="건물 연면적" unit="㎡" hint="150㎡ 이내">
              <DecimalInput
                value={asset.nblVillaBuildingFloorArea}
                onChange={(v) => onAssetChange({ nblVillaBuildingFloorArea: v })}
              />
            </FieldCard>
            <FieldCard label="건물 부속토지면적" unit="㎡" hint="660㎡ 이내 (자산 전체 토지면적과 별개인 건물 부속토지)">
              <DecimalInput
                value={asset.nblVillaAttachedLandArea}
                onChange={(v) => onAssetChange({ nblVillaAttachedLandArea: v })}
              />
            </FieldCard>
          </div>

          {/* ② 기준시가 요건 (§168의13①2호) */}
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
                2
              </span>
              <p className="text-xs font-semibold text-emerald-700">기준시가 요건 (①2호)</p>
            </div>
            <FieldCard label="건물+부속토지 합산 기준시가" unit="원" hint="2억원 이하">
              <CurrencyInput
                label="합산 기준시가"
                hideLabel
                hideUnit
                value={asset.nblVillaCombinedStdValue}
                onChange={(v) => onAssetChange({ nblVillaCombinedStdValue: v })}
              />
            </FieldCard>
          </div>

          {/* ③ 지역 요건 (§168의13①3호) */}
          <div className="rounded-lg border border-rose-200 bg-rose-50/40 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-200 text-micro font-bold text-rose-800 select-none">
                3
              </span>
              <p className="text-xs font-semibold text-rose-700">지역 요건 (①3호)</p>
            </div>
            <ToggleCard
              tone="rose"
              title="제외지역 소재 (수도권·도시지역·조정대상지역·허가구역)"
              description="조특법 §99의4①1호가목1)~4) 제외지역에 소재하면 농어촌주택 요건 미충족 (관광단지는 제외지역 아님)"
              checked={asset.nblVillaIsInRestrictedArea}
              onCheckedChange={(v) => onAssetChange({ nblVillaIsInRestrictedArea: v })}
            />
          </div>
        </div>
      </ToggleCard>
    </div>
  );
}
