/**
 * LotCapitalAdjustmentsCard — 분할/다건 모드 lot별 자본조정 희석 표 (A-2)
 *
 * result.lotCapitalAdjustmentsDetail 소비. 변동 lot(before ≠ after)만 표시.
 * 무상증자(자본준비금)·형식감자는 단가 환산이 매칭·차익에 반영. 의제배당 유형은 skip.
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

type Detail = NonNullable<StockTransferResult["lotCapitalAdjustmentsDetail"]>[number];

const TYPE_LABEL: Record<Detail["appliedTypes"][number], string> = {
  bonus_capital_reserve: "무상증자(자본준비금)",
  reduction_proportional: "형식감자",
  bonus_retained_earnings: "무상증자(이익잉여금·의제배당)",
  reduction_capital_return: "자본환급감자(의제배당)",
};

export function LotCapitalAdjustmentsCard({
  detail,
}: {
  detail: NonNullable<StockTransferResult["lotCapitalAdjustmentsDetail"]>;
}) {
  // 변동 lot만 (희석 발생)
  const changed = detail.filter((d) => d.beforeShares !== d.afterShares);
  if (changed.length === 0) return null;

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <h3 className="text-sm font-semibold text-violet-800">
        자본조정 lot별 환산 (분할·다건 모드)
      </h3>
      <p className="text-xs text-violet-600">
        발생일 이전 보유 lot만 희석 — 총취득원가 불변, 1주당 단가 환산이 양도차익에 반영(집행기준 97-163-12).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-violet-700 border-b border-violet-200">
              <th className="text-left py-1 pr-2">매수 lot</th>
              <th className="text-right py-1 px-2">조정 전</th>
              <th className="text-right py-1 px-2">조정 후</th>
              <th className="text-right py-1 px-2">환산 단가</th>
              <th className="text-left py-1 pl-2">적용</th>
            </tr>
          </thead>
          <tbody>
            {changed.map((d, i) => (
              <tr key={d.lotId ?? i} className="border-b border-violet-100 last:border-0">
                <td className="py-1 pr-2 text-violet-900">{d.lotId ?? `lot ${i + 1}`}</td>
                <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {d.beforeShares.toLocaleString()}
                </td>
                <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {d.afterShares.toLocaleString()}
                </td>
                <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">
                  {d.adjustedPerShareCost.toLocaleString()}
                </td>
                <td className="py-1 pl-2 text-xs text-violet-700">
                  {d.appliedTypes.map((t) => TYPE_LABEL[t]).join(", ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
