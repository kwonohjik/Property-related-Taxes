"use client";

/**
 * 이월과세 미적용(Scenario B) 신고서 핵심 항목 요약 카드 — 소득세법 §97조의2
 *
 * 완전한 TransferTaxResult 없이 CarryoverScenarioBDetail만으로 표시.
 * 채택 시 bg-emerald-50/border-emerald-400, 미채택 시 bg-zinc-50/opacity-80.
 */

import { cn } from "@/lib/utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { CarryoverScenarioBDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

interface Props {
  scenarioB: CarryoverScenarioBDetail;
  adopted: boolean;
  /** 양도가액 (원) — formData.contractTotalPrice 또는 result.transferPrice */
  transferPrice?: number;
  /** 양도일자 (YYYY-MM-DD) */
  transferDate?: string;
  /** 증여 등기접수일 (YYYY-MM-DD) — 보유기간 기산점 */
  giftRegistryDate?: string;
  /** 출력 버튼 핸들러 */
  onPrint?: () => void;
}

type SummaryRow = { label: string; value: string; highlight?: boolean; indent?: boolean };

function fmtDate(d?: string): string {
  if (!d || d === "") return "-";
  return d;
}

export function CarryoverScenarioBFilingCard({
  scenarioB,
  adopted,
  transferPrice,
  transferDate,
  giftRegistryDate,
  onPrint,
}: Props) {
  const rows: SummaryRow[] = [
    { label: "양도일자", value: fmtDate(transferDate) },
    { label: "취득일자 (증여 등기접수일)", value: fmtDate(giftRegistryDate) },
    { label: `보유기간 (수증자 기산)`, value: `${scenarioB.holdingPeriodYears}년` },
    ...(transferPrice && transferPrice > 0
      ? [{ label: "양도가액", value: formatKRW(transferPrice) }]
      : []),
    { label: "취득가액 (증여 당시 평가액)", value: formatKRW(scenarioB.acquisitionPrice) },
    { label: "양도차익", value: formatKRW(scenarioB.transferGain) },
    ...(scenarioB.longTermHoldingDeduction != null
      ? [{
          label: `장기보유특별공제 (${scenarioB.longTermHoldingRate != null ? `${(scenarioB.longTermHoldingRate * 100).toFixed(0)}%` : ""})`,
          value: scenarioB.longTermHoldingDeduction > 0
            ? formatKRW(scenarioB.longTermHoldingDeduction)
            : "해당없음",
          indent: true,
        }]
      : []),
    ...(scenarioB.taxBase != null
      ? [{ label: "과세표준", value: formatKRW(scenarioB.taxBase), highlight: true }]
      : []),
    ...(scenarioB.calculatedTax != null
      ? [{ label: "산출세액", value: formatKRW(scenarioB.calculatedTax) }]
      : []),
    { label: "결정세액", value: formatKRW(scenarioB.determinedTax), highlight: true },
  ];

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
              [B] 이월과세 미적용 (비교용)
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
        <p className="text-caption text-slate-500 mt-0.5">
          수증자 기산 보유기간 · 취득가액 = 증여 당시 평가액
        </p>
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
        ※ Scenario B는 이월과세 미적용 시 결과. 비교과세(§97조의2 ② 3호) 판정용.
      </p>
    </div>
  );
}
