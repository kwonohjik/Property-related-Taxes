"use client";

/**
 * 양도소득세 신고서 양식 표 — 렌더 컴포넌트
 *
 * 계산 헬퍼·타입은 FilingFormTableHelpers.ts 로 분리 (800줄 정책).
 */

import { cn } from "@/lib/utils";
import {
  type FilingFormTableProps,
  deriveColumns,
  buildRows,
  fmtCell,
} from "./FilingFormTableHelpers";

export type { FilingFormTableProps as FilingFormTableProps };

export function FilingFormTable({
  result,
  formData,
  asset,
  transferPriceOverride,
  aggregate,
  onPrint,
  acquisitionDateLabel,
  acquisitionDateOverride,
  title = "신고서 양식",
  subtitle = "양도소득세 신고서 항목별 자산-분할 계산 내역",
  adopted,
  redevSubject,
  redevSettlementDirection,
}: FilingFormTableProps) {
  const { columns, mode } = deriveColumns(result, aggregate, redevSubject, redevSettlementDirection);
  // 부담부증여 §159 산정 여부 — 신고서 표 헤더에 배지 표시
  const isBurdenedGift = Boolean(
    (result as unknown as { transferBurdenedGiftBreakdown?: unknown }).transferBurdenedGiftBreakdown,
  );
  const rows = buildRows(
    result,
    mode,
    formData,
    asset,
    transferPriceOverride,
    acquisitionDateLabel,
    acquisitionDateOverride,
    aggregate,
  );

  return (
    <div
      data-print-section="form-table"
      className={cn(
        "rounded-xl border-2 bg-white dark:bg-slate-900 overflow-hidden print:border print:border-black",
        adopted === true
          ? "border-emerald-400"
          : adopted === false
            ? "border-zinc-200 opacity-80"
            : "border-slate-300",
      )}
    >
      <div className="overflow-x-auto">
        {/* inline-block으로 헤더+테이블을 묶어 동일 폭으로 유지 */}
        <div className="inline-block min-w-full">
          <div className={cn(
            "px-4 py-3 border-b print:bg-white",
            adopted === true
              ? "bg-emerald-50 border-emerald-300"
              : adopted === false
                ? "bg-zinc-50 border-zinc-200"
                : "bg-slate-100 dark:bg-slate-800 border-slate-300",
          )}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className={cn(
                  "text-sm font-bold",
                  adopted === true
                    ? "text-emerald-800"
                    : adopted === false
                      ? "text-zinc-600"
                      : "text-slate-800 dark:text-slate-100",
                )}>
                  {title}
                </h3>
                {adopted === true && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                    ✓ 신고 채택
                  </span>
                )}
                {adopted === false && (
                  <span className="inline-flex items-center rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-medium text-zinc-500">
                    참고
                  </span>
                )}
                {isBurdenedGift && (
                  <span
                    className="inline-flex items-center rounded-full bg-fuchsia-100 px-2 py-0.5 text-[11px] font-semibold text-fuchsia-700 border border-fuchsia-300"
                    title="양도가/취득가 모두 소득세법 시행령 §159①1·2호로 채무비율 × 자산별 기준시가 환산"
                  >
                    §159①1호 환산
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
            <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>
          </div>

          {/* 열 수에 따라 테이블 폭 자동 조정 */}
          <table className="text-xs border-collapse" style={{ width: "auto", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "160px" }} />
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
                  <td
                    className={cn(
                      "px-3 py-1.5 border-r border-slate-200 sticky left-0 bg-white dark:bg-slate-900 print:static",
                      row.indent && "pl-7 text-slate-500",
                      row.highlight && "bg-amber-50/60 dark:bg-amber-950/30",
                    )}
                  >
                    {row.label}
                  </td>
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
        </div>
      </div>
    </div>
  );
}
