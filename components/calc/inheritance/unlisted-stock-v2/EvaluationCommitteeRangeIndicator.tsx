"use client";

/**
 * EvaluationCommitteeRangeIndicator — §54⑥ 70~130% 범위 시각화 (PR-K-4)
 *
 * Range 시각 막대 + 납세자 위치 마커.
 *   - 막대: 0~200% (보충적 평가가액 100% 기준)
 *   - 범위 표시: 70%~130% emerald 영역
 *   - 납세자 위치: 70%~130% 범위 안 emerald / 범위 밖 rose
 *   - supplementary=0 시 gray-out + 비활성
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-evaluation-committee-section-54-6.plan.md PR-K-4
 */

export interface EvaluationCommitteeRangeIndicatorProps {
  /** 보충적 평가가액 (100% 기준점) */
  supplementary: number;
  /** 납세자 신청 평가액 */
  taxpayer: number;
  /** 70% 하한 (엔진 산정값) */
  lower: number;
  /** 130% 상한 (엔진 산정값) */
  upper: number;
  /** 범위 내 여부 (엔진 산정값) */
  isWithinRange: boolean;
}

export function EvaluationCommitteeRangeIndicator({
  supplementary,
  taxpayer,
  lower,
  upper,
  isWithinRange,
}: EvaluationCommitteeRangeIndicatorProps) {
  const isInactive = supplementary <= 0;

  if (isInactive) {
    return (
      <div
        className="rounded-md border border-slate-200 bg-slate-50 p-3"
        data-testid="evaluation-committee-range-inactive"
      >
        <p className="text-xs text-slate-500">
          보충적 평가가액 산정 전 — 70~130% 범위 표시 불가
        </p>
      </div>
    );
  }

  // 막대 표시 범위: 0% ~ 200% (200% 초과 시 clamp)
  const MAX_PCT = 200;
  const lowerPct = (lower / supplementary) * 100; // 70
  const upperPct = (upper / supplementary) * 100; // 130
  const taxpayerPct = Math.min(MAX_PCT, Math.max(0, (taxpayer / supplementary) * 100));

  const rangeColor = isWithinRange ? "bg-emerald-500" : "bg-rose-500";
  const markerColor = isWithinRange ? "bg-emerald-700" : "bg-rose-700";

  return (
    <div
      className="rounded-md border border-emerald-200 bg-emerald-50/40 p-3 space-y-2"
      data-testid="evaluation-committee-range-active"
    >
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold text-emerald-800">70~130% 허용 범위</span>
        <span
          className={isWithinRange ? "text-emerald-700" : "text-rose-700"}
          data-testid="evaluation-committee-range-status"
        >
          {isWithinRange ? "범위 내 ✓" : "범위 밖 ✗"}
        </span>
      </div>

      <div className="relative h-6 bg-slate-100 rounded">
        {/* 범위 영역 (70~130%) */}
        <div
          className={`absolute top-0 h-full rounded ${rangeColor} opacity-30`}
          style={{
            left: `${(lowerPct / MAX_PCT) * 100}%`,
            width: `${((upperPct - lowerPct) / MAX_PCT) * 100}%`,
          }}
          data-testid="evaluation-committee-range-bar"
        />
        {/* 100% 보충적 기준선 */}
        <div
          className="absolute top-0 h-full w-px bg-emerald-700"
          style={{ left: `${(100 / MAX_PCT) * 100}%` }}
        />
        {/* 납세자 위치 마커 */}
        <div
          className={`absolute top-0 h-full w-1 ${markerColor}`}
          style={{ left: `calc(${(taxpayerPct / MAX_PCT) * 100}% - 2px)` }}
          data-testid="evaluation-committee-range-marker"
        />
      </div>

      <div className="grid grid-cols-3 gap-2 text-caption text-slate-700">
        <div>
          <span className="font-semibold">70% 하한</span>
          <br />
          {lower.toLocaleString()}
        </div>
        <div className="text-center">
          <span className="font-semibold">100% 보충적</span>
          <br />
          {supplementary.toLocaleString()}
        </div>
        <div className="text-right">
          <span className="font-semibold">130% 상한</span>
          <br />
          {upper.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
