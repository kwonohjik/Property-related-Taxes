"use client";

/**
 * 상속주택 환산취득가액 상세 카드
 *
 * ⑦ 결과 카드 산식 — 한국어 풀어쓰기, 변수 약어·floor()·"원" 끝 금지.
 */

import type { InheritanceHouseValuationResult } from "@/lib/tax-engine/types/inheritance-house-valuation.types";
import type { InheritanceAcquisitionResult } from "@/lib/tax-engine/types/inheritance-acquisition.types";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

interface Props {
  detail: InheritanceHouseValuationResult;
  /**
   * 같은 화면 옆 카드(`InheritedAcquisitionDetailCard`)가 읽는 **바로 그 결과** (2026-09-05 · Q18).
   *
   * 아래 (B) 「환산취득가액 = 양도가액 × 비율」은 실제로 적용되는 일이 드물다 —
   * 법 §97①1호 **단서**상 나목(환산)은 가목(①상증법 평가액·②§164 기준시가)을 **확인할 수
   * 없을 때에 한정**되는데, 이 카드가 뜨는 상황에서는 ②가 함께 주입되므로 가목이 확인된다.
   * 종전에는 그 사실을 말하지 않고 산식을 **결론처럼** 보여, 옆 카드가 같은 값에 「미적용」
   * 취소선을 긋는 것과 화면 안에서 모순됐다.
   *
   * ⚠️ 적용 여부를 여기서 **다시 판정하지 않는다** — 옆 카드와 같은 `selectedMethod`를 읽는다.
   *    복제하면 두 카드가 갈릴 수 있다(두 번째 진실 금지).
   */
  acquisitionDetail?: InheritanceAcquisitionResult;
}

function formatN(n: number): string {
  return n.toLocaleString();
}

export function InheritedHouseValuationDetailCard({ detail, acquisitionDetail }: Props) {
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

  /**
   * (B) 환산취득가액의 **적용 상태** — 판정은 옆 카드와 같은 소스에서 읽는다.
   *  · "applied"  — 가목을 확인할 수 없어 실제로 나목(환산)이 쓰였다.
   *  · "clause_a" — 가목(①②)이 확인돼 나목에 가지 않았다(법 §97①1호 단서).
   *  · "no_clause_b" — 의제취득일 **이후** 상속은 §163⑨가 가목을 의제하므로 나목 자체가 없다
   *    (`preDeemedBreakdown`이 붙지 않는 경로가 곧 그 경우다).
   *  · "unknown" — 취득가액 결과가 함께 오지 않았다. **단정하지 않는다**.
   */
  const convertedState: "applied" | "clause_a" | "no_clause_b" | "unknown" = !acquisitionDetail
    ? "unknown"
    : acquisitionDetail.preDeemedBreakdown
      ? acquisitionDetail.preDeemedBreakdown.selectedMethod === "converted"
        ? "applied"
        : "clause_a"
      : "no_clause_b";
  const convertedApplied = convertedState === "applied";

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/50 dark:border-sky-800/40 dark:bg-sky-950/20 p-4 space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-semibold text-sky-900 dark:text-sky-200">
          상속주택 환산취득가액 계산
        </p>
        <span className="text-micro text-muted-foreground">{legalBasis}</span>
        {estimationMethod === "estimated_phd" && (
          <span className="text-micro rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-0.5">
            §164⑦ 개별주택가격 추정
          </span>
        )}
        {estimationMethod === "user_override" && (
          <span className="text-micro rounded-full bg-sky-100 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300 px-2 py-0.5">
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
          <p className="text-caption text-muted-foreground">
            취득당시 개별주택가격 = 최초공시 개별주택가격{" "}
            <span className="font-mono text-foreground">{formatN(housePriceAtFirstDisclosure)}</span>
            {" "}× <Frac top={formatN(sumAtInheritance)} bottom={formatN(sumAtFirstDisclosure)} /> ={" "}
            <span className="font-mono text-foreground font-semibold">{formatN(housePriceAtInheritanceUsed)}</span>
          </p>
        </div>
      )}

      {/* (B) 환산취득가 산식 요약 — 개별주택가격 비율(취득 ÷ 양도, 부수토지 포함).
          결론이 아니라 **상태를 밝힌 참고 산식**이다(Q18) — 판정 소스는 위 `convertedState`. */}
      <div
        className="rounded bg-white/70 dark:bg-white/5 border border-sky-100 dark:border-sky-800/30 p-2.5 text-xs space-y-1"
        data-testid="inh-house-converted-box"
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">환산취득가액</p>
          {convertedState === "clause_a" && (
            <span className="text-micro rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              미적용 — 실지거래가액 의제(가목)가 확인됨
            </span>
          )}
          {convertedState === "no_clause_b" && (
            <span className="text-micro rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              미적용 — 상증법 평가액·§164 기준시가로 산정
            </span>
          )}
          {convertedState === "applied" && (
            <span className="text-micro rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 px-2 py-0.5">
              적용
            </span>
          )}
        </div>
        <p className={convertedApplied ? "text-muted-foreground" : "text-muted-foreground/70"}>
          환산취득가액 = 양도가액 ×{" "}
          <Frac
            top={
              <>
                취득당시 개별주택가격{" "}
                <span className="font-mono text-foreground">{formatN(housePriceAtInheritanceUsed)}</span>
              </>
            }
            bottom={
              <>
                양도당시 개별주택가격{" "}
                <span className="font-mono text-foreground">{formatN(housePriceAtTransfer)}</span>
              </>
            }
          />
        </p>
      </div>

      {/* 1990 환산 상세 */}
      {pre1990Result && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">
            1990.8.30 이전 환산 상세
            <span className="ml-1 text-micro text-muted-foreground font-normal">
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
