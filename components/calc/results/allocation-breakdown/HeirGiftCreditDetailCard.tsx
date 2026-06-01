"use client";

/**
 * ⑥ 상속인 및 수유자의 증여세액 공제 (⑫) — HeirGiftCreditDetailCard (§28)
 * ⓐ 증여세 산출세액 / ⓑ 한도(⑪×직접배부÷⑥㉢) / ⓒ Min. 영리법인 제외.
 * echo: perHeir[h].priorGiftComputedTax/priorGiftCreditLimit/priorGiftCredit/computedTaxShare/
 *       directTaxBaseShare/taxBaseShare
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { DetailTable, DetailRow, ExpandButton } from "../deduction-breakdown/shared";

/** R2: 영리법인 제외 상속인의 사전증여 증여세 산출세액 합 (⑫ 표시 조건) */
export function hasHeirGiftCredit(result: InheritanceTaxResult, heirs: Heir[]): boolean {
  const perHeir = result.heirAllocationResult?.perHeir ?? {};
  return heirs
    .filter((h) => h.relation !== "corporate")
    .reduce((s, h) => s + (perHeir[h.id]?.priorGiftComputedTax ?? 0), 0) > 0;
}

export function HeirGiftCreditDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  if (!hasHeirGiftCredit(result, heirs)) return null;

  const perHeir = result.heirAllocationResult?.perHeir ?? {};
  const rows = sortHeirs(heirs).filter(
    (h) => h.relation !== "corporate" && (perHeir[h.id]?.priorGiftComputedTax ?? 0) > 0,
  );
  const total = rows.reduce((s, h) => s + (perHeir[h.id]?.priorGiftCredit ?? 0), 0);

  return (
    <div data-testid="calc-basis-card-heir-credit">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">상속인·수유자 증여세액공제 <span className="text-muted-foreground">(⑫)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(total)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          {rows.map((h) => {
            const p = perHeir[h.id]!;
            return (
              <div key={h.id}>
                <DetailRow label={`${labelOf(h.id, heirs)} ⓐ 증여세 산출세액`} value={formatKRW(p.priorGiftComputedTax ?? 0)} />
                <DetailRow label={`${labelOf(h.id, heirs)} ⓑ 공제 한도`} value={formatKRW(p.priorGiftCreditLimit ?? 0)} />
                <DetailRow
                  label={`= 산출세액 배부 ${formatKRW(p.computedTaxShare)} × (직접배부 ${formatKRW(p.directTaxBaseShare)} ÷ 과세표준상당액 ${formatKRW(p.taxBaseShare)})`}
                  value=""
                  indent
                  muted
                />
                <DetailRow
                  label={`${labelOf(h.id, heirs)} ⓒ 사전증여세액공제 = Min(ⓐ, ⓑ)`}
                  value={formatKRW(p.priorGiftCredit)}
                  deduction
                />
              </div>
            );
          })}
        </DetailTable>
      </div>
    </div>
  );
}
