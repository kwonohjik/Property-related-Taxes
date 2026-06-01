"use client";

/**
 * ① 과세표준 배부대상 과세가액 (*1) — DistributableTaxBaseDetailCard
 * 산식: 상속세 과세가액 − Σ가산 증여재산 / 상속인별 = 과세가액상당액 − 사전증여가액 (영리법인 제외)
 * echo: summaryTable.distributableTaxBase · perHeir[h].taxableValueShare/priorGiftAmount
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "../deduction-breakdown/shared";

export function DistributableTaxBaseDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  const total = result.summaryTable?.distributableTaxBase ?? 0;
  const perHeir = result.heirAllocationResult?.perHeir ?? {};
  const rows = sortHeirs(heirs).filter((h) => h.relation !== "corporate");

  return (
    <div data-testid="calc-basis-card-distributable-base">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">과세표준 배부대상 과세가액 <span className="text-muted-foreground">(*1)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(total)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          <SubTotalRow label="합계 = 상속세 과세가액 − 가산한 증여재산" value={formatKRW(total)} />
          {rows.map((h) => {
            const p = perHeir[h.id];
            if (!p) return null;
            const v = p.taxableValueShare - p.priorGiftAmount;
            return (
              <DetailRow
                key={h.id}
                label={`${labelOf(h.id, heirs)} = 과세가액상당액 ${formatKRW(p.taxableValueShare)} − 사전증여 ${formatKRW(p.priorGiftAmount)}`}
                value={formatKRW(v)}
              />
            );
          })}
        </DetailTable>
      </div>
    </div>
  );
}
