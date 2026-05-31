"use client";

/**
 * AggregationSummary — 사전증여 합산 요약 카드.
 *
 * PriorGiftInput.tsx 800줄 분할 (PR Z, 2026-05-22).
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { applyCorporateGiftTaxFallback } from "@/lib/calc/prior-gift-auto-tax";
import type { PriorGift } from "@/lib/tax-engine/types/inheritance-gift.types";

export function AggregationSummary({
  gifts,
  mode,
}: {
  gifts: PriorGift[];
  mode: "inheritance" | "gift";
}) {
  if (gifts.length === 0) return null;

  const total = gifts.reduce((s, g) => s + g.giftAmount, 0);
  const totalTaxPaid = gifts.reduce((s, g) => s + g.giftTaxPaid, 0);

  if (total === 0) return null;

  const heirTotal =
    mode === "inheritance"
      ? gifts.filter((g) => g.isHeir).reduce((s, g) => s + g.giftAmount, 0)
      : null;
  const nonHeirTotal =
    mode === "inheritance"
      ? gifts.filter((g) => !g.isHeir).reduce((s, g) => s + g.giftAmount, 0)
      : null;

  // 영리법인 분해 (정정 E16·D6·D13 — indigo tone 유지, ↳ prefix로 분해 표시)
  // ⑩a 산출세액은 fallback 적용본으로 합산 — cgct=0 store 잔재가 합계 0·행 숨김을 유발하는 dual-truth 방지.
  // (표시 GiftRowEditor·API buildInput과 동일 single-source applyCorporateGiftTaxFallback)
  const corporateGifts = applyCorporateGiftTaxFallback(gifts).filter(
    (g) => g.beneficiaryType === "corporate",
  );
  const corporateTotal = corporateGifts.reduce((s, g) => s + g.giftAmount, 0);
  const corporateComputedTaxTotal = corporateGifts.reduce(
    (s, g) => s + (g.corporateGiftComputedTax ?? 0),
    0,
  );

  return (
    <div className="rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
        사전증여 합산 요약
      </p>
      {mode === "inheritance" && heirTotal !== null && nonHeirTotal !== null && (
        <>
          <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
            <span>상속인 증여 합계 (10년 합산)</span>
            <span>{formatKRW(heirTotal)}</span>
          </div>
          <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
            <span>비상속인 증여 합계 (5년 합산)</span>
            <span>{formatKRW(nonHeirTotal)}</span>
          </div>
          {corporateTotal > 0 && (
            <>
              <div className="flex justify-between text-xs text-indigo-700 dark:text-indigo-300 border-t border-indigo-200/50 pt-1">
                <span>↳ 🏢 영리법인 증여 (5년, §13①2호)</span>
                <span>{formatKRW(corporateTotal)}</span>
              </div>
              {corporateComputedTaxTotal > 0 && (
                <div className="flex justify-between text-xs text-indigo-700 dark:text-indigo-300">
                  <span>↳ 영리법인 증여세 산출세액 합계 (§3의2②)</span>
                  <span>{formatKRW(corporateComputedTaxTotal)}</span>
                </div>
              )}
            </>
          )}
        </>
      )}
      <div className="flex justify-between text-xs font-bold text-indigo-800 dark:text-indigo-200 border-t border-indigo-200 dark:border-indigo-700 pt-2">
        <span>증여가액 총합</span>
        <span>{formatKRW(total)}</span>
      </div>
      {totalTaxPaid > 0 && (
        <div className="flex justify-between text-xs text-indigo-600 dark:text-indigo-400">
          <span>기납부 증여세 합계 (§28 공제 대상)</span>
          <span>{formatKRW(totalTaxPaid)}</span>
        </div>
      )}
    </div>
  );
}
