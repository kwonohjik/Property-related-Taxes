"use client";

import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export interface UnconditionalExemptionSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}

const anyExempt = (a: AssetForm) =>
  a.nblExemptInheritBefore2007 ||
  a.nblExemptLongOwned20y ||
  a.nblExemptAncestor8YearFarming ||
  a.nblExemptPublicExpropriation ||
  a.nblExemptFactoryAdjacent ||
  a.nblExemptJongjoongOwned ||
  a.nblExemptUrbanFarmlandJongjoong;

// 법조문 배지 스타일 (LawArticleModal className override)
const LAW_BADGE_CLASS =
  "inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium " +
  "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 " +
  "hover:bg-blue-100 dark:hover:bg-blue-950/70 transition-colors shrink-0 whitespace-nowrap cursor-pointer";

export function UnconditionalExemptionSection({
  asset,
  onAssetChange,
}: UnconditionalExemptionSectionProps) {
  const hasExemption = anyExempt(asset);

  return (
    <div className="space-y-3">
      <SectionHeader
        title="무조건 사업용 토지 판정 (§168-14③)"
        description="아래 사유 중 하나라도 해당하면 지목별 판정 없이 사업용으로 분류됩니다."
      />

      {hasExemption && (
        <div className="rounded-md bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-800 px-4 py-2.5 text-sm text-blue-700 dark:text-blue-300">
          엔진이 무조건 사업용으로 판정합니다 (§168-14③). 아래 지목별 판정을 건너뜁니다.
        </div>
      )}

      <FieldCard
        label="2006.12.31. 이전 상속"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③1호"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asset.nblExemptInheritBefore2007}
              onChange={(e) => onAssetChange({ nblExemptInheritBefore2007: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm">2006.12.31. 이전 상속받은 토지</span>
          </label>
          {asset.nblExemptInheritBefore2007 && (
            <div className="pl-6">
              <label className="block text-xs text-muted-foreground mb-1">상속일</label>
              <DateInput
                value={asset.nblExemptInheritDate}
                onChange={(v) => onAssetChange({ nblExemptInheritDate: v })}
              />
            </div>
          )}
        </div>
      </FieldCard>

      <FieldCard
        label="2007년 이전 장기보유"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③2호"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblExemptLongOwned20y}
            onChange={(e) => onAssetChange({ nblExemptLongOwned20y: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">2007년 이전 20년 이상 보유</span>
        </label>
      </FieldCard>

      <FieldCard
        label="직계존속 자경 상속·증여"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③1의2호"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblExemptAncestor8YearFarming}
            onChange={(e) => onAssetChange({ nblExemptAncestor8YearFarming: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">직계존속 8년 자경 후 상속·증여 (비도시지역)</span>
        </label>
      </FieldCard>

      <FieldCard
        label="공익사업 수용"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③3호"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asset.nblExemptPublicExpropriation}
              onChange={(e) => onAssetChange({ nblExemptPublicExpropriation: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm">공익사업으로 수용</span>
          </label>
          {asset.nblExemptPublicExpropriation && (
            <div className="pl-6">
              <label className="block text-xs text-muted-foreground mb-1">사업인정고시일</label>
              <DateInput
                value={asset.nblExemptPublicNoticeDate}
                onChange={(v) => onAssetChange({ nblExemptPublicNoticeDate: v })}
              />
            </div>
          )}
        </div>
      </FieldCard>

      <FieldCard
        label="공장 인접지"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③ 구법"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblExemptFactoryAdjacent}
            onChange={(e) => onAssetChange({ nblExemptFactoryAdjacent: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">공장 인접지 (구법 특례)</span>
        </label>
      </FieldCard>

      <FieldCard
        label="종중 소유"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③4호가목"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={asset.nblExemptJongjoongOwned}
              onChange={(e) => onAssetChange({ nblExemptJongjoongOwned: e.target.checked })}
              className="h-4 w-4 rounded accent-primary"
            />
            <span className="text-sm">종중 소유 + 2005.12.31. 이전 취득</span>
          </label>
          {asset.nblExemptJongjoongOwned && (
            <div className="pl-6">
              <label className="block text-xs text-muted-foreground mb-1">취득일</label>
              <DateInput
                value={asset.nblExemptJongjoongAcqDate}
                onChange={(v) => onAssetChange({ nblExemptJongjoongAcqDate: v })}
              />
            </div>
          )}
        </div>
      </FieldCard>

      <FieldCard
        label="도시지역 농지 종중·상속 특례"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168-14③4호"
            className={LAW_BADGE_CLASS}
          />
        }
      >
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={asset.nblExemptUrbanFarmlandJongjoong}
            onChange={(e) => onAssetChange({ nblExemptUrbanFarmlandJongjoong: e.target.checked })}
            className="h-4 w-4 rounded accent-primary"
          />
          <span className="text-sm">도시지역 농지 종중·상속 5년 이내 양도 특례</span>
        </label>
      </FieldCard>
    </div>
  );
}
