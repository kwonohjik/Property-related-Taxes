"use client";

/**
 * TaxCreditBreakdownCard — 세액공제 내역 카드 (#35)
 * 상속세·증여세 결과 화면에서 TaxCreditResult 표시
 */

import type { TaxCreditResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface CreditRowProps {
  label: string;
  amount: number;
  lawRef?: string;
  highlight?: boolean;
}

function CreditRow({ label, amount, lawRef, highlight }: CreditRowProps) {
  if (amount === 0) return null;
  return (
    <div
      className={`flex items-center justify-between py-2 px-3 rounded-md ${
        highlight
          ? "bg-emerald-50 dark:bg-emerald-900/20 font-semibold"
          : "bg-gray-50 dark:bg-gray-800"
      }`}
    >
      <div>
        <span className={`text-sm ${highlight ? "text-emerald-800 dark:text-emerald-200" : "text-gray-700 dark:text-gray-300"}`}>
          {label}
        </span>
        {lawRef && (
          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">{lawRef}</span>
        )}
      </div>
      <span className={`font-mono text-sm ${highlight ? "text-emerald-700 dark:text-emerald-300" : "text-blue-600 dark:text-blue-400"}`}>
        - {amount.toLocaleString()}원
      </span>
    </div>
  );
}

export interface TaxCreditBreakdownCardProps {
  credit: TaxCreditResult;
  /** 세액공제 전 세액 (공제 효과 계산용) */
  taxBeforeCredit: number;
}

export function TaxCreditBreakdownCard({
  credit,
  taxBeforeCredit,
}: TaxCreditBreakdownCardProps) {
  if (credit.totalCredit === 0) return null;

  const creditRate = taxBeforeCredit > 0
    ? ((credit.totalCredit / taxBeforeCredit) * 100).toFixed(1)
    : "0";

  return (
    <div className="border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-blue-800 dark:text-blue-200">
          세액공제 내역
        </h4>
        <div className="text-right">
          <p className="text-base font-bold text-blue-700 dark:text-blue-300">
            - {formatKRW(credit.totalCredit)}
          </p>
          <p className="text-xs text-blue-500 dark:text-blue-400">
            세액 대비 {creditRate}% 절감
          </p>
        </div>
      </div>

      {/* 공제 항목 */}
      <div className="p-3 space-y-2">
        <CreditRow
          label="증여세액공제"
          amount={credit.giftTaxCredit}
          lawRef="§28"
        />
        <CreditRow
          label="외국납부세액공제"
          amount={credit.foreignTaxCredit}
          lawRef="§29 / §59"
        />
        <CreditRow
          label="단기재상속공제"
          amount={credit.shortTermReinheritCredit}
          lawRef="§30"
        />
        <CreditRow
          label="신고세액공제 (3%)"
          amount={credit.filingCredit}
          lawRef="§69"
        />
        <CreditRow
          label="조특법 과세특례 (창업·가업)"
          amount={credit.specialTreatmentCredit}
          lawRef="조특 §30의5·§30의6"
        />
        <CreditRow
          label="세액공제 합계"
          amount={credit.totalCredit}
          highlight
        />
      </div>

      {/* 근거 조문 배지 */}
      {credit.appliedLaws.length > 0 && (
        <div className="px-3 pb-3 flex flex-wrap gap-1.5">
          {credit.appliedLaws.map((law) => (
            <span
              key={law}
              className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
            >
              {law}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
