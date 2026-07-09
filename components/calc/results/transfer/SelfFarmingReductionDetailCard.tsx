"use client";

/**
 * 자경농지 감면 결과 상세 카드 (조특법 §69)
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { SelfFarmingReductionResult } from "@/lib/tax-engine/self-farming-reduction";

interface Props {
  detail: SelfFarmingReductionResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

export function SelfFarmingReductionDetailCard({ detail }: Props) {
  const {
    qualifies,
    reducibleIncome,
    reducibleRatio,
    nonReducibleIncome,
    partialReductionApplied,
    incorporationGraceExpired,
    legalBasis,
    breakdown,
  } = detail;

  if (!qualifies) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            자경농지 양도소득세 감면 — 감면 불가
          </p>
          <span className="text-micro text-amber-800 dark:text-amber-400">{legalBasis}</span>
        </div>
        {breakdown.length > 0 && (
          <div className="rounded border border-amber-200 bg-white/70 dark:border-amber-800/40 dark:bg-amber-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">감면 불가 사유</p>
            <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5 pl-4 list-disc">
              {breakdown.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          자경농지 양도소득세 감면
        </p>
        <span className="text-micro text-muted-foreground">{legalBasis}</span>
        {incorporationGraceExpired && (
          <span className="text-micro rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 px-2 py-0.5">
            편입 유예기간 경과 — 감면 상실
          </span>
        )}
      </div>

      {/* 판정 요약 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/30 dark:bg-emerald-950/30 p-2.5 text-center">
          <p className="text-micro text-emerald-700 dark:text-emerald-400 font-medium">감면대상 양도소득금액</p>
          <p className="text-sm font-mono font-semibold text-emerald-900 dark:text-emerald-200 mt-0.5">
            {formatN(reducibleIncome)}
          </p>
        </div>
        <div className="rounded border border-rose-200 bg-rose-50/60 dark:border-rose-800/30 dark:bg-rose-950/20 p-2.5 text-center">
          <p className="text-micro text-rose-700 dark:text-rose-400 font-medium">감면 제외 양도소득금액</p>
          <p className="text-sm font-mono font-semibold text-rose-900 dark:text-rose-200 mt-0.5">
            {formatN(nonReducibleIncome)}
          </p>
        </div>
      </div>

      {/* 편입일 부분감면 산식 */}
      {partialReductionApplied && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
            편입일 부분감면 산식
            <span className="ml-1 text-micro text-muted-foreground font-normal">
              (조세특례제한법 시행령 제66조)
            </span>
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1">
            <p className="text-muted-foreground">
              감면비율 = (편입일 당시 기준시가 − 취득 당시 기준시가) ÷ (양도 당시 기준시가 − 취득 당시 기준시가)
            </p>
            <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
              = {(reducibleRatio * 100).toFixed(4)}%
            </p>
            <p className="text-muted-foreground border-t border-emerald-100 dark:border-emerald-800/30 pt-1.5 mt-1">
              감면대상 양도소득금액 = 전체 양도소득금액{" "}
              <span className="font-mono text-foreground">{formatN(reducibleIncome + nonReducibleIncome)}</span>
              {" "}× 감면비율{" "}
              <span className="font-mono text-foreground">{(reducibleRatio * 100).toFixed(4)}%</span>
            </p>
            <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200 mt-0.5">
              = {formatN(reducibleIncome)}
            </p>
          </div>
        </div>
      )}

      {/* 판단 근거 */}
      {breakdown.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">판단 근거</p>
          <ul className="text-xs text-muted-foreground space-y-0.5 pl-3 list-disc">
            {breakdown.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
