"use client";

/**
 * BesshiRow / BesshiColumn — 신고서 양식(별지 제9·10호서식) 계산 표 공용 행 렌더러.
 *
 * 증여세 별지10호(`GiftTaxFilingFormTable`)에서 추출 → 상속세 별지9호
 * (`FilingForm9CoverSection`)와 공유(dual-truth 차단, [[ui_engine_dual_truth_avoidance]]).
 * 렌더 동작은 추출 전과 동일 — 호출처는 import 1줄만 변경.
 *
 * Design: docs/02-design/features/inheritance-filing-form-9-replica.ui.design.md §7
 */

import type { FilingFormRow } from "@/lib/tax-engine/types/inheritance-gift.types";

function formatAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function BesshiRow({
  row,
  showLaw,
  testIdPrefix,
}: {
  row: FilingFormRow;
  showLaw: boolean;
  /** 설정 시 금액 행 <tr>에 `${testIdPrefix}${row.number}` data-testid 부여 (별지9호 칸 동결) */
  testIdPrefix?: string;
}) {
  if (row.display === "header") {
    return (
      <tr className="bg-gray-100 dark:bg-gray-800 border-t border-b border-gray-400 dark:border-gray-600">
        <td
          colSpan={showLaw ? 4 : 3}
          className="py-1.5 px-2 text-center font-bold text-sm text-gray-800 dark:text-gray-100"
        >
          {row.label}
        </td>
      </tr>
    );
  }
  return (
    <tr
      className="border-b border-gray-200 dark:border-gray-700"
      data-testid={testIdPrefix && row.number ? `${testIdPrefix}${row.number}` : undefined}
    >
      <td className="py-1.5 px-2 text-center w-10 font-semibold tabular-nums text-violet-700 dark:text-violet-300">
        {row.number}
      </td>
      <td className="py-1.5 px-2 text-sm text-gray-900 dark:text-gray-100">
        <span>{row.label}</span>
        {row.formula && row.display !== "rate" && (
          <span className="ml-1 text-[10px] text-gray-500 dark:text-gray-400">
            ({row.formula})
          </span>
        )}
      </td>
      {/* 금액 칸: 고정폭(font-mono) + tabular-nums + 우측정렬 → 천·백만·십억 콤마 세로 정렬 */}
      <td className="py-1.5 px-2 text-right font-mono tabular-nums whitespace-nowrap">
        {row.display === "rate" ? (
          <span className="font-bold text-violet-700 dark:text-violet-300">
            {row.formula}
          </span>
        ) : row.display === "dash" ? (
          <span className="text-gray-400">—</span>
        ) : (
          <span className="text-gray-900 dark:text-gray-100">
            {formatAmount(row.amount)}
          </span>
        )}
      </td>
      {showLaw && (
        <td className="py-1.5 px-2 text-[10px] text-gray-500 dark:text-gray-400 w-24">
          {row.lawRef ?? ""}
        </td>
      )}
    </tr>
  );
}

export function BesshiColumn({
  rows,
  showLaw,
  testIdPrefix,
}: {
  rows: FilingFormRow[];
  showLaw: boolean;
  testIdPrefix?: string;
}) {
  return (
    <table className="w-full text-sm border-r border-gray-300 dark:border-gray-700 last:border-r-0">
      <thead className="border-b-2 border-gray-400 dark:border-gray-600">
        <tr className="text-xs text-gray-600 dark:text-gray-400">
          <th className="py-1.5 px-2 text-center font-semibold w-10">번호</th>
          <th className="py-1.5 px-2 text-left font-semibold">구분</th>
          <th className="py-1.5 px-2 text-right font-semibold">금액</th>
          {showLaw && (
            <th className="py-1.5 px-2 text-left font-semibold w-24">근거</th>
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <BesshiRow
            key={`${row.number}-${row.label}-${i}`}
            row={row}
            showLaw={showLaw}
            testIdPrefix={testIdPrefix}
          />
        ))}
      </tbody>
    </table>
  );
}
