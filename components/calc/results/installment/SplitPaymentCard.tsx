"use client";

/**
 * 분납 결과 카드 (상속세·증여세 공용, 상증법 §70② · 시행령 §66②)
 *
 * 결정세액에 영향을 주지 않는 투영 — finalTax + 폼 입력(신청 여부·희망액)을 받아
 * 순수 엔진 calcInstallmentSplit 호출(단일 진실, dual-truth 회피).
 * 연부연납(§71)과 배타이며, 상속에서는 applyLongTermInstallment(연부연납 ON) 시 비표시.
 *
 * 설계: docs/02-design/features/inheritance-gift-installment-split.ui.design.md
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  calcInstallmentSplit,
  isInstallmentSplitEligible,
} from "@/lib/tax-engine/credits/installment-split";

export interface SplitPaymentCardProps {
  /** 납부할 세액 (= 결정세액, payableTax) */
  finalTax: number;
  /** 신고기한 YYYY-MM-DD */
  filingDeadline?: string;
  /** 분납기한 YYYY-MM-DD (신고기한 + 2개월) */
  installmentDueDate?: string;
  /** 분납 신청 여부 */
  splitPaymentEnabled: boolean;
  /** 분납 희망액 (원, 미입력 undefined → 최대 분납액) */
  splitPaymentAmount?: number;
  /** 연부연납(§71) 신청 여부 — true면 분납 비표시 (상속 전용, 증여는 생략) */
  applyLongTermInstallment?: boolean;
}

const cardWrap =
  "border border-sky-200 dark:border-sky-700 rounded-xl overflow-hidden";
const amountCell = "text-right font-mono tabular-nums whitespace-nowrap";

export function SplitPaymentCard({
  finalTax,
  filingDeadline,
  installmentDueDate,
  splitPaymentEnabled,
  splitPaymentAmount,
  applyLongTermInstallment,
}: SplitPaymentCardProps) {
  // 부적격(1천만원 이하) 또는 연부연납 신청 시 비표시
  if (!isInstallmentSplitEligible(finalTax) || applyLongTermInstallment) {
    return null;
  }

  const split = calcInstallmentSplit({
    payableTax: finalTax,
    applyInstallmentSplit: splitPaymentEnabled,
    requestedSplitAmount: splitPaymentAmount,
    applyLongTermInstallment,
  });

  // ── 미신청: 적격 안내 요약 ──────────────────────────────────────
  if (!split.applied) {
    return (
      <div className={cardWrap} data-testid="split-payment-card">
        <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
          <h4 className="text-sm font-medium text-sky-800 dark:text-sky-200">
            분납 안내 (상증법 §70②)
          </h4>
          <p className="mt-0.5 text-xs text-sky-600 dark:text-sky-400">
            결정세액 1천만원 초과 — 분납 신청 가능
          </p>
        </div>
        <div className="p-3 space-y-2 text-xs text-gray-600 dark:text-gray-300">
          <div className="flex items-center justify-between">
            <span>최대 분납 가능액</span>
            <span className={amountCell} data-testid="split-payment-max">
              {formatKRW(split.maxSplitAmount)}
            </span>
          </div>
          {installmentDueDate && (
            <div className="flex items-center justify-between">
              <span>분납기한</span>
              <span data-testid="split-payment-due-date">{installmentDueDate}</span>
            </div>
          )}
          <p className="pt-1">
            입력 단계에서 <b>분납 신청</b>을 켜면 1차·2차 납부 일정이 여기에
            표시됩니다.
          </p>
        </div>
      </div>
    );
  }

  // ── 신청: 분납 일정 ───────────────────────────────────────────
  return (
    <div className={cardWrap} data-testid="split-payment-card">
      <div className="bg-sky-50 dark:bg-sky-900/20 px-4 py-3">
        <h4 className="text-sm font-medium text-sky-800 dark:text-sky-200">
          분납 일정 (상증법 §70②)
        </h4>
        <p className="mt-0.5 text-xs text-sky-600 dark:text-sky-400">
          신고기한 내 납부 + 2개월 이내 분납
        </p>
      </div>
      <div className="p-3 space-y-2 text-sm">
        <div className="flex items-center justify-between text-gray-700 dark:text-gray-200">
          <span>납부할 세액 (결정세액)</span>
          <span className={amountCell}>{formatKRW(finalTax)}</span>
        </div>

        <div className="border-t border-sky-100 dark:border-sky-800 pt-2">
          <div className="flex items-center justify-between font-medium">
            <span>1차 납부 (신고기한 이내)</span>
            <span className={amountCell} data-testid="split-payment-first">
              {formatKRW(split.firstPayment)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>= 납부할 세액 − 분납액</span>
            {filingDeadline && <span>기한 {filingDeadline}</span>}
          </div>
        </div>

        <div className="border-t border-sky-100 dark:border-sky-800 pt-2">
          <div className="flex items-center justify-between font-medium">
            <span>2차 분납 (분납기한 이내)</span>
            <span className={amountCell} data-testid="split-payment-second">
              {formatKRW(split.secondPayment)}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>= 분납 신청액 (최대 50%)</span>
            {installmentDueDate && (
              <span data-testid="split-payment-due-date">
                기한 {installmentDueDate}
              </span>
            )}
          </div>
        </div>

        {split.warnings.length > 0 && (
          <div className="border-t border-sky-100 dark:border-sky-800 pt-2 space-y-1">
            {split.warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-700 dark:text-amber-300">
                {w}
              </p>
            ))}
          </div>
        )}

        <p className="border-t border-sky-100 dark:border-sky-800 pt-2 text-[11px] text-gray-500 dark:text-gray-400">
          ※ 분납 시 납세담보 제공이 필요하지 않습니다. 분납 금액은 §70② 한도
          이내에서 납세자가 선택합니다.
        </p>
      </div>
    </div>
  );
}
