"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { MetropolitanAreaField } from "./shared/MetropolitanAreaField";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { FOOTPRINT_DEFINITION } from "@/lib/calc/footprint-definition-copy";
import { HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE } from "@/lib/tax-engine/non-business-land/urban-area";
import { toOptionalDate } from "@/lib/api/date-coerce";

export interface HousingLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** 양도일 `YYYY-MM-DD` — 배율 배지의 시행일 분기(NBL2611-V9-J) */
  transferDate?: string;
}

export function HousingLandDetailSection({
  asset,
  onAssetChange,
  transferDate,
}: HousingLandDetailSectionProps) {
  const metro = asset.nblIsMetropolitanArea;
  // NBL2611-V9-J — 배율은 양도일(2022.1.1.)로 갈린다. 안내 문구도 같은 상수·같은 변환을 쓴다.
  const trnDate = toOptionalDate(transferDate);
  const isPreSplit = trnDate !== undefined && trnDate < HOUSING_MULTIPLIER_SPLIT_EFFECTIVE_DATE;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="주택 부속토지 세부 정보"
        description="소득령 §168의12 주택 부속토지 배율 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />}
      />

      <MetropolitanAreaField asset={asset} onAssetChange={onAssetChange} transferDate={transferDate} />

      <FieldCard
        field="nblHousingFootprint"
        label="주택 정착면적"
        unit="㎡"
        hint={`법 §104조의3①5호 「주택이 정착된 면적」 — ${FOOTPRINT_DEFINITION} 이 면적 × 배율을 초과하는 부속토지가 비사업용으로 판정됩니다.`}
      >
        <DecimalInput
          value={asset.nblHousingFootprint}
          onChange={(v) => onAssetChange({ nblHousingFootprint: v })}
        />
      </FieldCard>

      {metro && metro !== "unknown" && (
        <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          {isPreSplit
            ? "2022.1.1. 전 양도분(종전 규정): 수도권 여부와 무관하게 도시지역 일률 5배, 도시지역 외 10배."
            : metro === "yes"
              ? "수도권: 주거·상업·공업지역 3배, 녹지·기타 도시지역 5배, 도시지역 외 10배."
              : "비수도권: 도시지역 5배, 도시지역 외 10배."}
        </div>
      )}
    </div>
  );
}
