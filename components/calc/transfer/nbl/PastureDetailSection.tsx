"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BusinessUsePeriodsInput } from "./shared/BusinessUsePeriodsInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface PastureDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

const LIVESTOCK_OPTIONS = [
  { value: "hanwoo", label: "한우" },
  { value: "dairy", label: "젖소" },
  { value: "pig_sow", label: "돼지(모돈)" },
  { value: "pig_fattening", label: "돼지(비육)" },
  { value: "poultry", label: "가금" },
  { value: "horse", label: "말" },
  { value: "sheep", label: "양" },
  { value: "goat", label: "염소" },
] as const;

export function PastureDetailSection({
  asset,
  onAssetChange,
}: PastureDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="목장용지 세부 정보"
        description="§168-10 목장용지 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의10" label="§168의10 목장용지" />}
      />

      <ToggleCard
        tone="sky"
        title="축산업 영위"
        checked={asset.nblPastureIsLivestockOperator}
        onCheckedChange={(v) => onAssetChange({ nblPastureIsLivestockOperator: v })}
      />

      <FieldCard label="축종">
        <Select
          value={asset.nblPastureLivestockType ?? ""}
          onValueChange={(v) => v && onAssetChange({ nblPastureLivestockType: v })}
        >
          <SelectTrigger>
            <SelectValue>
              {LIVESTOCK_OPTIONS.find((o) => o.value === asset.nblPastureLivestockType)?.label ?? "선택 안 함"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LIVESTOCK_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldCard>

      <FieldCard label="사육 두수" unit="두">
        <DecimalInput
          value={asset.nblPastureLivestockCount}
          onChange={(v) => onAssetChange({ nblPastureLivestockCount: v })}
        />
      </FieldCard>

      <FieldCard label="상속일">
        <DateInput
          value={asset.nblPastureInheritanceDate}
          onChange={(v) => onAssetChange({ nblPastureInheritanceDate: v })}
        />
        <p className="text-xs text-muted-foreground mt-1">상속 3년 내 해당 시 입력</p>
      </FieldCard>

      <ToggleCard
        tone="sky"
        title="사회복지법인·학교·종교·정당 직접 사용"
        checked={asset.nblPastureIsSpecialOrgUse}
        onCheckedChange={(v) => onAssetChange({ nblPastureIsSpecialOrgUse: v })}
      />

      <FieldCard label="축산 사육기간">
        <BusinessUsePeriodsInput
          periods={asset.nblPastureLivestockPeriods}
          onChange={(periods) => onAssetChange({ nblPastureLivestockPeriods: periods })}
          label="축산 사육기간"
        />
      </FieldCard>
    </div>
  );
}
