"use client";

import type { NonBusinessLandJudgment, JudgmentStep, StepStatus } from "@/lib/tax-engine/non-business-land";

interface Props {
  judgment: NonBusinessLandJudgment;
}

/**
 * P1: 비사업용 토지 판정 결과 카드
 *
 * non-business-land 참조 프로젝트의 3-카드 레이아웃을 우리 디자인 시스템에 맞게 구현:
 * 1. 판정 배지 (사업용/비사업용)
 * 2. 단계별 판정 과정 타임라인 (PASS/FAIL/SKIP/NOT_APPLICABLE)
 * 3. 적용 법령 목록
 */
export function NonBusinessLandResultCard({ judgment }: Props) {
  const isNonBusiness = judgment.isNonBusinessLand;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* 헤더: 판정 배지 */}
      <div
        className={
          isNonBusiness
            ? "bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 px-4 py-3"
            : "bg-emerald-50 dark:bg-emerald-950/30 border-b border-emerald-200 dark:border-emerald-900 px-4 py-3"
        }
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">{isNonBusiness ? "⚠️" : "✅"}</span>
          <div>
            <p
              className={`text-sm font-bold ${
                isNonBusiness
                  ? "text-red-700 dark:text-red-400"
                  : "text-emerald-700 dark:text-emerald-400"
              }`}
            >
              {isNonBusiness ? "비사업용 토지 — 중과세 적용" : "사업용 토지 — 일반세율 적용"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{judgment.judgmentReason}</p>
          </div>
        </div>
      </div>

      {/* 기간 분석 요약 */}
      {judgment.totalOwnershipDays > 0 && (
        <div className="px-4 py-3 bg-muted/20 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-2">기간 분석</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <span className="text-muted-foreground">전체 보유일수</span>
            <span className="font-mono text-right">{judgment.totalOwnershipDays.toLocaleString()}일</span>
            <span className="text-muted-foreground">사업용 사용일수</span>
            <span className="font-mono text-right">{judgment.effectiveBusinessDays.toLocaleString()}일</span>
            <span className="text-muted-foreground">사업용 비율</span>
            <span className="font-mono text-right">
              {Math.round(judgment.businessUseRatio * 10000) / 100}%
            </span>
            {judgment.gracePeriodDays > 0 && (
              <>
                <span className="text-muted-foreground">유예기간</span>
                <span className="font-mono text-right">{judgment.gracePeriodDays.toLocaleString()}일</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 판정 과정 타임라인 */}
      {judgment.judgmentSteps.length > 0 && (
        <div className="px-4 py-3 border-b border-border">
          <p className="text-xs font-medium text-muted-foreground mb-3">판정 과정</p>
          <ol className="space-y-2">
            {judgment.judgmentSteps.map((step) => (
              <StepItem key={step.id} step={step} />
            ))}
          </ol>
        </div>
      )}

      {/* 경고 메시지 */}
      {judgment.warnings.length > 0 && (
        <div className="px-4 py-3 border-b border-border bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">주의사항</p>
          <ul className="space-y-1">
            {judgment.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1.5">
                <span>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 적용 법령 */}
      {judgment.appliedLawArticles.length > 0 && (
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">적용 법령</p>
          <div className="flex flex-wrap gap-1.5">
            {judgment.appliedLawArticles.map((law, i) => (
              <span
                key={i}
                className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground"
              >
                {law}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 단계별 타임라인 항목 ──────────────────────────────────────────

function StepItem({ step }: { step: JudgmentStep }) {
  const { icon, iconBg, textColor } = getStepStyle(step.status);

  return (
    <li className="flex gap-3 items-start">
      <span
        className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-xs ${iconBg}`}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={`text-xs font-medium ${textColor}`}>{step.label}</span>
          <span className={`text-xs ${getStatusLabel(step.status).color}`}>
            {getStatusLabel(step.status).text}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{step.detail}</p>
        {step.legalBasis && (
          <span className="inline-block mt-1 text-[10px] text-muted-foreground/70 border border-border/60 rounded px-1.5 py-0.5">
            {step.legalBasis}
          </span>
        )}
      </div>
    </li>
  );
}

function getStepStyle(status: StepStatus): {
  icon: string;
  iconBg: string;
  textColor: string;
} {
  switch (status) {
    case "PASS":
      return {
        icon: "✓",
        iconBg: "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400",
        textColor: "text-foreground",
      };
    case "FAIL":
      return {
        icon: "✗",
        iconBg: "bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400",
        textColor: "text-foreground",
      };
    case "SKIP":
      return {
        icon: "→",
        iconBg: "bg-muted text-muted-foreground",
        textColor: "text-muted-foreground",
      };
    case "NOT_APPLICABLE":
      return {
        icon: "–",
        iconBg: "bg-muted text-muted-foreground",
        textColor: "text-muted-foreground",
      };
  }
}

function getStatusLabel(status: StepStatus): { text: string; color: string } {
  switch (status) {
    case "PASS":
      return { text: "충족", color: "text-emerald-600 dark:text-emerald-400" };
    case "FAIL":
      return { text: "미충족", color: "text-red-600 dark:text-red-400" };
    case "SKIP":
      return { text: "건너뜀", color: "text-muted-foreground" };
    case "NOT_APPLICABLE":
      return { text: "해당없음", color: "text-muted-foreground" };
  }
}
