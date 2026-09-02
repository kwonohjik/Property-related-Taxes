"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToneCard } from "@/components/calc/shared/ToneCard";
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

      {/*
        🔴 정착면적 입력 (E1-02, 2026-09-02 코드리뷰).
        별장 비사용기간이 기간기준을 충족하면 엔진이 **주택부수토지로 자동 재분류**하는데
        (`engine.ts`의 REDIRECT), 그 뒤 판정은 §168의12 배율 × 주택 정착면적으로 이뤄진다.
        종전에는 이 화면에 정착면적 입력란이 없어 재분류 경로가 구조적으로 항상
        「정착면적 미입력 → 인정면적 0 → 전량 비사업용」으로 끝났다.
      */}
      <FieldCard
        label="주택 정착면적"
        unit="㎡"
        hint="별장 요건에 해당하지 않아 주택부수토지로 재분류될 때 인정면적(정착면적 × 용도지역별 배율) 산정에 쓰입니다."
      >
        <DecimalInput
          value={asset.nblHousingFootprint}
          onChange={(v) => onAssetChange({ nblHousingFootprint: v })}
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
          <ToneCard tone="sky" sectionNum="1" title="면적 요건 (①1호)" noDark>
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
          </ToneCard>

          {/* ② 기준시가 요건 (§168의13①2호) */}
          <ToneCard tone="emerald" sectionNum="2" title="기준시가 요건 (①2호)" noDark>
            <FieldCard label="건물+부속토지 합산 기준시가" unit="원" hint="2억원 이하">
              <CurrencyInput
                label="합산 기준시가"
                hideLabel
                hideUnit
                value={asset.nblVillaCombinedStdValue}
                onChange={(v) => onAssetChange({ nblVillaCombinedStdValue: v })}
              />
            </FieldCard>
          </ToneCard>

          {/* ③ 지역 요건 (§168의13①3호) */}
          <ToneCard tone="rose" sectionNum="3" title="지역 요건 (①3호)" noDark>
            <ToggleCard
              tone="rose"
              title="제외지역 소재 (수도권·도시지역·조정대상지역·허가구역)"
              description="조특법 §99의4①1호가목1)~4) 제외지역에 소재하면 농어촌주택 요건 미충족 (관광단지는 제외지역 아님)"
              checked={asset.nblVillaIsInRestrictedArea}
              onCheckedChange={(v) => onAssetChange({ nblVillaIsInRestrictedArea: v })}
            />
          </ToneCard>
        </div>
      </ToggleCard>
    </div>
  );
}
