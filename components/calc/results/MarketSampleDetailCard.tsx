"use client";

/**
 * MarketSampleDetailCard — R-1' 매매사례가액 결과 카드
 *
 * 디자인 §8.1 표시 명세에 따라 양도·취득 사례 + ±3개월 검증 결과 표시.
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
  if (!detail.acquisitionApplied && !detail.transferApplied) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-5 py-4 space-y-3">
      <p className="font-semibold text-amber-800 text-sm">매매사례가액 상세 (영§176의2③1호)</p>

      <div className="rounded-lg border border-amber-100 bg-white overflow-hidden">
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
                <td className="px-3 py-2 text-right font-mono">{fmt(detail.acquisitionPerShare)}원</td>
                <td className="px-3 py-2 text-right font-mono">
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
            {detail.transferApplied && (
              <tr>
                <td className="px-3 py-2">양도 매매사례</td>
                <td className="px-3 py-2 text-right font-mono">{fmt(detail.transferPerShare)}원</td>
                <td className="px-3 py-2 text-right font-mono">
                  {detail.transferPerShare !== undefined
                    ? fmt(detail.transferPerShare * shareCount)
                    : "—"}
                  원
                </td>
                <td className={`px-3 py-2 text-center ${detail.transferOverThreeMonths ? "text-amber-700 font-semibold" : ""}`}>
                  {detail.transferDeltaDays !== undefined ? `${detail.transferDeltaDays}일` : "—"}
                  {detail.transferOverThreeMonths && " ⚠"}
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
        매매사례가액 = 실지거래가액 의제 (법§97②1호) — §163⑥ 개산공제 미적용, §97②2호 swap 비대상.
      </p>
    </div>
  );
}
