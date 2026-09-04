"use client";

import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type {
  NblExemptionEval,
  ToggleExemptionStatus,
} from "@/lib/calc/nbl-unconditional-exemption-status";

export interface UnconditionalExemptionSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** 상위(NblSectionContainer)에서 계산한 엔진 실제 판정 상태 */
  status: NblExemptionEval;
}

// 법조문 배지 스타일 (LawArticleModal className override)
import { LAW_BADGE_CLASS } from "@/components/calc/shared/lawBadge";

/** 토글별 요건 충족/미충족 뱃지 — ON 토글에만 status가 존재 */
function ExemptionStatusBadge({ status }: { status?: ToggleExemptionStatus }) {
  if (!status) return null;
  if (status.qualifies) {
    return (
      <p className="mt-1 flex items-start gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-caption text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
        <span className="shrink-0 font-semibold">요건 충족</span>
        <span>· 이 사유로 사업용 토지로 확정됩니다.</span>
      </p>
    );
  }
  return (
    <p className="mt-1 flex items-start gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-caption text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
      <span className="shrink-0 font-semibold">요건 미충족</span>
      <span>· {status.requirementHint}</span>
    </p>
  );
}

export function UnconditionalExemptionSection({
  asset,
  onAssetChange,
  status,
}: UnconditionalExemptionSectionProps) {
  return (
    <div className="space-y-3">
      <SectionHeader
        title="무조건 사업용 토지 판정 (소득령 §168의14③)"
        description="아래 사유의 날짜·지목 요건을 충족하면 지목별 판정 없이 사업용으로 분류됩니다."
      />

      {status.isExempt ? (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-800 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-300">
          엔진이 무조건 사업용으로 판정합니다
          {status.matched
            ? ` — ${status.matched.detail}${status.matched.legalBasis ? ` (${status.matched.legalBasis})` : ""}`
            : ""}
          . 아래 지목별 판정을 건너뜁니다.
        </div>
      ) : status.anyToggleOn ? (
        <div className="rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">
          선택한 사유가 아직 무조건 사업용 의제 요건을 충족하지 않아, 아래 지목별 판정으로 진행합니다.
          각 사유의 날짜·지목을 확인하세요.
        </div>
      ) : null}

      <ToggleCard
        tone="violet"
        title="2006.12.31. 이전 상속받은 토지"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③1호"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptInheritBefore2007}
        onCheckedChange={(v) => onAssetChange({ nblExemptInheritBefore2007: v })}
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">상속일</label>
          <DateInput
            value={asset.nblExemptInheritDate}
            onChange={(v) => onAssetChange({ nblExemptInheritDate: v })}
          />
        </div>
        <ExemptionStatusBadge status={status.perToggle.inheritBefore2007} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="2007년 이전 20년 이상 보유"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③2호"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptLongOwned20y}
        onCheckedChange={(v) => onAssetChange({ nblExemptLongOwned20y: v })}
      >
        <ExemptionStatusBadge status={status.perToggle.longOwned20y} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="직계존속 8년 자경 후 상속·증여 (비도시지역)"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③1의2호"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptAncestor8YearFarming}
        onCheckedChange={(v) => onAssetChange({ nblExemptAncestor8YearFarming: v })}
      >
        <ExemptionStatusBadge status={status.perToggle.ancestor8Year} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="공익사업으로 수용"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③3호"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptPublicExpropriation}
        onCheckedChange={(v) => onAssetChange({ nblExemptPublicExpropriation: v })}
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">사업인정고시일</label>
          <DateInput
            value={asset.nblExemptPublicNoticeDate || asset.expropriationNoticeDate}
            onChange={(v) => onAssetChange({ nblExemptPublicNoticeDate: v })}
            data-testid="nbl-expr-notice-date"
          />
          <p className="mt-1 text-micro text-muted-foreground">
            ①양도정보(공익수용)의 사업인정고시일에서 자동 반영 · 다르면 직접 수정
          </p>
        </div>
        <ExemptionStatusBadge status={status.perToggle.publicExpropriation} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="공장 오염피해 인접토지 (소유자 요구로 취득)"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행규칙 §83조의5"
            label="소득령 §168의14③5호 (소득칙 §83의5④1호)"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptFactoryAdjacent}
        onCheckedChange={(v) => onAssetChange({ nblExemptFactoryAdjacent: v })}
      >
        <ExemptionStatusBadge status={status.perToggle.factoryAdjacent} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="종중 소유 + 2005.12.31. 이전 취득"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③4호가목"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptJongjoongOwned}
        onCheckedChange={(v) => onAssetChange({ nblExemptJongjoongOwned: v })}
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">취득일</label>
          <DateInput
            value={asset.nblExemptJongjoongAcqDate}
            onChange={(v) => onAssetChange({ nblExemptJongjoongAcqDate: v })}
          />
        </div>
        <ExemptionStatusBadge status={status.perToggle.jongjoongOwned} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="도시지역 농지 종중·상속 5년 이내 양도 특례"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행령 §168조의14"
            label="소득령 §168의14③4호"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptUrbanFarmlandJongjoong}
        onCheckedChange={(v) => onAssetChange({ nblExemptUrbanFarmlandJongjoong: v })}
      >
        <ExemptionStatusBadge status={status.perToggle.urbanFarmland} />
      </ToggleCard>

      <ToggleCard
        tone="violet"
        title="2006.12.31. 이전 이농 농지 (2009.12.31.까지 양도)"
        description="농지 한정 — 이농 당시 소유한 농지를 2009.12.31.까지 양도한 경우"
        trailing={
          <LawArticleModal
            legalBasis="소득세법시행규칙 §83조의5"
            label="소득령 §168의14③5호 (소득칙 §83의5④2호)"
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptInong}
        onCheckedChange={(v) => onAssetChange({ nblExemptInong: v })}
      >
        <div>
          <label className="block text-xs text-muted-foreground mb-1">이농일</label>
          <DateInput
            value={asset.nblExemptInongDate}
            onChange={(v) => onAssetChange({ nblExemptInongDate: v })}
          />
        </div>
        <ExemptionStatusBadge status={status.perToggle.inong} />
      </ToggleCard>
    </div>
  );
}
