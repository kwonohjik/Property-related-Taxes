"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
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

      <FieldCard label="산림경영계획">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblForestHasPlan}
            onChange={(e) => onAssetChange({ nblForestHasPlan: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">산림경영계획 인가 (시장·군수)</span>
        </label>
      </FieldCard>

      <FieldCard label="공익림">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblForestIsPublicInterest}
            onChange={(e) => onAssetChange({ nblForestIsPublicInterest: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">공익림 (보안림·산림유전자원·시험림 등)</span>
        </label>
      </FieldCard>

      <FieldCard label="문화재 보호림">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblForestIsProtected}
            onChange={(e) => onAssetChange({ nblForestIsProtected: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">문화재 보호림</span>
        </label>
      </FieldCard>

      <FieldCard label="임업후계자·독림가">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblForestIsSuccessor}
            onChange={(e) => onAssetChange({ nblForestIsSuccessor: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">임업후계자·독림가</span>
        </label>
      </FieldCard>

      {/* 상속 3년 이내 — 체크 + 날짜 입력 필수 (forest.ts: inheritedFlag && forestInheritanceDate) */}
      <FieldCard label="상속 3년 이내">
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asset.nblForestInheritedWithin3Years}
              onChange={(e) =>
                onAssetChange({
                  nblForestInheritedWithin3Years: e.target.checked,
                  nblForestInheritanceDate: e.target.checked ? asset.nblForestInheritanceDate : "",
                })
              }
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm">상속 3년 이내 양도</span>
          </label>
          {asset.nblForestInheritedWithin3Years && (
            <div className="pl-6">
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
          )}
        </div>
      </FieldCard>

      <div className="rounded-md bg-muted/50 border px-3 py-2 text-xs text-muted-foreground">
        임야는 주민등록 있는 재촌이 필수입니다. 거주 이력 섹션에서 주민등록 체크를 확인하세요.
      </div>
    </div>
  );
}
