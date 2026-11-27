"use client";

/**
 * 신고서 양식 표 — 열(`Column`)×행(`RowDef`) 격자 렌더러 (표 본체만).
 *
 * `FilingFormTable`(국내 양도세)에서 그대로 떼어 낸 것이다 — 국외자산 부동산 신고서 표(`ForeignFilingFormTable`)가 같은 격자를 쓴다.
 * 금액 칸은 `font-mono tabular-nums whitespace-nowrap text-right`(skill `amount-column-align`).
 * `wrapText`는 문자열 칸(소재지 등 긴 텍스트)만 줄바꿈을 허용한다 — 기본(국내)은 종전과 같이 모두 nowrap.
 */
import { cn } from "@/lib/utils";
import { fmtCell } from "./FilingFormTableRowDefs";
import type { Column, RowDef } from "./FilingFormTableTypes";

export function FilingFormGrid({
  columns,
  rows,
  itemColPx = 160,
  dataColPx = 130,
  wrapText = false,
}: {
  columns: Column[];
  rows: RowDef[];
  itemColPx?: number;
  dataColPx?: number;
  wrapText?: boolean;
}) {
  return (
    <table className="text-xs border-collapse" style={{ width: "auto", tableLayout: "fixed" }}>
      <colgroup>
        <col style={{ width: `${itemColPx}px` }} />
        {columns.map((c) => (
          <col key={c.key} style={{ width: `${dataColPx}px` }} />
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
                row.indent && "pl-7 text-slate-600 dark:text-slate-400",
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
                    "px-3 py-1.5 text-right border-r border-slate-200 font-mono tabular-nums whitespace-nowrap",
                    wrapText && typeof row.values[c.key] === "string" && "whitespace-normal break-words",
                    c.key === "total" && "bg-slate-50/60 dark:bg-slate-800/40",
                    (note || roseNote) && "align-top",
                  )}
                >
                  {fmtCell(row.values[c.key])}
                  {roseNote && (
                    <div data-testid="filing-rose-note" className="text-micro font-sans font-normal text-rose-700 leading-tight mt-0.5 whitespace-normal text-right dark:text-rose-400">
                      {roseNote}
                    </div>
                  )}
                  {note && (
                    <div className="text-micro font-sans font-normal text-slate-600 dark:text-slate-400 leading-tight mt-0.5 whitespace-normal text-right">
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
  );
}
