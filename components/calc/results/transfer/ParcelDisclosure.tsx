"use client";

/**
 * 필지별 계산 내역 (펼치기/접기) — `TransferTaxResultView` 에서 분리했다(800줄 정책, Q-12 PR-3 · 동작 무변경).
 */
import { useState } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { Row } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";

// ── 필지별 계산 내역 (펼치기/접기 — 자산 카드와 동일 표준 칩) ──────────
export function ParcelDisclosure({
  pr,
  idx,
}: {
  pr: NonNullable<TransferTaxResult["parcelDetails"]>[number];
  idx: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 bg-muted/20 hover:bg-muted/40 text-sm font-medium text-left"
      >
        <span>필지 {idx + 1}</span>
        <span className="ml-auto font-mono tabular-nums text-xs text-muted-foreground">
          양도차익 {formatKRW(pr.transferGain)}
        </span>
        <span className={expandToggleClass("slate")} aria-hidden>
          {expandToggleLabel(open)}
        </span>
      </button>
      <div className={open ? "" : "hidden print:block"}>
        <table className="w-full text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
          <tbody>
            <Row label="안분 양도가액" value={formatKRW(pr.allocatedTransferPrice)} sub />
            <Row label="취득가액" value={formatKRW(pr.acquisitionPrice)} sub />
            {pr.estimatedDeduction > 0 && (
              <Row label="필요경비 (개산공제 §163⑥)" value={`- ${formatKRW(pr.estimatedDeduction)}`} sub />
            )}
            {pr.expenses > 0 && (
              <Row label={pr.swapApplied ? "필요경비 (자본·양도비 §97②단서)" : pr.estimatedDeduction > 0 ? "필요경비 (자본·양도비)" : "필요경비"} value={`- ${formatKRW(pr.expenses)}`} sub />
            )}
            <Row label="양도차익" value={formatKRW(pr.transferGain)} />
            <Row
              label={`장기보유특별공제 (${(pr.longTermHoldingRate * 100).toFixed(0)}%)`}
              value={pr.longTermHoldingDeduction > 0 ? `- ${formatKRW(pr.longTermHoldingDeduction)}` : "해당없음"}
              sub
            />
            <Row label="양도소득금액" value={formatKRW(pr.transferIncome)} highlight />
          </tbody>
        </table>
        {/*
          공익수용 양도당시 기준시가 차감 특례 (소득령 §164⑨ 1호) 산출근거 — **필지별**.
          필지마다 개별공시지가가 달라 min[] 선택이 독립이므로 자산-수준으로 승격하지 않는다.
        */}
        {pr.expropriationValuationDetail && (
          <div className="mt-3">
            <ExpropriationValuationCard detail={pr.expropriationValuationDetail} />
          </div>
        )}
      </div>
    </div>
  );
}
