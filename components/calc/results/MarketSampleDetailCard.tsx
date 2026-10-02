"use client";

/**
 * MarketSampleDetailCard — R-1' 매매사례가액 결과 카드
 *
 * 취득 사례 + ±3개월 검증 결과 표시. (양도 매매사례가액은 없다 — 양도가액은 소득세법 §96① 실지거래가액)
 */

import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";

interface Props {
  detail: NonNullable<StockTransferResult["marketSampleDetail"]>;
  shareCount: number;
}

function fmt(n?: number) {
  return n !== undefined ? n.toLocaleString() : "—";
}

export function MarketSampleDetailCard({ detail, shareCount }: Props) {
  if (!detail.acquisitionApplied) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-3">
      <p className="font-semibold text-amber-800 text-sm">매매사례가액 상세 (영§176의2③1호)</p>

      <div className="rounded-lg border border-amber-100 bg-white dark:bg-gray-900 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-amber-50 text-amber-700">
            <tr>
              <th className="text-left px-3 py-2 font-semibold">구분</th>
              <th className="text-right px-3 py-2 font-semibold">1주당 사례가</th>
              <th className="text-right px-3 py-2 font-semibold">총액</th>
              <th className="text-center px-3 py-2 font-semibold">기준일 ±일수</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-50 text-slate-700">
            {detail.acquisitionApplied && (
              <tr>
                <td className="px-3 py-2">취득 매매사례</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(detail.acquisitionPerShare)}원</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {detail.acquisitionPerShare !== undefined
                    ? fmt(detail.acquisitionPerShare * shareCount)
                    : "—"}
                  원
                </td>
                <td className={`px-3 py-2 text-center ${detail.acquisitionOverThreeMonths ? "text-amber-700 font-semibold" : ""}`}>
                  {detail.acquisitionDeltaDays !== undefined ? `${detail.acquisitionDeltaDays}일` : "—"}
                  {detail.acquisitionOverThreeMonths && " ⚠"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detail.warnings.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-100/60 px-3 py-2 text-xs text-amber-800 space-y-1">
          {detail.warnings.map((w, i) => (
            <p key={i}>· {w}</p>
          ))}
        </div>
      )}

      <p className="text-xs text-amber-700/80">
        매매사례가액으로 취득가액을 산정하면 필요경비는 취득가액 + 취득 당시 기준시가 × 1%(개산공제) — 법 §97②2호 본문·영 §163⑥4.
        실제 경비로 바꾸는 §97②2호 단서(swap)는 환산취득가액에만 적용되어 비대상입니다.
      </p>
    </div>
  );
}
