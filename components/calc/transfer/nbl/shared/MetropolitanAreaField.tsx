"use client";

/**
 * 「수도권 여부」 — 주택 부수토지 배율(영 §168의12)의 두 축 중 하나.
 *
 * 배율은 **용도지역 × 수도권** 2축으로 갈린다(`getHousingMultiplier`):
 *   1호가목 수도권 주·상·공 3배 / 1호나목 수도권 녹지 5배 /
 *   1호다목 수도권 밖 도시지역 5배 / 2호 그 밖(도시지역 外) 10배.
 *
 * ⚠️ **두 화면이 같은 값을 쓴다** — 주택부수토지(`housing_site`)와 **별장**(`villa_land`).
 *    별장은 요건 미해당 시 엔진이 주택부수토지로 **자동 재분류**하고(`engine.ts:118`),
 *    그 뒤 판정은 이 배율로 이뤄진다. 종전에는 이 입력이 주택부수토지 화면에만 있어
 *    별장 경로가 항상 「미지정 → 보수적 기본값(수도권)」으로 3배를 받았다
 *    (`housing-land.ts:68`, 법 근거 없는 불리 적용).
 *
 * 배율 문구·배지는 엔진 표에서 파생한다 — UI에서 재구현 금지(단일 진실).
 */

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { getHousingMultiplier } from "@/lib/tax-engine/non-business-land/urban-area";
import type { ZoneType } from "@/lib/tax-engine/non-business-land/types";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

type MetroValue = "" | "yes" | "no" | "unknown";
type SelectableMetroValue = Exclude<MetroValue, "">;

const METRO_OPTIONS: { value: SelectableMetroValue; label: string }[] = [
  { value: "yes", label: "수도권" },
  { value: "no", label: "비수도권" },
  { value: "unknown", label: "미확인" },
];

export interface MetropolitanAreaFieldProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function MetropolitanAreaField({ asset, onAssetChange }: MetropolitanAreaFieldProps) {
  const metro = asset.nblIsMetropolitanArea;
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
  );
}
