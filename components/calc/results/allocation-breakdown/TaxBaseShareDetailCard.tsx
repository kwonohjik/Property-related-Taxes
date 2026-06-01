"use client";

/**
 * ③ 상속인별 과세표준 상당액 (⑥) — TaxBaseShareDetailCard (집행기준 19-17-1)
 * ㉠ 직접배부 + ㉡ 간접배부(분자×본인*1÷분모) = ㉢ 계. 영리법인 포함(㉠ 사전증여 과세표준).
 * *3 분모(computedTaxShareDenominator)는 영리법인 제외.
 * echo: perHeir.directTaxBaseShare/indirectTaxBaseShare/taxBaseShare,
 *       heirAllocationResult.indirectNumerator/indirectDistributionBase/computedTaxShareDenominator
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "../deduction-breakdown/shared";

export function TaxBaseShareDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  const a = result.heirAllocationResult;
  const perHeir = a?.perHeir ?? {};
  const numerator = a?.indirectNumerator ?? 0;
  const denomBase = a?.indirectDistributionBase ?? 0;
  const star3 = a?.computedTaxShareDenominator ?? 0;
  const rows = sortHeirs(heirs); // ⑥은 영리법인 포함 (U6)

  return (
    <div data-testid="calc-basis-card-taxbase-share">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">상속인별 과세표준 상당액 <span className="text-muted-foreground">(⑥)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(result.taxBase)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          <DetailRow label="간접배부대상 과세표준" value={formatKRW(numerator)} muted />
          <DetailRow label="간접배부 분모 (증여재산 제외 과세가액)" value={formatKRW(denomBase)} muted />
          {rows.map((h) => {
            const p = perHeir[h.id];
            if (!p) return null;
            const star1 = p.taxableValueShare - p.priorGiftAmount;
            const giftDeduction = p.priorGiftAmount - p.directTaxBaseShare;
            return (
              <div key={h.id}>
                <DetailRow
                  label={`${labelOf(h.id, heirs)} ㉠ 직접배부 (사전증여 과세표준)`}
                  value={formatKRW(p.directTaxBaseShare)}
                />
                {p.directTaxBaseShare > 0 && giftDeduction > 0 && (
                  <DetailRow
                    label={`= 사전증여 ${formatKRW(p.priorGiftAmount)} − 증여재산공제 ${formatKRW(giftDeduction)}`}
                    value=""
                    indent
                    muted
                  />
                )}
                <DetailRow
                  label={`${labelOf(h.id, heirs)} ㉡ 간접배부`}
                  value={formatKRW(p.indirectTaxBaseShare)}
                />
                {p.indirectTaxBaseShare > 0 && (
                  <DetailRow
                    label={`= ${formatKRW(numerator)} × (${formatKRW(star1)} ÷ ${formatKRW(denomBase)})`}
                    value=""
                    indent
                    muted
                  />
                )}
                <DetailRow
                  label={`${labelOf(h.id, heirs)} ㉢ 과세표준 상당액 계`}
                  value={formatKRW(p.taxBaseShare)}
                />
              </div>
            );
          })}
          <SubTotalRow label="*3 분모 (영리법인 제외)" value={formatKRW(star3)} />
        </DetailTable>
      </div>
    </div>
  );
}
