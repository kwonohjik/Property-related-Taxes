"use client";

/**
 * ⑤ 상속인·수유자가 아닌 자(영리법인)의 증여세액 공제 (⑩) — CorporateGiftCreditDetailCard (§3의2②)
 * ⑩a 증여세 산출세액 / ⑩b 한도(산출세액×영리법인 과세표준÷과세표준) / ⑩c Min
 * 영리법인 과세표준 = taxBase − computedTaxShareDenominator (역산 R4)
 * echo: perHeir[corp].priorGiftComputedTax/priorGiftCreditLimit · corporateExemption.amount ·
 *       summaryTable.corporateExemptionLimitDisplay
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { Heir, InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { sortHeirs, labelOf } from "@/lib/calc/heir-allocation-summary";
import { DetailTable, DetailRow, SubTotalRow, ExpandButton } from "../deduction-breakdown/shared";
import { Frac } from "../shared/FormulaParts";

export function CorporateGiftCreditDetailCard({
  result,
  heirs,
}: {
  result: InheritanceTaxResult;
  heirs: Heir[];
}) {
  const [open, setOpen] = useState(false);
  const a = result.heirAllocationResult;
  const perHeir = a?.perHeir ?? {};
  const corps = sortHeirs(heirs).filter((h) => h.relation === "corporate");
  if (corps.length === 0) return null;

  const corpGiftTaxBase = result.taxBase - (a?.computedTaxShareDenominator ?? 0); // 역산 R4
  const exemption = result.corporateExemption?.amount ?? 0;
  const limitDisplay = result.summaryTable?.corporateExemptionLimitDisplay ?? 0;

  return (
    <div data-testid="calc-basis-card-corporate-credit">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-sm">상속인·수유자 외 증여세액공제 <span className="text-muted-foreground">(⑩)</span></span>
        <span className="flex items-center gap-1">
          <span className="font-mono text-sm tabular-nums">{formatKRW(exemption)}</span>
          <ExpandButton expanded={open} onClick={() => setOpen((v) => !v)} />
        </span>
      </div>
      <div className={open ? "block" : "hidden print:block"}>
        <DetailTable>
          {corps.map((h) => {
            const p = perHeir[h.id];
            if (!p) return null;
            return (
              <div key={h.id}>
                <DetailRow label={`${labelOf(h.id, heirs)} ⓐ 증여세 산출세액`} value={formatKRW(p.priorGiftComputedTax ?? 0)} />
                <DetailRow label={`${labelOf(h.id, heirs)} ⓑ 공제 한도`} value={formatKRW(p.priorGiftCreditLimit ?? 0)} />
                <DetailRow
                  label={
                    <>
                      = 산출세액 {formatKRW(result.computedTax)} ×{" "}
                      <Frac
                        top={`영리법인 과세표준 ${formatKRW(corpGiftTaxBase)}`}
                        bottom={`과세표준 ${formatKRW(result.taxBase)}`}
                      />
                    </>
                  }
                  value=""
                  indent
                  muted
                />
              </div>
            );
          })}
          <SubTotalRow label="ⓒ 공제할 증여세액 = Min(ⓐ, ⓑ)" value={formatKRW(exemption)} />
          <div className="px-3 py-2 text-caption text-muted-foreground leading-relaxed">
            ⓘ 합계행 공제 한도 {formatKRW(limitDisplay)}는 산출세액+세대생략(⑨ 소계) 기준(할증 포함),
            영리법인 행 한도는 산출세액(⑦) 기준(할증 미포함)으로 차이가 있습니다. 주주 환원 명세는 별지 부표5 참조.
          </div>
        </DetailTable>
      </div>
    </div>
  );
}
