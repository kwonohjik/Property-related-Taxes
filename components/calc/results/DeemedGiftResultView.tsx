"use client";

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  ExpandToggleButton,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import type { DeemedGiftResult } from "@/lib/tax-engine/gift-deemed/types";

/** subGifts.giftDate는 엔진에선 Date, NextResponse.json 경유 후 client에선 string → 양립 포맷 */
function fmtGiftDate(d?: Date | string): string {
  if (!d) return "미입력";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export function DeemedGiftResultView({
  result,
  onToGiftTax,
}: {
  result: DeemedGiftResult;
  onToGiftTax: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-4" data-testid="deemed-result">
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-800">증여재산가액 (증여이익)</span>
          <ExpandToggleButton open={open} onClick={() => setOpen(!open)} tone="rose" />
        </div>
        <p
          className="mt-1 text-right font-mono text-2xl font-bold tabular-nums text-rose-900"
          data-testid="deemed-result-value"
        >
          {formatKRW(result.deemedGiftValue)}
        </p>
        <div className="mt-1 flex justify-end">
          <LawArticleModal legalBasis={result.legalBasis} />
        </div>

        <div className={open ? "mt-3 block" : "mt-3 hidden print:block"}>
          <table className="w-full text-sm">
            <tbody>
              {result.breakdown.map((step, i) => (
                <tr key={i} className="border-t border-rose-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {step.label}
                    {step.note ? <span className="ml-1 text-xs text-rose-600">({step.note})</span> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(step.amount)}
                  </td>
                  <td className="py-1.5 pl-2">
                    {step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.subGifts && result.subGifts.length > 0 && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="deemed-subgifts"
        >
          <p className="text-sm font-semibold text-violet-800">
            증여시기별 분리 (§33①1·2호 — 원본·수익 별개 증여)
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {result.subGifts.map((sg, i) => (
                <tr key={i} className="border-t border-violet-100">
                  <td className="py-1.5 pr-2 text-violet-700">
                    {sg.right === "principal" ? "원본권 증여" : "수익권 증여"}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (증여시기 {fmtGiftDate(sg.giftDate)})
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(sg.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            원본·수익 증여시기가 다르면 각 증여시기 기준으로 별도 신고합니다.
          </p>
        </div>
      )}

      {result.periodBreakdown && result.periodBreakdown.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4" data-testid="deemed-period-breakdown">
          <p className="text-sm font-semibold text-amber-800">기간별 증여 (§37·시행령§27③⑤ — 5년/1년 단위)</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-amber-700">
                <th className="py-1 text-left font-medium">증여일</th>
                <th className="py-1 text-right font-medium">평가액</th>
                <th className="py-1 text-right font-medium">증여이익</th>
                <th className="py-1 text-right font-medium">과세</th>
              </tr>
            </thead>
            <tbody>
              {result.periodBreakdown.map((p) => (
                <tr key={p.index} className="border-t border-amber-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">{p.giftDate || "미입력"}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(p.baseValue)}</td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(p.benefit)}</td>
                  <td className="py-1.5 text-right text-xs">{p.applied ? "○" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            각 기간은 별개 증여 — 해당 증여일 도래 시 별도 신고 대상입니다. 위 증여재산가액은 첫 기간(현재 증여) 기준입니다.
          </p>
        </div>
      )}

      {result.rectification && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4" data-testid="deemed-rectification">
          <p className="text-sm font-semibold text-emerald-800">경정청구 가능 세액 (§79②1호·시행령§81⑨)</p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {result.rectification.steps.map((step, i) => (
                <tr key={i} className="border-t border-emerald-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {step.label}
                    {step.note ? <span className="ml-1 text-xs text-emerald-600">({step.note})</span> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(step.amount)}</td>
                  <td className="py-1.5 pl-2">{step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p
            className="mt-2 text-right font-mono text-lg font-bold tabular-nums text-emerald-900"
            data-testid="deemed-rectification-value"
          >
            {formatKRW(result.rectification.refundableTax)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            무상사용 만료일 {result.rectification.expiryDate} 기준 잔여 {result.rectification.remainingMonths}/{result.rectification.totalMonths}개월.
          </p>
        </div>
      )}

      {!result.applied && result.exclusionReason && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          data-testid="deemed-exclusion"
        >
          증여세 미적용: {result.exclusionReason}
        </div>
      )}

      {result.applied && (
        <button
          type="button"
          onClick={onToGiftTax}
          data-testid="deemed-to-wizard"
          className="w-full rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700"
        >
          이 금액으로 증여세 계산하기 →
        </button>
      )}

      <DisclaimerBanner />
    </div>
  );
}
