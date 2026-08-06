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

// 소득세법 시행령 별표 1의3 9개 구분 (사업종류 포함). 비고: 말·노새·당나귀=한우 사육 / 친칠라=토끼 / 개=돼지 / 여우=밍크.
const LIVESTOCK_OPTIONS = [
  { value: "hanwoo_breeding", label: "한우·육우 사육 (말·노새·당나귀 포함)" },
  { value: "hanwoo_fattening", label: "한우·육우 비육" },
  { value: "dairy", label: "유우(젖소)" },
  { value: "sheep", label: "양" },
  { value: "deer", label: "사슴" },
  { value: "rabbit", label: "토끼 (친칠라 포함)" },
  { value: "pig", label: "돼지 (개 포함)" },
  { value: "poultry", label: "가금" },
  { value: "mink", label: "밍크 (여우 포함)" },
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

      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
        <p className="text-xs font-semibold text-sky-700">보유 시설 (해당하는 것을 모두 선택)</p>
        <p className="text-caption text-sky-800">
          별표1의3의 4개 열은 <b>항목별 인정 한도</b>입니다 — 없는 시설의 몫은 기준면적에 더하지
          않습니다. 축사는 축산업의 전제이므로 항상 포함됩니다. 위 「기준면적」을 직접 입력하면
          이 선택은 쓰이지 않습니다.
        </p>
        <ToggleCard
          variant="chip"
          tone="sky"
          title="부대시설"
          checked={asset.nblPastureHasFacility}
          onCheckedChange={(v) => onAssetChange({ nblPastureHasFacility: v })}
        />
        <ToggleCard
          variant="chip"
          tone="emerald"
          title="초지 (방목)"
          checked={asset.nblPastureHasGrassland}
          onCheckedChange={(v) => onAssetChange({ nblPastureHasGrassland: v })}
        />
        <ToggleCard
          variant="chip"
          tone="amber"
          title="사료포 (사료 재배)"
          checked={asset.nblPastureHasFodder}
          onCheckedChange={(v) => onAssetChange({ nblPastureHasFodder: v })}
        />
      </div>

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
