"use client";

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { ExpandToggleButton } from "@/components/calc/results/shared/ExpandToggleButton";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import type { CapitalIncreaseAllocationResult } from "@/lib/tax-engine/gift-deemed/types";

// ─────────────────────────────────────────────────────────────
// 증자 cap-table 결과 — 수증자별·증여자별 분할 + 검증내역(zero-sum)
// ─────────────────────────────────────────────────────────────

export function AllocationResultView({
  result,
  onToGiftTax,
}: {
  result: CapitalIncreaseAllocationResult;
  onToGiftTax: () => void;
}) {
  const [open, setOpen] = useState(true);
  const nameById = new Map(result.byShareholder.map((b) => [b.id, (b.name ?? "").trim() || "주주"]));
  const taxedBeneficiaries = result.perBeneficiary.filter((b) => b.total > 0);

  return (
    <div className="space-y-4" data-testid="deemed-result">
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-800">증자에 따른 이익의 증여 (증자 후 1주당 평가 {formatKRW(result.perShareAfter)})</span>
          <ExpandToggleButton open={open} onClick={() => setOpen(!open)} tone="rose" />
        </div>
        <div className="mt-2 flex justify-end">
          <LawArticleModal legalBasis="상증법 §39" />
        </div>
        <div className="mt-3 space-y-3">
          {result.perBeneficiary.map((b) => (
            <div key={b.beneficiaryId} className="rounded-md border border-rose-100 bg-white/60 p-3" data-testid={`ci-alloc-beneficiary-${b.beneficiaryId}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-rose-900">{nameById.get(b.beneficiaryId)}</span>
                <span className="text-right font-mono text-lg font-bold tabular-nums text-rose-900" data-testid={`ci-alloc-total-${b.beneficiaryId}`}>
                  {formatKRW(b.total)}
                </span>
              </div>
              <div className={open ? "mt-2 block" : "mt-2 hidden print:block"}>
                <table className="w-full text-sm">
                  <tbody>
                    {b.byDonor.map((d, i) => (
                      <tr key={i} className="border-t border-rose-50">
                        <td className="py-1 pr-2 text-muted-foreground">
                          증여자 {nameById.get(d.donorId)}
                          {d.excludedReason ? <span className="ml-1 text-xs text-gray-500">({d.excludedReason})</span> : null}
                        </td>
                        <td className="py-1 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(d.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className={open ? "block" : "hidden print:block"}>
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4" data-testid="ci-alloc-reconciliation">
          <p className="text-sm font-semibold text-slate-700">검증내역 (증감 합계 = {formatKRW(result.reconciliation.totalGain - result.reconciliation.totalLoss)})</p>
          <table className="mt-2 w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="py-1 pr-2 text-left font-medium">주주</th>
                <th className="py-1 px-2 text-right font-medium">증자 전 평가</th>
                <th className="py-1 px-2 text-right font-medium">납입대금</th>
                <th className="py-1 px-2 text-right font-medium">증자 후 평가</th>
                <th className="py-1 pl-2 text-right font-medium">증감</th>
              </tr>
            </thead>
            <tbody>
              {result.byShareholder.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="py-1 pr-2">{(b.name ?? "").trim() || "주주"}</td>
                  <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.preValuation)}</td>
                  <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.paidIn)}</td>
                  <td className="py-1 px-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.postValuation)}</td>
                  <td className="py-1 pl-2 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(b.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {taxedBeneficiaries.length > 0 && (
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
