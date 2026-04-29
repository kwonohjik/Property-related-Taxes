"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { BusinessUsePeriodsInput } from "./shared/BusinessUsePeriodsInput";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface FarmlandDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function FarmlandDetailSection({
  asset,
  onAssetChange,
}: FarmlandDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="농지 세부 정보"
        description="§168-8 농지 판정 — 자경 기간 및 의제자경 사유를 입력하세요."
      />

      {/* 자경 여부 — farmingSelf === false 이면 자경기간 전체 0 처리 */}
      <ToggleCard
        tone="sky"
        title="직접 자경 (소유자가 직접 경작)"
        description="미체크 시 자경기간을 0으로 처리합니다."
        checked={asset.nblFarmingSelf}
        onCheckedChange={(v) => onAssetChange({ nblFarmingSelf: v })}
      />

      {/* 자경 기간 입력 — 재촌 기간과 교집합으로 실질 재촌·자경 기간 계산 */}
      <FieldCard label="자경 기간">
        <BusinessUsePeriodsInput
          periods={asset.nblBusinessUsePeriods}
          onChange={(periods) => onAssetChange({ nblBusinessUsePeriods: periods })}
          label="자경 기간"
        />
        <p className="text-xs text-muted-foreground mt-1">
          거주 이력(재촌)과의 교집합으로 재촌·자경 기간을 산정합니다. (§168-8)
        </p>
      </FieldCard>

      {/* 의제자경 사유 */}
      <SectionHeader
        title="의제자경 사유 (§168-8 ③)"
        description="해당 시 자경 기간 입력 없이도 사업용으로 간주합니다."
      />

      <ToggleCard
        tone="sky"
        title="주말농장 (의제자경, 1,000㎡ 이하)"
        checked={asset.nblFarmlandIsWeekendFarm}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsWeekendFarm: v })}
      />

      <ToggleCard
        tone="sky"
        title="농지전용 허가·신고 (3년 이내)"
        checked={asset.nblFarmlandIsConversionApproved}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsConversionApproved: v })}
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">허가일</label>
          <DateInput
            value={asset.nblFarmlandConversionDate}
            onChange={(v) => onAssetChange({ nblFarmlandConversionDate: v })}
          />
        </div>
      </ToggleCard>

      <ToggleCard
        tone="sky"
        title="한계농지 정비사업"
        checked={asset.nblFarmlandIsMarginalFarm}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsMarginalFarm: v })}
      />

      <ToggleCard
        tone="sky"
        title="간척지"
        checked={asset.nblFarmlandIsReclaimedLand}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsReclaimedLand: v })}
      />

      <ToggleCard
        tone="sky"
        title="공익사업용"
        checked={asset.nblFarmlandIsPublicProjectUse}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsPublicProjectUse: v })}
      />

      <ToggleCard
        tone="sky"
        title="질병·고령으로 인한 임대 (의제자경)"
        checked={asset.nblFarmlandIsSickElderlyRental}
        onCheckedChange={(v) => onAssetChange({ nblFarmlandIsSickElderlyRental: v })}
      />
    </div>
  );
}
