"use client";

/**
 * 상속주택 환산취득가액 상세 카드
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";

interface Props {
  detail: InheritanceHouseValuationResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

export function InheritedHouseValuationDetailCard({ detail }: Props) {
  const {
    sumAtInheritance,
    sumAtFirstDisclosure,
    landStdAtInheritance,
    landStdAtFirstDisclosure,
    buildingStdAtInheritance,
    buildingStdAtFirstDisclosure,
    housePriceAtFirstDisclosure,
    housePriceAtInheritanceUsed,
    housePriceAtTransfer,
    estimationMethod,
    pre1990Result,
    formula,
    legalBasis,
    warnings,
  } = detail;
  const isEstimated = estimationMethod === "estimated_phd";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/40 dark:bg-sky-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
          상속주택 환산취득가액 계산
        </p>
        <span className="text-[10px] text-muted-foreground">{legalBasis}</span>
        {estimationMethod === "estimated_phd" && (
          <span className="text-[10px] rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5">
            §164⑦ 개별주택가격 추정
          </span>
        )}
        {estimationMethod === "user_override" && (
          <span className="text-[10px] rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 px-2 py-0.5">
            사용자 직접 입력
          </span>
        )}
      </div>

      {/* 경고 */}
      {warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50/70 dark:border-amber-800/40 dark:bg-amber-950/30 p-2.5 space-y-0.5">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">주의</p>
          <ul className="text-xs text-amber-900 dark:text-amber-200 pl-3 list-disc space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {/* 계산 산식 */}
      {formula && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">계산 산식</p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-sky-100 dark:border-sky-800/30 p-2.5 text-xs text-muted-foreground whitespace-pre-wrap">
            {formula}
          </div>
        </div>
      )}

      {/* (A) §164⑦ 취득당시 개별주택가격 추정 — 합계기준시가(토지+건물) 비율. estimated 모드만 */}
      {isEstimated && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">
            취득당시 개별주택가격 추정 (§164⑦ — 합계기준시가 = 토지 + 건물)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-sky-100/60 dark:bg-sky-900/30">
                  <th className="px-3 py-2 text-left font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">시점</th>
                  <th className="px-3 py-2 text-right font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">토지 기준시가</th>
                  <th className="px-3 py-2 text-right font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">건물 기준시가</th>
                  <th className="px-3 py-2 text-right font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">합계기준시가</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-sky-100 dark:divide-sky-800/30">
                <tr>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">취득당시 (상속개시일)</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">{formatN(landStdAtInheritance)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">{formatN(buildingStdAtInheritance)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap font-semibold">{formatN(sumAtInheritance)}</td>
                </tr>
                <tr>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">최초 공시일</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">{formatN(landStdAtFirstDisclosure)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap">{formatN(buildingStdAtFirstDisclosure)}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-right whitespace-nowrap font-semibold">{formatN(sumAtFirstDisclosure)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-muted-foreground">
            취득당시 개별주택가격 = 최초공시 개별주택가격{" "}
            <span className="font-mono text-foreground">{formatN(housePriceAtFirstDisclosure)}</span>
            {" "}× ({formatN(sumAtInheritance)} ÷ {formatN(sumAtFirstDisclosure)}) ={" "}
            <span className="font-mono text-foreground font-semibold">{formatN(housePriceAtInheritanceUsed)}</span>
          </p>
        </div>
      )}

      {/* (B) 환산취득가 산식 요약 — 개별주택가격 비율(취득 ÷ 양도, 부수토지 포함) */}
      <div className="rounded bg-white/70 dark:bg-white/5 border border-sky-100 dark:border-sky-800/30 p-2.5 text-xs space-y-1">
        <p className="text-muted-foreground">
          환산취득가액 = 양도가액 × (취득당시 개별주택가격{" "}
          <span className="font-mono text-foreground">{formatN(housePriceAtInheritanceUsed)}</span>
          {" "}÷ 양도당시 개별주택가격{" "}
          <span className="font-mono text-foreground">{formatN(housePriceAtTransfer)}</span>
          )
        </p>
      </div>

      {/* 1990 환산 상세 */}
      {pre1990Result && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">
            1990.8.30 이전 환산 상세
            <span className="ml-1 text-[10px] text-muted-foreground font-normal">
              (소득세법 시행령 제164조 제4항)
            </span>
          </p>
          <div className="rounded bg-white/70 dark:bg-white/5 border border-sky-100 dark:border-sky-800/30 p-2.5 text-xs space-y-1 text-muted-foreground">
            <p>{pre1990Result.caseLabel}</p>
            <p className="font-mono">{pre1990Result.breakdown.formula}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1">
              <span>취득 시 등급가액</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(pre1990Result.breakdown.gradeValueAtAcquisition)}
              </span>
              <span>1990.8.30 등급가액</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(pre1990Result.breakdown.gradeValue_1990_0830)}
              </span>
              <span>1990.8.29 등급가액</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(pre1990Result.breakdown.gradeValuePrev_1990_0830)}
              </span>
              <span>적용 분모</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(pre1990Result.breakdown.appliedDenominator)}
              </span>
              <span>적용 비율</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {(pre1990Result.breakdown.appliedRatio * 100).toFixed(2)}%
              </span>
              <span>취득 시 ㎡당 기준시가</span>
              <span className="font-mono tabular-nums text-right text-foreground">
                {formatN(pre1990Result.pricePerSqmAtAcquisition)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
