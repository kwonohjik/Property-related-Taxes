"use client";

/**
 * EvaluationCommitteeResultCard — §54⑥ 결과 카드 (PR-K-4)
 *
 * 평가심의위 신청 결과 + Range Indicator + 신청 기한 카운트다운.
 * - METHOD_LABEL lookup으로 적용 방법 한글 표시
 * - deviationPct 한글 표시 ("보충적 대비 -3.75%")
 * - 신청 기한 카운트다운 (상속·증여 분기)
 * - 기한 초과 음수일 + rose 경고
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-4
 */

import { useMemo } from "react";
import { EvaluationCommitteeRangeIndicator } from "./EvaluationCommitteeRangeIndicator";
import {
  METHOD_LABEL,
  type EvaluationCommitteeResult,
} from "@/lib/tax-engine/property-valuation/evaluation-committee-section-54-6";
import {
  inheritanceApplicationDeadline,
  giftApplicationDeadline,
  daysUntilDeadline,
} from "@/lib/calc/evaluation-committee-deadline";

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface EvaluationCommitteeResultCardProps {
  result: EvaluationCommitteeResult | undefined;
  /** 납세자 신청 평가액 (1주당) — Range Indicator 마커용 */
  taxpayerPerShareValuation: number;
  /** 신청 기한 산정용 기준일 (상속개시일 or 증여일) */
  baseDate?: Date;
  /** 기한 산정 분기 */
  taxKind?: "inheritance" | "gift";
  /** 오늘 날짜 (테스트 주입용) */
  today?: Date;
}

export function EvaluationCommitteeResultCard({
  result,
  taxpayerPerShareValuation,
  baseDate,
  taxKind,
  today,
}: EvaluationCommitteeResultCardProps) {
  const deadlineInfo = useMemo(() => {
    if (!baseDate || !taxKind) return null;
    const deadline =
      taxKind === "inheritance"
        ? inheritanceApplicationDeadline(baseDate)
        : giftApplicationDeadline(baseDate);
    const days = daysUntilDeadline(deadline, today);
    return { deadline, days };
  }, [baseDate, taxKind, today]);

  if (!result) return null;

  const deviationPctStr = (result.deviationPct * 100).toFixed(2);
  const deviationSign = result.deviationPct >= 0 ? "+" : "";

  return (
    <div
      className="rounded-lg border border-emerald-300 bg-emerald-50/30 p-4 space-y-3"
      data-testid="evaluation-committee-result-card"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-emerald-200">
        <span className="text-emerald-600 text-base">⚖️</span>
        <h4 className="text-sm font-bold text-emerald-900">
          §54⑥ 평가심의위원회 신청 결과 (참고용)
        </h4>
      </div>

      <p className="text-caption text-emerald-700/80">
        본 결과는 보충적 평가가액(⑥)을 대체하지 않습니다. 평가심의위 신청 후 인가 시
        납세자가 별도로 신고서에 반영해야 합니다.
      </p>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded border border-emerald-200 bg-white p-2">
          <p className="text-emerald-700/70 text-micro">적용 평가방법</p>
          <p
            className="font-semibold text-emerald-900 mt-1"
            data-testid="evaluation-committee-result-method"
          >
            {METHOD_LABEL[result.method]}
          </p>
        </div>
        <div className="rounded border border-emerald-200 bg-white p-2">
          <p className="text-emerald-700/70 text-micro">보충적 대비 편차</p>
          <p
            className={`font-semibold mt-1 ${
              result.isWithinRange ? "text-emerald-900" : "text-rose-700"
            }`}
            data-testid="evaluation-committee-result-deviation"
          >
            {deviationSign}
            {deviationPctStr}%
          </p>
        </div>
      </div>

      <EvaluationCommitteeRangeIndicator
        supplementary={result.supplementary}
        taxpayer={taxpayerPerShareValuation}
        lower={result.lower}
        upper={result.upper}
        isWithinRange={result.isWithinRange}
      />

      {deadlineInfo && (
        <div
          className={`rounded border p-2 text-xs ${
            deadlineInfo.days < 0
              ? "border-rose-300 bg-rose-50 text-rose-800"
              : deadlineInfo.days <= 30
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-200 bg-white text-emerald-800"
          }`}
          data-testid="evaluation-committee-deadline-card"
        >
          <p className="font-semibold">
            평가심의위 신청 기한 ({taxKind === "inheritance" ? "상속세" : "증여세"} 신고기한
            준용)
          </p>
          <p className="mt-1">
            기한일: {formatLocalDate(deadlineInfo.deadline)} ·{" "}
            {deadlineInfo.days < 0 ? (
              <strong>{Math.abs(deadlineInfo.days)}일 초과 (신청 불가)</strong>
            ) : deadlineInfo.days === 0 ? (
              <strong>오늘 마감</strong>
            ) : (
              <strong>D-{deadlineInfo.days}</strong>
            )}
          </p>
        </div>
      )}

      {result.warnings.length > 0 && (
        <div
          className="rounded border border-rose-200 bg-rose-50 p-2 text-xs text-rose-800"
          data-testid="evaluation-committee-result-warnings"
        >
          {result.warnings.map((w, i) => (
            <p key={i}>⚠ {w.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}
