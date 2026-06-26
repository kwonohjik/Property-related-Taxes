"use client";

/**
 * FarmlandReductionCard — 조특법 §71 영농자녀 농지 증여세 감면 상세 (gift-farmland-reduction-71)
 *
 * 재재산-1454 해설 표 재현:
 *   ㉡ 합산 산출세액 − 직전 회차 산출세액 ㉠ = 농지분 산출세액 ㉣
 *   ㉤ 감면세액 = min(㉣, 5년 한도 잔여) / 누적 1억 한도(§71②)
 *   ㉮ 감면범위 = 농지가액 × ㉤ / ㉣ / ㉯ 초과분 = 농지가액 − ㉮ (일반 증여세 합산과세)
 *
 * 차감세액(§69 전) = ㉡ − §58 − ㉤. 결정세액(§69 후)은 본표 참조.
 */

import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface Props {
  detail: NonNullable<GiftTaxResult["farmlandReductionDetail"]>;
  /** ㉡ 합산 산출세액 (result.computedTax) */
  computedTax: number;
  /** §58 기납부세액공제 (result.creditDetail.giftTaxCredit) */
  priorTaxCredit: number;
}

export function FarmlandReductionCard({ detail, computedTax, priorTaxCredit }: Props) {
  // ㉠ 직전 회차 산출세액 = ㉡ − ㉣ (한도 미적용 안분 분모 기준)
  const priorComputedTax = computedTax - detail.farmlandComputedTax;
  // 차감세액(§69 전) = ㉡ − §58 − ㉤
  const reducedTax = computedTax - priorTaxCredit - detail.reductionAmount;
  const limitReached = detail.cumulative5yrReduction >= 100_000_000;

  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 dark:border-emerald-800 dark:bg-emerald-950/20">
      <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
        영농자녀 농지 증여세 감면 (조특법 §71)
      </h3>
      <p className="text-xs text-emerald-600 dark:text-emerald-400">
        합산 산출세액에서 직전 회차 농지 산출세액을 뺀 농지분 산출세액을 기준으로, 5년 합계 1억원
        한도(§71②) 내에서 감면합니다. 한도 초과분 농지가액은 일반 증여재산과 합산과세됩니다.
      </p>

      <div className="space-y-1.5 text-sm">
        <div className="flex items-center justify-between px-3 py-2">
          <span>감면농지 평가액</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.farmlandValue)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span>합산 산출세액 ㉡</span>
          <span className="font-mono tabular-nums">{formatKRW(computedTax)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span>− 직전 회차 산출세액 ㉠</span>
          <span className="font-mono tabular-nums">{formatKRW(priorComputedTax)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 font-semibold bg-emerald-100/60 dark:bg-emerald-900/20 rounded-lg">
          <span>농지분 산출세액 ㉣</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.farmlandComputedTax)}</span>
        </div>

        <div className="flex items-center justify-between px-3 py-2">
          <span>5년 감면한도 잔여 (1억원 − 기감면)</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.reductionLimitRemaining)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2 font-semibold text-emerald-700 dark:text-emerald-300">
          <span>농지 감면세액 ㉤ = min(㉣, 잔여) · §71②</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.reductionAmount)}</span>
        </div>
        <div
          className={`flex items-center justify-between px-3 py-2 text-xs ${
            limitReached
              ? "rounded-md border border-amber-300 bg-amber-50/70 text-amber-800 dark:border-amber-700 dark:bg-amber-950/20 dark:text-amber-300"
              : "text-muted-foreground"
          }`}
        >
          <span>5년 누적 감면{limitReached ? " (1억원 한도 도달)" : ""}</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.cumulative5yrReduction)}</span>
        </div>
      </div>

      {/* 감면농지가액 안분 */}
      <div className="space-y-1.5 text-sm border-t border-emerald-200/70 pt-2 dark:border-emerald-800/70">
        <div className="flex items-center justify-between px-3 py-2 font-semibold">
          <span>감면받은 농지가액(감면범위) ㉮</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.reducedFarmlandValue)}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap px-3 text-xs text-emerald-700 dark:text-emerald-300">
          <span>= 농지가액 {formatKRW(detail.farmlandValue)}</span>
          <span className="text-emerald-400">×</span>
          <span>감면세액 {formatKRW(detail.reductionAmount)}</span>
          <span className="text-emerald-400">÷</span>
          <span>농지분 산출세액 {formatKRW(detail.farmlandComputedTax)}</span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span>감면한도 초과분 농지가액 ㉯ (일반 증여세 합산과세) · §133②</span>
          <span className="font-mono tabular-nums">{formatKRW(detail.excessFarmlandValue)}</span>
        </div>
      </div>

      {/* 차감세액(§69 전) */}
      <div className="flex items-center justify-between px-3 py-2 font-semibold bg-emerald-100/60 dark:bg-emerald-900/20 rounded-lg text-sm">
        <span>차감세액 (㉡ − §58 기납부 − 농지 감면세액)</span>
        <span className="font-mono tabular-nums">{formatKRW(reducedTax)}</span>
      </div>
      <p className="px-3 text-xs text-muted-foreground">
        신고세액공제(§69) 적용 후 최종 결정세액은 증여세 본표를 참조하세요.
      </p>
    </div>
  );
}
