"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { MetropolitanAreaField } from "./shared/MetropolitanAreaField";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface HousingLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function HousingLandDetailSection({
  asset,
  onAssetChange,
}: HousingLandDetailSectionProps) {
  const metro = asset.nblIsMetropolitanArea;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="주택 부속토지 세부 정보"
        description="소득령 §168의12 주택 부속토지 배율 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />}
      />

      <MetropolitanAreaField asset={asset} onAssetChange={onAssetChange} />

      <FieldCard
        label="주택 정착면적"
        unit="㎡"
        hint="법 §104조의3①5호 「주택이 정착된 면적」 — 건물이 땅에 닿는 바닥면적(1층 건축면적). 층별 합계인 연면적이 아닙니다. 이 면적 × 배율을 초과하는 부속토지가 비사업용으로 판정됩니다."
      >
        <DecimalInput
          value={asset.nblHousingFootprint}
          onChange={(v) => onAssetChange({ nblHousingFootprint: v })}
        />
      </FieldCard>

      {metro && metro !== "unknown" && (
        <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          {metro === "yes"
            ? "수도권: 주거·상업·공업지역 3배, 녹지·기타 도시지역 5배, 도시지역 외 10배."
            : "비수도권: 도시지역 5배, 도시지역 외 10배."}
        </div>
      )}
    </div>
  );
}
