"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

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

function getMultiplierBadge(metro: MetroValue, isUrban: boolean): string | null {
  if (metro === "yes" && isUrban) return "3배 적용 (수도권 도시지역)";
  if (metro === "yes" && !isUrban) return "5배 적용 (수도권)";
  if (metro === "no") return "10배 적용 (비수도권)";
  return null;
}

export function HousingLandDetailSection({
  asset,
  onAssetChange,
}: HousingLandDetailSectionProps) {
  // For badge, assume urban when metro=yes (exact urbanization flag not available here)
  // Show both options in hint text instead
  const metro = asset.nblIsMetropolitanArea;
  const badge = metro === "yes"
    ? "3배(도시지역) / 5배(기타)"
    : metro === "no"
    ? "10배 적용"
    : null;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="주택 부속토지 세부 정보"
        description="§168-12 주택 부속토지 배율 판정"
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
            도시지역: 3배 / 그 외 수도권: 5배
          </p>
        )}
      </FieldCard>

      <FieldCard label="주택 연면적" unit="㎡">
        <input
          type="number"
          value={asset.nblHousingFootprint}
          onChange={(e) => onAssetChange({ nblHousingFootprint: e.target.value })}
          min={0}
          placeholder="0"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      {metro && metro !== "unknown" && (
        <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2 text-sm text-blue-700 dark:text-blue-300">
          {metro === "yes"
            ? "수도권: 도시지역은 3배, 도시지역 외는 5배 배율이 적용됩니다."
            : "비수도권: 10배 배율이 적용됩니다."}
        </div>
      )}
    </div>
  );
}
