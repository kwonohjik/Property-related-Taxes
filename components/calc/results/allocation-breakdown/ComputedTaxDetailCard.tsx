"use client";

/**
 * ④ 상속세 산출세액 (⑦⑧⑨ + ⑪·*5) — ComputedTaxDetailCard (§26)
 * ⑦=과세표준×세율−누진공제 / ⑧ 값만(상세는 세대생략 카드) / ⑨ 소계 / 배부대상 / ⑪ 배부 / *5 부담비율
 * echo: computedTax·computedTaxAppliedRate·computedTaxProgressiveDeduction·generationSkipSurcharge·
 *       heirAllocationResult.distributableTax·computedTaxShareDenominator · perHeir.computedTaxShare/burdenRatio
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "../deduction-breakdown/shared";
import { Frac } from "../shared/FormulaParts";
import { GenerationSkipFormulaRows } from "./GenerationSkipFormulaRows";

export function ComputedTaxDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  const a = result.heirAllocationResult;
  const perHeir = a?.perHeir ?? {};
  const denom = a?.computedTaxShareDenominator ?? 0;
  const distributable = a?.distributableTax ?? 0;
  const subtotal = result.computedTax + result.generationSkipSurcharge;
  const rate = result.computedTaxAppliedRate;
  const deduction = result.computedTaxProgressiveDeduction;
  const rows = sortHeirs(heirs).filter((h) => h.relation !== "corporate");

  return (
    <div data-testid="calc-basis-card-computed-tax">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">상속세 산출세액 <span className="text-muted-foreground">(⑦~⑨·⑪)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(subtotal)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          <DetailRow label="⑦ 산출세액" value={formatKRW(result.computedTax)} />
          {rate != null && deduction != null ? (
            <DetailRow
              label={`= 과세표준 ${formatKRW(result.taxBase)} × ${(rate * 100).toFixed(0)}% − 누진공제 ${formatKRW(deduction)}`}
              value=""
              indent
              muted
            />
          ) : (
            <div className="px-3 py-1.5 text-muted-foreground flex items-center gap-1">
              = 과세표준 × 누진세율 <LawArticleModal legalBasis="상증법 §26" label="§26" />
            </div>
          )}
          <DetailRow label="⑧ 세대생략 가산액" value={formatKRW(result.generationSkipSurcharge)} />
          {result.generationSkipDetail && (
            <GenerationSkipFormulaRows detail={result.generationSkipDetail} />
          )}
          <SubTotalRow label="⑨ 산출세액 소계 (⑦ + ⑧)" value={formatKRW(subtotal)} />
          <DetailRow
            label={`배부대상 산출세액 = ⑦ − 영리법인 면제 ${formatKRW(result.corporateExemption?.amount ?? 0)}`}
            value={formatKRW(distributable)}
          />
          {rows.map((h) => {
            const p = perHeir[h.id];
            if (!p) return null;
            return (
              <div key={h.id}>
                <DetailRow
                  label={`${labelOf(h.id, heirs)} ⑪ 산출세액 배부`}
                  value={formatKRW(p.computedTaxShare)}
                />
                <DetailRow
                  label={
                    <>
                      = {formatKRW(distributable)} ×{" "}
                      <Frac top={formatKRW(p.taxBaseShare)} bottom={formatKRW(denom)} /> · *5 부담비율{" "}
                      {p.burdenRatio?.toFixed(4) ?? "—"}
                    </>
                  }
                  value=""
                  indent
                  muted
                />
              </div>
            );
          })}
        </DetailTable>
      </div>
    </div>
  );
}
