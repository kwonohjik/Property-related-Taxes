"use client";

/**
 * 신축주택 양도소득세 감면 결과 상세 카드 (조특법 §99 등)
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { NewHousingReductionResult } from "@/lib/tax-engine/new-housing-reduction";

interface Props {
  detail: NewHousingReductionResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

const ARTICLE_LABEL: Record<string, string> = {
  "99-1": "§99 ①",
  "99-2": "§99 ②",
  "99-3": "§99 ③",
  "99-4": "§99 ④",
  "99-5": "§99 ⑤",
  "99_3": "§99의3",
};

export function NewHousingReductionDetailCard({ detail }: Props) {
  const {
    isEligible,
    ineligibleReasons,
    matchedArticleCode,
    matchedArticle,
    reductionScope,
    reductionRate,
    reductionAmount,
    isWithinFiveYearWindow,
    reducibleGain,
    fiveYearRatio,
    isExcludedFromHouseCount,
    isExcludedFromMultiHouseSurcharge,
    warnings,
  } = detail;

  const articleLabel =
    matchedArticleCode ? (ARTICLE_LABEL[matchedArticleCode] ?? matchedArticle ?? matchedArticleCode) : "";

  if (!isEligible) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50/80 dark:border-amber-700/50 dark:bg-amber-950/30 p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            신축주택 양도소득세 감면 — 감면 불가
          </p>
          {articleLabel && (
            <span className="text-micro text-amber-800 dark:text-amber-400">
              조세특례제한법 {articleLabel}
            </span>
          )}
        </div>
        {ineligibleReasons.length > 0 && (
          <div className="rounded border border-amber-200 bg-white/70 dark:border-amber-800/40 dark:bg-amber-950/40 p-2.5 space-y-1">
            <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">감면 불가 사유</p>
            <ul className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5 pl-4 list-disc">
              {ineligibleReasons.map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
            </ul>
          </div>
        )}
        {warnings.length > 0 && (
          <ul className="text-xs text-amber-800 dark:text-amber-300 pl-3 list-disc space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
          신축주택 양도소득세 감면
        </p>
        {articleLabel && (
          <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5 font-medium">
            조세특례제한법 {articleLabel}
          </span>
        )}
        {reductionScope && (
          <span className="text-micro text-muted-foreground">
            {reductionScope === "tax_amount" ? "산출세액 기준 감면" : "양도차익 기준 감면"}
          </span>
        )}
      </div>

      {/* 핵심 수치 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-emerald-200 bg-emerald-50/80 dark:border-emerald-800/30 dark:bg-emerald-950/30 p-2.5 text-center">
          <p className="text-micro text-emerald-700 dark:text-emerald-400 font-medium">감면세액</p>
          <p className="text-sm font-mono font-semibold text-emerald-900 dark:text-emerald-200 mt-0.5">
            {formatN(reductionAmount)}
          </p>
        </div>
        <div className="rounded border border-sky-200 bg-sky-50/60 dark:border-sky-800/30 dark:bg-sky-950/20 p-2.5 text-center">
          <p className="text-micro text-sky-700 dark:text-sky-400 font-medium">적용 감면율</p>
          <p className="text-sm font-mono font-semibold text-sky-900 dark:text-sky-200 mt-0.5">
            {formatRate(reductionRate)}
          </p>
        </div>
      </div>

      {/* 5년 안분 산식 */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">
          감면대상 양도차익 산정
        </p>
        <div className="rounded bg-white/70 dark:bg-white/5 border border-emerald-100 dark:border-emerald-800/30 p-2.5 text-xs space-y-1">
          {isWithinFiveYearWindow ? (
            <p className="text-muted-foreground">
              취득일부터 5년 이내 양도 → 전체 양도차익{" "}
              <span className="font-mono text-foreground">{formatN(reducibleGain)}</span>
              {" "}전액 감면 대상
            </p>
          ) : (
            <>
              <p className="text-muted-foreground">
                5년 이내 취득분 안분 비율:{" "}
                <span className="font-mono text-foreground">{(fiveYearRatio * 100).toFixed(4)}%</span>
              </p>
              <p className="text-muted-foreground">
                감면대상 양도차익 = 전체 양도차익 × 5년 안분 비율
              </p>
              <p className="font-mono font-semibold text-emerald-900 dark:text-emerald-200">
                = {formatN(reducibleGain)}
              </p>
            </>
          )}
        </div>
      </div>

      {/* 추가 효과 */}
      {(isExcludedFromHouseCount || isExcludedFromMultiHouseSurcharge) && (
        <div className="rounded border border-emerald-100 bg-emerald-50/40 dark:border-emerald-800/20 dark:bg-emerald-950/10 p-2.5 space-y-1">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">추가 효과</p>
          {isExcludedFromHouseCount && (
            <p className="text-xs text-muted-foreground">
              주택 수 산정에서 제외 (다주택 판정 미산입)
            </p>
          )}
          {isExcludedFromMultiHouseSurcharge && (
            <p className="text-xs text-muted-foreground">
              다주택 중과세 배제
            </p>
          )}
        </div>
      )}

      {/* 경고 */}
      {warnings.length > 0 && (
        <ul className="text-xs text-amber-800 dark:text-amber-300 pl-3 list-disc space-y-0.5">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
