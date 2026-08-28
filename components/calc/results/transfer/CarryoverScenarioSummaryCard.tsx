"use client";

/**
 * 이월과세 비교과세(소득세법 §97조의2 ② 3호)의 **미채택 시나리오 요약 카드 껍데기**.
 *
 * A·B 두 시나리오가 같은 모양의 2열 표로 그려져야 하는데 종전에는 B 전용 컴포넌트만 있었다.
 * 그래서 **B가 채택되면 [A] 자리에 완전한 `FilingFormTable`이 `result`(= B로 계산된 값)를
 * 받아** A의 취득일·보유기간 머리에 B의 금액을 담은 표가 나왔다 (결과탭 코드리뷰 #023).
 * 여기서 껍데기를 공유하고 행 조립만 시나리오별로 갈라, 어느 쪽이 채택돼도 대칭이 되게 한다.
 */

import { cn } from "@/lib/utils";

export type SummaryRow = { label: string; value: string; highlight?: boolean; indent?: boolean };

interface Props {
  title: string;
  subtitle: string;
  footnote: string;
  rows: SummaryRow[];
  adopted: boolean;
  onPrint?: () => void;
}

export function CarryoverScenarioSummaryCard({
  title,
  subtitle,
  footnote,
  rows,
  adopted,
  onPrint,
}: Props) {
  return (
    <div
      data-print-section="form-table"
      className={cn(
        "rounded-xl border-2 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black",
        adopted ? "border-emerald-400" : "border-zinc-200 opacity-80",
      )}
    >
      {/* 헤더 */}
      <div className={cn(
        "px-4 py-3 border-b print:bg-white",
        adopted ? "bg-emerald-50 border-emerald-300" : "bg-zinc-50 border-zinc-200",
      )}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={cn(
              "text-sm font-bold",
              adopted ? "text-emerald-800" : "text-zinc-600",
            )}>
              {title}
            </h3>
            {adopted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-caption font-bold text-emerald-700">
                ✓ 신고 채택
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-caption font-medium text-zinc-500">
                참고
              </span>
            )}
          </div>
          {onPrint && (
            <button
              type="button"
              onClick={onPrint}
              className="print:hidden shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-200 transition-colors text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              🧾 PDF
            </button>
          )}
        </div>
        <p className="text-caption text-slate-500 mt-0.5">{subtitle}</p>
      </div>

      {/* 요약 테이블 */}
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col style={{ width: "60%" }} />
          <col style={{ width: "40%" }} />
        </colgroup>
        <thead className="bg-slate-50 dark:bg-slate-800/50">
          <tr>
            <th className="text-left px-3 py-2 border-b border-r border-slate-200 font-semibold">항목</th>
            <th className="text-right px-3 py-2 border-b border-slate-200 font-semibold bg-slate-100 dark:bg-slate-800">금액</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className={cn(
                "border-b border-slate-100",
                row.highlight && "bg-amber-50/60 dark:bg-amber-950/30 font-semibold",
              )}
            >
              <td className={cn(
                "px-3 py-1.5 border-r border-slate-200",
                row.indent && "pl-7 text-slate-500",
                row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
              )}>
                {row.label}
              </td>
              <td className={cn(
                "px-3 py-1.5 text-right font-mono whitespace-nowrap bg-slate-50/60 dark:bg-slate-800/40",
                row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
              )}>
                {row.value || "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2 text-micro text-muted-foreground border-t border-slate-100">
        {footnote}
      </p>
    </div>
  );
}

export function fmtScenarioDate(d?: string): string {
  if (!d || d === "") return "-";
  return d;
}
