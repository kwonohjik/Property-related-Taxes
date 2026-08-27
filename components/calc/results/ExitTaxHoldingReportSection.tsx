"use client";

/**
 * 별지 제104호서식 펼침 섹션 — 국외전출자 주식등 보유현황 신고서
 *
 * 인쇄 시 자동 펼침은 **CSS-only** 로 한다(`print:block`). `useEffect` 로 `isPrinting` 을
 * 추적하는 안티패턴을 쓰지 않는다([[print-only-css-toggle]]).
 */

import { useState } from "react";
import { ExitTaxHoldingReportForm } from "./ExitTaxHoldingReportForm";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";

export function ExitTaxHoldingReportSection({
  holdings,
  departureDate,
}: {
  holdings: ExitTaxHoldingForm[];
  departureDate: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-xl border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold hover:bg-muted/50 print:hidden"
        data-testid="exit-tax-holding-report-toggle"
      >
        <span>
          국외전출자 주식등 보유현황 신고서 (별지 제104호서식) — {holdings.length}건
        </span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      <div className={open ? "block p-4" : "hidden print:block print:p-0"}>
        <ExitTaxHoldingReportForm holdings={holdings} departureDate={departureDate} />
      </div>
    </div>
  );
}
