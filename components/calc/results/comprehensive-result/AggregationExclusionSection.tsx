"use client";

/**
 * 합산배제 적용 내역 — ComprehensiveTaxResultView에서 분리(800줄 정책).
 * 신청했는데 성립하지 않은 주택의 사유(엔진 failReasons — 「확인 필요」 포함)도 여기서 보인다.
 */
import type { ComprehensiveTaxResult } from "@/lib/tax-engine/types/comprehensive.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { SectionHeader } from "./result-rows";

function failedExclusions(result: ComprehensiveTaxResult) {
  return result.aggregationExclusion.propertyResults
    .map((r, idx) => ({ r, idx }))
    .filter(({ r }) => r.exclusionType !== "none" && !r.isExcluded);
}

/** 화면·인쇄 선택이 같은 조건으로 섹션 유무를 정한다. */
export function hasAggregationExclusionContent(result: ComprehensiveTaxResult): boolean {
  return result.aggregationExclusion.excludedCount > 0 || failedExclusions(result).length > 0;
}

// ============================================================
// 합산배제 내역 섹션
// ============================================================

export function AggregationExclusionSection({
  result,
}: {
  result: ComprehensiveTaxResult;
}) {
  const { aggregationExclusion } = result;
  if (!hasAggregationExclusionContent(result)) return null;
  const failed = failedExclusions(result);

  return (
    <section className="space-y-2">
      <SectionHeader>합산배제 적용 내역</SectionHeader>
      <div className="rounded-md border bg-blue-50/50 divide-y dark:bg-blue-950/40">
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>합산배제 주택 수</span>
          <span className="font-medium">{aggregationExclusion.excludedCount}건</span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>합산배제 공시가격 합계</span>
          <span className="font-medium text-blue-700 dark:text-blue-300">
            {formatKRW(aggregationExclusion.totalExcludedValue)}
          </span>
        </div>
        <div className="flex justify-between px-3 py-2 text-sm">
          <span>과세 대상 주택 수</span>
          <span className="font-medium">{aggregationExclusion.includedCount}건</span>
        </div>
      </div>

      {/* 합산배제를 신청했지만 요건이 성립하지 않은 주택 — 사유(확인 필요 포함) */}
      {failed.length > 0 && (
        <ToneCard tone="rose" title="합산배제 불성립 — 과세표준에 합산" bodyClassName="space-y-1">
          <ul className="space-y-1" data-testid="comprehensive-exclusion-fail-reasons">
            {failed.flatMap(({ r, idx }) =>
              (r.failReasons && r.failReasons.length > 0 ? r.failReasons : [r.reason]).map((reason, ri) => (
                <li key={`${idx}-${ri}`} className="text-xs">
                  주택 {idx + 1}번째: {reason}
                </li>
              )),
            )}
          </ul>
        </ToneCard>
      )}

      {/* 의무임대기간 미충족 경고 (시행령 §3① — 사후 추징 위험) */}
      {aggregationExclusion.propertyResults.some(
        (r) => r.warnings && r.warnings.length > 0,
      ) && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 dark:bg-amber-950/40">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">의무임대기간 확인 필요</p>
          <ul className="mt-1 space-y-1">
            {aggregationExclusion.propertyResults.flatMap((r, idx) =>
              (r.warnings ?? []).map((w, wi) => (
                <li key={`${idx}-${wi}`} className="text-xs text-amber-700 dark:text-amber-300">
                  임대주택 {idx + 1}번째: {w}
                </li>
              )),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
