"use client";

/**
 * 주식 양도소득세 신고서 양식 표 — 렌더 컴포넌트 (JSX만)
 *
 * 32행 고정 신고서 양식 (별지 제84호 서식 — 주식 적용)
 * 계산 헬퍼·타입은 StockFilingFormTableHelpers.ts 에 분리 (800줄 정책).
 *
 * 부동산 FilingFormTable.tsx 패턴 차용.
 */

import { cn } from "@/lib/utils";
import {
  type StockFilingFormTableProps,
  deriveColumns,
  buildRows,
  fmtCell,
} from "./StockFilingFormTableHelpers";

export type { StockFilingFormTableProps };

export function StockFilingFormTable({
  result,
  aggregate,
  onPrint,
  title = "주식 양도소득세 신고서",
  subtitle = "소득세법 §105·§110 기준 — 참고용 (실제 신고서식과 다를 수 있음)",
  stockName,
}: StockFilingFormTableProps) {
  const { columns } = deriveColumns(result, aggregate);
  const rows = buildRows(result, columns, aggregate);
  const isMulti = Boolean(aggregate && aggregate.items.length > 1);

  return (
    <div
      data-print-section="stock-form-table"
      className="rounded-xl border-2 border-slate-300 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black"
    >
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          {/* 헤더 */}
          <div className="px-4 py-3 border-b bg-slate-100 dark:bg-slate-800 border-slate-300 print:bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {title}
                </h3>
                {stockName && !isMulti && (
                  <span className="text-xs bg-sky-100 text-sky-700 px-2 py-0.5 rounded-full font-medium">
                    {stockName}
                  </span>
                )}
                {isMulti && (
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                    다자산 합산 ({aggregate!.items.length}종목)
                  </span>
                )}
                {result.isExempt && !isMulti && (
                  <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium border border-emerald-200">
                    비과세
                  </span>
                )}
              </div>
              {onPrint && (
                <button
                  type="button"
                  onClick={onPrint}
                  className="print:hidden shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-200 transition-colors text-slate-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  PDF
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          </div>

          {/* 표 */}
          <table
            className="text-xs border-collapse"
            style={{ width: "auto", tableLayout: "fixed" }}
          >
            <colgroup>
              {/* 항목 열 */}
              <col style={{ width: "220px" }} />
              {/* 데이터 열 */}
              {columns.map((c) => (
                <col key={c.key} style={{ width: "130px" }} />
              ))}
            </colgroup>

            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="text-left px-3 py-2 border-b border-r border-slate-200 font-semibold sticky left-0 bg-slate-50 dark:bg-slate-800/50 print:static">
                  항목
                </th>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={cn(
                      "text-right px-3 py-2 border-b border-r border-slate-200 font-semibold whitespace-nowrap",
                      c.key === "total" && "bg-slate-100 dark:bg-slate-800",
                    )}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={i}
                  className={cn(
                    "border-b border-slate-100",
                    row.highlight && "bg-amber-50/60 dark:bg-amber-950/30 font-semibold",
                    row.separatorAfter && "border-b-2 border-slate-300",
                  )}
                >
                  {/* 항목 열 (sticky) */}
                  <td
                    className={cn(
                      "px-3 py-1.5 border-r border-slate-200 sticky left-0 bg-white dark:bg-slate-900 print:static",
                      row.indent && "pl-7 text-slate-500",
                      row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
                    )}
                  >
                    {row.label}
                  </td>

                  {/* 데이터 열 */}
                  {columns.map((c) => {
                    const note = row.notes?.[c.key];
                    const roseNote = row.roseNotes?.[c.key];
                    return (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-1.5 text-right border-r border-slate-200 font-mono whitespace-nowrap",
                          c.key === "total" && "bg-slate-50/60 dark:bg-slate-800/40",
                          (note || roseNote) && "align-top",
                        )}
                      >
                        {fmtCell(row.values[c.key])}
                        {roseNote && (
                          <div className="text-[10px] font-sans font-normal text-rose-600 leading-tight mt-0.5 whitespace-normal text-right">
                            {roseNote}
                          </div>
                        )}
                        {note && (
                          <div className="text-[10px] font-sans font-normal text-slate-500 leading-tight mt-0.5 whitespace-normal text-right">
                            {note}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          {/* 주석 */}
          <div className="px-4 py-2 bg-slate-50/50 border-t border-slate-200 text-[11px] text-slate-400 space-y-0.5">
            <p>* 금액 단위: 원. 본세·가산세 10원 미만 절사 (국고금 관리법 §47①).</p>
            <p>* 지방소득세: 산출세액 × 10%, 10원 미만 절사 (지방세법 §103의3).</p>
            <p>* 본 표는 참고용입니다. 실제 신고는 양도소득세 과세표준 신고서 (별지 제84호 서식)를 사용하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
