"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의11①" label="§168의11① 기타토지" />}
      />

      <FieldCard label="재산세 과세 분류">
        <Select
          value={asset.nblOtherPropertyTaxType ?? ""}
          onValueChange={(v) => v && onAssetChange({ nblOtherPropertyTaxType: v as PropertyTaxType })}
        >
          <SelectTrigger>
            <SelectValue>
              {asset.nblOtherPropertyTaxType === "comprehensive" ? "종합합산"
                : asset.nblOtherPropertyTaxType === "separate" ? "별도합산"
                : asset.nblOtherPropertyTaxType === "special_sum" ? "분리과세"
                : asset.nblOtherPropertyTaxType === "exempt" ? "비과세·면제"
                : "선택 안 함"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="comprehensive">종합합산</SelectItem>
            <SelectItem value="separate">별도합산</SelectItem>
            <SelectItem value="special_sum">분리과세</SelectItem>
            <SelectItem value="exempt">비과세·면제</SelectItem>
          </SelectContent>
        </Select>
      </FieldCard>

      <FieldCard label="건물가액" unit="원">
        <CurrencyInput
          label="건물가액"
          hideLabel
          value={asset.nblOtherBuildingValue}
          onChange={(v) => onAssetChange({ nblOtherBuildingValue: v })}
          hideUnit
        />
      </FieldCard>

      <FieldCard label="토지가액" unit="원">
        <CurrencyInput
          label="토지가액"
          hideLabel
          value={asset.nblOtherLandValue}
          onChange={(v) => onAssetChange({ nblOtherLandValue: v })}
          hideUnit
        />
      </FieldCard>

      <ToggleCard
        tone="sky"
        title="주택·사업장 부수 토지 여부"
        checked={asset.nblOtherIsRelatedToResidence}
        onCheckedChange={(v) => onAssetChange({ nblOtherIsRelatedToResidence: v })}
      />

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
