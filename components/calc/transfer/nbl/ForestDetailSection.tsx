"use client";

import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface ForestDetailSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

export function ForestDetailSection({
  asset,
  onAssetChange,
}: ForestDetailSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="임야 세부 정보"
        description="§168-9 임야 판정"
      />

      <ToggleCard
        tone="sky"
        title="산림경영계획 인가 (시장·군수)"
        checked={asset.nblForestHasPlan}
        onCheckedChange={(v) => onAssetChange({ nblForestHasPlan: v })}
      />

      <ToggleCard
        tone="sky"
        title="공익림 (보안림·산림유전자원·시험림 등)"
        checked={asset.nblForestIsPublicInterest}
        onCheckedChange={(v) => onAssetChange({ nblForestIsPublicInterest: v })}
      />

      <ToggleCard
        tone="sky"
        title="문화재 보호림"
        checked={asset.nblForestIsProtected}
        onCheckedChange={(v) => onAssetChange({ nblForestIsProtected: v })}
      />

      <ToggleCard
        tone="sky"
        title="임업후계자·독림가"
        checked={asset.nblForestIsSuccessor}
        onCheckedChange={(v) => onAssetChange({ nblForestIsSuccessor: v })}
      />

      {/* 상속 3년 이내 — 체크 + 날짜 입력 필수 (forest.ts: inheritedFlag && forestInheritanceDate) */}
      <ToggleCard
        tone="sky"
        title="상속 3년 이내 양도"
        checked={asset.nblForestInheritedWithin3Years}
        onCheckedChange={(v) =>
          onAssetChange({
            nblForestInheritedWithin3Years: v,
            nblForestInheritanceDate: v ? asset.nblForestInheritanceDate : "",
          })
        }
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">
            상속일 <span className="text-destructive">*</span>
          </label>
          <DateInput
            value={asset.nblForestInheritanceDate}
            onChange={(v) => onAssetChange({ nblForestInheritanceDate: v })}
          />
          <p className="text-xs text-muted-foreground mt-1">
            상속일로부터 3년 이내 양도 여부를 엔진이 자동 계산합니다.
          </p>
        </div>
      </ToggleCard>

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
        임야는 주민등록 있는 재촌이 필수입니다. 거주 이력 섹션에서 주민등록 체크를 확인하세요.
      </div>
    </div>
  );
}
