"use client";

import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
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
        description="소득령 §168의9 임야 판정"
        action={<LawArticleModal legalBasis="소득세법 시행령 §168의9" label="§168의9 임야" />}
      />

      <ToggleCard
        tone="sky"
        title="산림경영계획 인가 (시장·군수)"
        checked={asset.nblForestHasPlan}
        onCheckedChange={(v) => onAssetChange({ nblForestHasPlan: v })}
      />

      <ToggleCard
        tone="sky"
        title="공익림 (산림보호구역·채종림·시험림·문화유산 보호구역 등)"
        description="「소득세법 시행령」 §168조의9①1호·3~14호. 문화유산·자연유산 보호구역 안의 임야(§168조의9①6호)도 여기에 해당합니다."
        checked={asset.nblForestIsPublicInterest}
        onCheckedChange={(v) => onAssetChange({ nblForestIsPublicInterest: v })}
      />

      {/*
        🔴 라벨 정정 (E3-02·U1-01, 2026-09-02 코드리뷰).
        이 토글은 엔진의 `isSpecialForestZone`(「소득세법 시행령」 §168조의9①2호 나목 특수산림사업지구)에
        매핑된다. 종전 라벨 「문화재 보호림」은 실제로는 같은 항 **6호**(문화유산·자연유산 보호구역)라
        위 공익림 토글이 담당하는 사유인데, 2호에 배선되어 있어 도시지역 편입 3년 지역기준을
        잘못 태웠다(사업용 → 비사업용 반전).
      */}
      <ToggleCard
        tone="sky"
        title="특수산림사업지구 안의 임야"
        description="「소득세법 시행령」 §168조의9①2호 나목. 이 사유(및 산림경영계획 인가 시업중)만 도시지역 편입 3년 지역기준의 적용을 받습니다."
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
