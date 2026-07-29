"use client";

/**
 * CapitalAdjustmentsTimelineCard — R-2 자본조정 시계열 결과 카드
 *
 * 디자인 §8.2 표시 명세에 따라 시계열 표 + 환산 단가 요약.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { Frac } from "@/components/calc/results/shared/FormulaParts";

interface Props {
  detail: NonNullable<StockTransferResult["capitalAdjustmentsDetail"]>;
}

const TYPE_LABEL: Record<string, string> = {
  bonus_capital_reserve: "무상증자 — 자본준비금",
  bonus_retained_earnings: "무상증자 — 이익잉여금",
  reduction_proportional: "무상감자 — 비례감자·결손보전",
  reduction_capital_return: "무상감자 — 자본환급",
};

function fmt(n: number) {
  return n.toLocaleString();
}
function fmtDate(d: Date) {
  return new Date(d).toISOString().slice(0, 10);
}

export function CapitalAdjustmentsTimelineCard({ detail }: Props) {
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-5 py-4 space-y-3">
      <p className="font-semibold text-violet-800 text-sm">
        자본조정 시계열 (법§17② 단서 + 집행기준 97-163-12)
      </p>

      <div className="rounded-lg border border-violet-100 bg-white overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-violet-50 text-violet-700">
            <tr>
              <th className="text-left px-2 py-2 font-semibold">#</th>
              <th className="text-left px-2 py-2 font-semibold">발생일</th>
              <th className="text-left px-2 py-2 font-semibold">유형</th>
              <th className="text-right px-2 py-2 font-semibold">비율</th>
              <th className="text-right px-2 py-2 font-semibold">변동 전 → 후 (주식수)</th>
              <th className="text-center px-2 py-2 font-semibold">처리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-50 text-slate-700">
            {detail.applied.map((a, i) => (
              <tr key={i} className={a.skipped ? "bg-slate-50/50" : ""}>
                <td className="px-2 py-2">{i + 1}</td>
                <td className="px-2 py-2 font-mono">{fmtDate(a.eventDate)}</td>
                <td className="px-2 py-2">{TYPE_LABEL[a.type] || a.type}</td>
                <td className="px-2 py-2 text-right font-mono">{a.ratio}</td>
                <td className="px-2 py-2 text-right font-mono">
                  {fmt(a.beforeShares)} → {fmt(a.afterShares)}
                </td>
                <td className="px-2 py-2 text-center">
                  {a.skipped ? (
                    <span className="text-slate-500">건너뜀 (배당소득)</span>
                  ) : (
                    <span className="text-violet-700 font-semibold">적용</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-violet-200 bg-white px-3 py-2 text-xs text-violet-800 space-y-1">
        <p>
          최종 환산 주식수 (취득가액 분모) ={" "}
          <strong className="font-mono">{fmt(detail.adjustedShareCount)}주</strong>
        </p>
        <p>
          환산 1주당 단가 ={" "}
          <strong className="font-mono">{fmt(detail.adjustedPerShareCost)}원</strong>{" "}
          (= <Frac top="총 취득원가" bottom="환산 주식수" />)
        </p>
        <p>
          총 취득원가 (불변) ={" "}
          <strong className="font-mono">{fmt(detail.baseTotalCost)}원</strong>
        </p>
      </div>

      {detail.warnings.length > 0 && (
        <div className="rounded border border-violet-200 bg-violet-100/60 px-3 py-2 text-xs text-violet-800 space-y-1">
          {detail.warnings.map((w, i) => (
            <p key={i}>· {w}</p>
          ))}
        </div>
      )}
    </div>
  );
}
