"use client";

/** §45의3 일감몰아주기 결과 섹션 — 과세요건·수증자별 표·보유비율 raw (DeemedGiftResultView 800줄 분리). */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";

export function RelatedCorpResultSection({ result }: { result: DeemedGiftResult }) {
  const breakdown = result.recipientBreakdown;
  if (!breakdown) return null;

  const tradeRatio = result.tradeRatio ?? { numer: 0, denom: 1 };
  const normalTradeRatio = result.normalTradeRatio ?? { numer: 0, denom: 1 };

  return (
    <div className="space-y-4">
      {/* 과세요건 공통부 카드 */}
      <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-4">
        <p className="text-sm font-semibold text-sky-800">수혜법인 단위 과세요건</p>
        <table className="mt-2 w-full text-sm">
          <tbody>
            <tr>
              <td className="text-muted-foreground">지배주주</td>
              <td className="text-right">{result.rulingShareholder ?? "—"}</td>
            </tr>
            {result.relatedSales != null && (
              <tr>
                <td className="text-muted-foreground">특수관계매출</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.relatedSales)}
                </td>
              </tr>
            )}
            <tr>
              <td className="text-muted-foreground">
                거래비율 ({(result.tradeRatioNumer ?? 0).toLocaleString()} ÷{" "}
                {(result.tradeRatioDenom ?? 0).toLocaleString()})
              </td>
              <td className="text-right">
                {tradeRatio.denom > 0 ? ((tradeRatio.numer / tradeRatio.denom) * 100).toFixed(2) : "0.00"}%
              </td>
            </tr>
            <tr>
              <td className="text-muted-foreground">정상거래비율</td>
              <td className="text-right">
                {normalTradeRatio.denom > 0
                  ? ((normalTradeRatio.numer / normalTradeRatio.denom) * 100).toFixed(0)
                  : "0"}
                %
              </td>
            </tr>
            <tr>
              <td className="text-muted-foreground">과세요건</td>
              <td className="text-right">{result.taxRequirementMet ? "충족" : "미충족"}</td>
            </tr>
            {result.taxableExcludedSales != null && (
              <tr>
                <td className="text-muted-foreground">공통 과세제외매출</td>
                <td className="text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(result.taxableExcludedSales)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 수증자별 직접/간접 표 */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="rc-recipient-breakdown">
        <p className="text-sm font-semibold text-emerald-800">수증자별 증여의제이익 내역</p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="text-left">수증자</th>
                <th className="text-right">세후영업이익</th>
                <th className="text-right">거래비율차감후</th>
                <th className="text-right">보유비율차감후</th>
                <th className="text-right">직접이익</th>
                <th className="text-right">간접이익</th>
                <th className="text-right">소계</th>
              </tr>
            </thead>
            <tbody>
              {breakdown.map((r, i) => (
                <tr key={i} className="border-t border-emerald-100" data-testid={`rc-recipient-row-${i}`}>
                  <td className="py-1.5 pr-2 text-emerald-700">{r.recipientName.trim() || "지배주주등"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.pretaxProfit)}</td>
                  <td className="py-1.5 text-right">{r.tradeRatioOver.numer}/{r.tradeRatioOver.denom}</td>
                  <td className="py-1.5 text-right">{r.directOwnershipOver.numer}/{r.directOwnershipOver.denom}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.directGain)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap font-semibold">{formatKRW(r.subtotal)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-emerald-200 font-semibold">
                <td colSpan={6} className="py-1.5 pr-2">합계</td>
                <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(result.deemedGiftValue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 보유비율 raw — 직접·간접 대칭 echo (RC-INDIRECT-ECHO) */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
        <p className="text-xs font-semibold text-amber-800">보유비율 산출 내역 (직접·간접 raw)</p>
        <table className="mt-1 w-full text-xs">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="text-left">수증자</th>
              <th className="text-right">직접보유 raw</th>
              <th className="text-right">간접보유 raw</th>
              <th className="text-right">직접이익</th>
              <th className="text-right">간접이익</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.map((r, i) => (
              <tr key={i} className="border-t border-amber-100">
                <td className="py-1 pr-2 text-amber-700">{r.recipientName.trim() || "지배주주등"}</td>
                <td className="py-1 text-right text-muted-foreground">{r.directRatioRaw.numer}/{r.directRatioRaw.denom}</td>
                <td className="py-1 text-right text-muted-foreground">
                  {r.indirectRatioRaw.numer > 0 ? `${r.indirectRatioRaw.numer}/${r.indirectRatioRaw.denom}` : "—"}
                </td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.directGain)}</td>
                <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">
                  {r.indirectGain > 0 ? formatKRW(r.indirectGain) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted-foreground">
          간접이익=0은 &quot;미작동&quot;이 아닙니다. 간접보유 전부를 한계보유비율 차감에 우선 사용하여 직접이익에 산입합니다 (§34의3⑬).
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground">
        ※ 교재는 거래비율차감후 8.33% 반올림 적용 시 갑 직접이익을 20,510,000원대로 표시. 본 시스템은 정확분수(1/12) 정수연산으로 20,520,000원 산출.
      </p>
    </div>
  );
}
