"use client";

import { SectionHeader } from "@/components/calc/shared/SectionHeader";
import { DateInput } from "@/components/ui/date-input";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type {
  NblExemptionEval,
  ToggleExemptionStatus,
} from "@/lib/calc/nbl-unconditional-exemption-status";
import { jongjoongLegalBadge } from "@/lib/calc/nbl-unconditional-exemption-status";

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
  const jongjoongBadge = jongjoongLegalBadge(asset);
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

      {/*
        ③1호(2006.12.31. 이전 상속)·③4호 나목(도시지역 농지 상속 5년)은 「상속받은」·「상속개시일」 외 요건이 양도일·지목·
        용도지역뿐이라 토글 없이 자동 판정한다(계획서 docs/00-pm/nbl-unconditional-inherit-cause.plan.md). 성립하면 위 배너가 밝힌다.
      */}
      {asset.acquisitionCause === "inheritance" && (
        <ToneCard tone="violet">
          {asset.nonHeirBequest ? (
            <p className="text-caption" data-testid="nbl-uncond-inherit-auto-notice">
              상속인이 아닌 사람이 유증·사인증여로 받은 토지라 상속 특례(소득령 §168의14③1호·1호의2·3호 나목 취득일
              소급·4호 나목)를 적용하지 않습니다(서면5팀-927 · 사전-2024-법규재산-0820 · 부동산거래관리과-0994 ·
              기준-2019-법령해석재산-0324).
            </p>
          ) : (
            <p className="text-caption" data-testid="nbl-uncond-inherit-auto-notice">
              상속받은 토지입니다. 2006.12.31. 이전 상속 후 2009.12.31.까지 양도한 농지·임야·목장용지(소득령 §168의14③1호)와
              도시지역 농지로서 상속개시일부터 5년 이내에 양도하는 토지(③4호 나목)는 취득일 칸의
              상속개시일({asset.acquisitionDate || "취득일 칸에 입력"})로 자동 판정하므로 따로 선택하지 않습니다.
            </p>
          )}
        </ToneCard>
      )}

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
        title="종중 소유 (2005.12.31. 이전 취득)"
        description="농지·임야·목장용지 — 위 취득일이 2005.12.31. 이전이어야 합니다. 명의신탁 해지로 종중 명의로 되돌린 토지는 취득일에 종중이 처음 취득한 날을 넣으세요(서면인터넷방문상담5팀-219)."
        trailing={
          <LawArticleModal
            legalBasis={jongjoongBadge.legalBasis}
            label={jongjoongBadge.label}
            className={LAW_BADGE_CLASS}
          />
        }
        checked={asset.nblExemptJongjoongOwned}
        onCheckedChange={(v) => onAssetChange({ nblExemptJongjoongOwned: v })}
      >
        <ExemptionStatusBadge status={status.perToggle.jongjoongOwned} />
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
