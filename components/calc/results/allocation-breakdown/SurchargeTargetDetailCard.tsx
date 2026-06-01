"use client";

/**
 * ② 할증과세 대상 과세가액 (*2) — SurchargeTargetDetailCard (§27①)
 * 산식: 상속세 과세가액 − 상속인·수유자 외 자(영리법인) 사전증여가액 / 상속인별 = 과세가액상당액 (영리법인 제외)
 * echo: summaryTable.surchargeTargetTaxableValue · perHeir[h].taxableValueShare
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "../deduction-breakdown/shared";

export function SurchargeTargetDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  const total = result.summaryTable?.surchargeTargetTaxableValue ?? 0;
  const perHeir = result.heirAllocationResult?.perHeir ?? {};
  const rows = sortHeirs(heirs).filter((h) => h.relation !== "corporate");

  return (
    <div data-testid="calc-basis-card-surcharge-target">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">할증과세 대상 과세가액 <span className="text-muted-foreground">(*2)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(total)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          <SubTotalRow
            label="합계 = 상속세 과세가액 − 상속인·수유자 외 자 사전증여가액"
            value={formatKRW(total)}
          />
          {rows.map((h) => {
            const p = perHeir[h.id];
            if (!p) return null;
            return (
              <DetailRow
                key={h.id}
                label={`${labelOf(h.id, heirs)} 과세가액상당액`}
                value={formatKRW(p.taxableValueShare)}
              />
            );
          })}
        </DetailTable>
      </div>
    </div>
  );
}
