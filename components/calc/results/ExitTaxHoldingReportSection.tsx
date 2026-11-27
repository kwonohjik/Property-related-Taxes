"use client";

/**
 * 별지 제104호서식 펼침 섹션 — 국외전출자 주식등 보유현황 신고서
 *
 * 인쇄 시 자동 펼침은 **CSS-only** 로 한다(`print:block`). `useEffect` 로 `isPrinting` 을
 * 추적하는 안티패턴을 쓰지 않는다([[print-only-css-toggle]]).
 */

import { useState } from "react";
import { ExitTaxHoldingReportForm } from "./ExitTaxHoldingReportForm";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { selectHoldingReportTargets } from "@/lib/calc/exit-tax-holding-report-targets";
import type { ExitTaxHoldingForm } from "@/lib/stores/calc-wizard-stock-types";
import type { ExitTaxHoldingResult } from "@/lib/tax-engine/stock-transfer/types/exit-tax.types";

export function ExitTaxHoldingReportSection({
  holdings: inputHoldings,
  departureDate,
  holdingDetails,
}: {
  holdings: ExitTaxHoldingForm[];
  departureDate: string;
  /** 엔진 종목별 결과 — `scope: "excluded"` 종목은 신고 대상이 아니라 표에서 뺀다(2027.1.1. 개정) */
  holdingDetails?: ExitTaxHoldingResult[];
}) {
  const [open, setOpen] = useState(false);
  const holdings = selectHoldingReportTargets(inputHoldings, holdingDetails);

  if (inputHoldings.length > 0 && holdings.length === 0) {
    return (
      <div data-testid="exit-tax-holding-report-none">
        <ToneCard tone="slate" title="별지 제104호서식 — 신고 대상 종목 없음">
          <p className="text-sm leading-relaxed">
            입력한 보유 종목이 모두 국외전출자 주식등에서 제외되어 보유현황 신고 대상 종목이 없습니다.
            제외 사유는 위 결과 카드의 제외 판정을 참조하세요.
          </p>
        </ToneCard>
      </div>
    );
  }

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
