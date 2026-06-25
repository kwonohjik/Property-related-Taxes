"use client";

/**
 * GiftTaxResultViewHelpers — GiftTaxResultView 분리 헬퍼 컴포넌트 (800줄 정책)
 *
 * Row, LawBadge, InstallmentGuide — GiftTaxResultView.tsx에서 추출.
 */

import { calcInstallmentPayment } from "@/lib/tax-engine/credits/installment-payment";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export function Row({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span className={`font-mono text-sm ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}>
        {value}
      </span>
    </div>
  );
}

export function LawBadge({ law }: { law: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 mr-1 mb-1">
      {law}
    </span>
  );
}

export function InstallmentGuide({ finalTax }: { finalTax: number }) {
  const result = calcInstallmentPayment({ finalTax, isFamilyBusiness: false });
  if (!result.eligible) return null;

  return (
    <div className="border border-amber-200 dark:border-amber-700 rounded-xl overflow-hidden">
      <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
        <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
          연부연납 안내 (상증법 §71)
        </h4>
        <div className="flex flex-wrap gap-1 mt-1">
          <LawArticleModal legalBasis="상증법 §71" label="§71 연부연납" />
          <LawArticleModal legalBasis="상증법 §70" label="§70 분납" />
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          결정세액 2천만원 초과 시 최대 5년 분할납부 가능
        </p>
      </div>
      <div className="p-3 text-xs space-y-1.5 text-gray-600 dark:text-gray-300">
        <div className="flex justify-between">
          <span>허가 즉시 납부</span>
          <span className="font-medium">{formatKRW(result.initialPayment)}</span>
        </div>
        <div className="flex justify-between">
          <span>연간 납부 원금 ({result.appliedYears}회)</span>
          <span className="font-medium">{formatKRW(result.annualPrincipal)}</span>
        </div>
        <p className="text-amber-600 dark:text-amber-400 mt-1">
          ※ 이자 상당액(연 1.8% 기준) 별도 납부 — 세무사 확인 권장
        </p>
        <div className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 space-y-1">
          <p className="font-medium text-gray-700 dark:text-gray-200">납세담보 제공 (상증법 §71 ②)</p>
          <div className="flex justify-between">
            <span>현금·예금·보증보험</span>
            <span className="font-medium">세액의 110%</span>
          </div>
          <div className="flex justify-between">
            <span>기타 재산 (부동산·유가증권 등)</span>
            <span className="font-medium">세액의 120%</span>
          </div>
          <p className="text-amber-600 dark:text-amber-400">
            ※ 연부연납 허가 신청 시 납세담보를 함께 제공해야 함
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * 합산배제증여재산(§41의3·§41의5) 별도 스트림 카드 — §47① 개별 건별 과세 (A1.5).
 * 별지 서식은 일반 증여재산 기준이므로, 별도 과세표준(§55①3호) 합산배제분을 분리 표시.
 */
export function AggregationExcludedCard({
  detail,
}: {
  detail: {
    finalTax: number;
    breakdown: { label: string; amount: number; note?: string; lawRef?: string }[];
  };
}) {
  return (
    <div
      className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4"
      data-testid="aggregation-excluded-card"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-emerald-800">
          합산배제증여재산 (§41의3·§41의5) — 개별 건별 과세
        </span>
        <LawArticleModal legalBasis="상증법 §47" label="§47①" />
      </div>
      <p className="mt-1 text-xs text-emerald-700">
        §47① 10년 합산 제외 · §55①3호 별도 과세표준(증여이익 − 3천만원, §53 미적용)
      </p>
      <p
        className="mt-2 text-right font-mono text-2xl font-bold tabular-nums whitespace-nowrap text-emerald-900"
        data-testid="aggregation-excluded-final-tax"
      >
        {formatKRW(detail.finalTax)}
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {detail.breakdown.map((step, i) => (
            <tr key={i} className="border-t border-emerald-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                {step.label}
                {step.note ? (
                  <span className="ml-1 text-xs text-emerald-600">({step.note})</span>
                ) : null}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(step.amount)}
              </td>
              <td className="py-1.5 pl-2">
                {step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
