"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
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
      <FieldCard label="자경 여부">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmingSelf}
            onChange={(e) => onAssetChange({ nblFarmingSelf: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">직접 자경 (소유자가 직접 경작)</span>
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          미체크 시 자경기간을 0으로 처리합니다.
        </p>
      </FieldCard>

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

      <FieldCard label="주말농장">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmlandIsWeekendFarm}
            onChange={(e) => onAssetChange({ nblFarmlandIsWeekendFarm: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">주말농장 (의제자경, 1,000㎡ 이하)</span>
        </label>
      </FieldCard>

      <FieldCard label="농지전용 허가">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asset.nblFarmlandIsConversionApproved}
              onChange={(e) => onAssetChange({ nblFarmlandIsConversionApproved: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm">농지전용 허가·신고 (3년 이내)</span>
          </label>
          {asset.nblFarmlandIsConversionApproved && (
            <div className="pl-6">
              <label className="block text-xs text-muted-foreground mb-1">허가일</label>
              <DateInput
                value={asset.nblFarmlandConversionDate}
                onChange={(v) => onAssetChange({ nblFarmlandConversionDate: v })}
              />
            </div>
          )}
        </div>
      </FieldCard>

      <FieldCard label="한계농지">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmlandIsMarginalFarm}
            onChange={(e) => onAssetChange({ nblFarmlandIsMarginalFarm: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">한계농지 정비사업</span>
        </label>
      </FieldCard>

      <FieldCard label="간척지">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmlandIsReclaimedLand}
            onChange={(e) => onAssetChange({ nblFarmlandIsReclaimedLand: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">간척지</span>
        </label>
      </FieldCard>

      <FieldCard label="공익사업용">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmlandIsPublicProjectUse}
            onChange={(e) => onAssetChange({ nblFarmlandIsPublicProjectUse: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">공익사업용</span>
        </label>
      </FieldCard>

      <FieldCard label="질병·고령 임대">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblFarmlandIsSickElderlyRental}
            onChange={(e) => onAssetChange({ nblFarmlandIsSickElderlyRental: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">질병·고령으로 인한 임대 (의제자경)</span>
        </label>
      </FieldCard>
    </div>
  );
}
