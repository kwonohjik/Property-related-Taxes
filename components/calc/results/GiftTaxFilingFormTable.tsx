"use client";

/**
 * GiftTaxFilingFormTable — 증여세 신고서 양식 표 (Phase B UI)
 *
 * PDF 사례 1 (12행) / 사례 2 (18행) 동적 분기 렌더.
 * 단독 신고 (priorGifts=0) 시 산식 무의미 행은 "—" 표기 (옵션 A).
 *
 * 출처: docs/02-design/features/gift-tax-pdf-cases-1-2.engine.design.md §5.2
 */

import { useState } from "react";
import type {
  GiftTaxResult,
  FilingFormRow,
} from "@/lib/tax-engine/types/inheritance-gift.types";

interface Props {
  result: GiftTaxResult;
}

function formatAmount(n: number): string {
  return n.toLocaleString("ko-KR");
}

function RowItem({ row, isFinal }: { row: FilingFormRow; isFinal: boolean }) {
  return (
    <tr
      className={
        isFinal
          ? "bg-violet-100/70 dark:bg-violet-900/30 font-bold"
          : "border-b border-violet-100 dark:border-violet-800/40"
      }
    >
      <td className="py-2 px-2 text-center text-violet-700 dark:text-violet-300 font-semibold w-12">
        {row.number}
      </td>
      <td className="py-2 px-2 text-violet-900 dark:text-violet-100">
        {row.label}
        {row.formula && (
          <span className="ml-2 text-[11px] text-violet-500 dark:text-violet-400">
            {row.formula}
          </span>
        )}
      </td>
      <td className="py-2 px-2 text-right tabular-nums">
        {row.display === "dash" ? (
          <span className="text-gray-400">—</span>
        ) : row.display === "rate" ? (
          <span className="text-violet-700 dark:text-violet-300">
            {row.formula}
          </span>
        ) : (
          <span className="text-violet-900 dark:text-violet-100">
            {formatAmount(row.amount)}
          </span>
        )}
      </td>
      <td className="py-2 px-2 text-left text-[11px] text-violet-500 dark:text-violet-400 w-32">
        {row.lawRef}
      </td>
    </tr>
  );
}

export function GiftTaxFilingFormTable({ result }: Props) {
  const [showLaw, setShowLaw] = useState(false);
  const rows = result.filingFormRows;
  const useEighteen = result.generationSkipSurchargeDetail !== null;
  const finalRowNumber = useEighteen ? "⑱" : "⑫";

  if (rows.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50/30 dark:bg-violet-900/10 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-violet-800 dark:text-violet-200">
            증여세 신고서 양식 ({rows.length}행)
          </h3>
          <p className="text-xs text-violet-600 dark:text-violet-400 mt-0.5">
            {useEighteen
              ? "세대생략 할증 §57 + §58 안분 한도 (사례 2형 18행)"
              : "직계존속 동일인 합산 §47 + §58 안분 한도 (사례 1형 12행)"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowLaw(!showLaw)}
          className="text-xs text-violet-600 hover:text-violet-800 px-2 py-1 rounded hover:bg-violet-100"
        >
          {showLaw ? "조문 숨김" : "조문 표시"}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b-2 border-violet-300 dark:border-violet-600">
            <tr className="text-xs text-violet-700 dark:text-violet-300">
              <th className="py-2 px-2 text-center font-semibold w-12">번호</th>
              <th className="py-2 px-2 text-left font-semibold">항목 · 산식</th>
              <th className="py-2 px-2 text-right font-semibold">금액</th>
              {showLaw && (
                <th className="py-2 px-2 text-left font-semibold w-32">근거</th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RowItem
                key={row.number}
                row={showLaw ? row : { ...row, lawRef: undefined }}
                isFinal={row.number === finalRowNumber}
              />
            ))}
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <div className="rounded-md bg-rose-50/70 border border-rose-200 p-3">
          <p className="text-xs font-semibold text-rose-700 mb-1">
            안내 사항
          </p>
          <ul className="text-xs text-rose-600 space-y-1 list-disc list-inside">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
