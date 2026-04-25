"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface OtherLandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

type PropertyTaxType = "" | "comprehensive" | "separate" | "special_sum" | "exempt";

export function OtherLandDetailSection({
  asset,
  onAssetChange,
}: OtherLandDetailSectionProps) {
  const buildingVal = parseFloat(asset.nblOtherBuildingValue || "0") || 0;
  const landVal = parseFloat(asset.nblOtherLandValue || "0") || 0;
  const isLikelyBareground = landVal > 0 && buildingVal < landVal * 0.02;

  return (
    <div className="space-y-3">
      <SectionHeader
        title="나대지·잡종지 세부 정보"
        description="§168-11 기타 토지 판정"
      />

      <FieldCard label="재산세 과세 분류">
        <select
          value={asset.nblOtherPropertyTaxType}
          onChange={(e) =>
            onAssetChange({ nblOtherPropertyTaxType: e.target.value as PropertyTaxType })
          }
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="">선택 안 함</option>
          <option value="comprehensive">종합합산</option>
          <option value="separate">별도합산</option>
          <option value="special_sum">분리과세</option>
          <option value="exempt">비과세·면제</option>
        </select>
      </FieldCard>

      <FieldCard label="건물가액" unit="원">
        <input
          type="number"
          value={asset.nblOtherBuildingValue}
          onChange={(e) => onAssetChange({ nblOtherBuildingValue: e.target.value })}
          onFocus={(e) => e.target.select()}
          min={0}
          placeholder="0"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      <FieldCard label="토지가액" unit="원">
        <input
          type="number"
          value={asset.nblOtherLandValue}
          onChange={(e) => onAssetChange({ nblOtherLandValue: e.target.value })}
          onFocus={(e) => e.target.select()}
          min={0}
          placeholder="0"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </FieldCard>

      <FieldCard label="주택·사업장 부수">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblOtherIsRelatedToResidence}
            onChange={(e) =>
              onAssetChange({ nblOtherIsRelatedToResidence: e.target.checked })
            }
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">주택·사업장 부수 토지 여부</span>
        </label>
      </FieldCard>

      {isLikelyBareground && (
        <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          건물가액이 토지가액의 2% 미만 — 나대지로 추정됩니다 (§168-11⑥).
        </div>
      )}

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
        건물가액이 토지가액의 2% 미만이면 나대지로 추정됩니다 (§168-11⑥).
      </div>
    </div>
  );
}
