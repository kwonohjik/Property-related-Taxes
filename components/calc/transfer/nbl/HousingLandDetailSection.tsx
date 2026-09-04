"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";

export interface HousingLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

type MetroValue = "" | "yes" | "no" | "unknown";
type SelectableMetroValue = Exclude<MetroValue, "">;

const METRO_OPTIONS: { value: SelectableMetroValue; label: string }[] = [
  { value: "yes", label: "수도권" },
  { value: "no", label: "비수도권" },
  { value: "unknown", label: "미확인" },
];


export function HousingLandDetailSection({
  asset,
  onAssetChange,
}: HousingLandDetailSectionProps) {
  const metro = asset.nblIsMetropolitanArea;
  // 배율은 엔진 getHousingMultiplier가 단일 진실 — UI에서 재구현 금지.
  //   §168의12: 1호가목 수도권 주·상·공 3배 / 1호나목 수도권 녹지 5배 /
  //             1호다목 수도권 밖 도시지역 5배 / 2호 그 밖(도시지역 外) 10배.
  //   ⚠️ 종전 UI는 "비수도권 = 10배"로 안내했으나 **비수도권 도시지역은 5배**다(1호다목).
  const badge =
    metro === "yes" || metro === "no"
      ? (() => {
          const m = getHousingMultiplier(
            (asset.nblZoneType || "undesignated") as ZoneType,
            metro === "yes",
          );
          return `${m.multiplier}배 적용 (${m.detail})`;
        })()
      : null;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="주택 부속토지 세부 정보"
        description="소득령 §168의12 주택 부속토지 배율 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의12" label="§168의12 배율" />}
      />

      <FieldCard label="수도권 여부" badge={badge ?? undefined}>
        <RadioCardGroup
          name={`nblIsMetropolitanArea-${asset.assetId}`}
          tone="rose"
          layout="inline"
          options={METRO_OPTIONS}
          value={(asset.nblIsMetropolitanArea ?? "") as SelectableMetroValue | ""}
          onChange={(v) => onAssetChange({ nblIsMetropolitanArea: v })}
        />
        {metro === "yes" && (
          <p className="text-xs text-muted-foreground mt-1">
            수도권 주·상·공 3배 / 녹지·기타 도시 5배 / 도시지역 외 10배
          </p>
        )}
      </FieldCard>

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
