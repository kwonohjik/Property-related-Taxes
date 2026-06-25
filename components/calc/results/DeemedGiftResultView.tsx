"use client";

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import {
  ExpandToggleButton,
} from "@/components/calc/results/shared/ExpandToggleButton";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import type {
  DeemedGiftResult,
  DeemedGiftAnyResult,
  CapitalIncreaseAllocationResult,
} from "@/lib/tax-engine/gift-deemed/types";

/** subGifts.giftDate는 엔진에선 Date, NextResponse.json 경유 후 client에선 string → 양립 포맷 */
function fmtGiftDate(d?: Date | string): string {
  if (!d) return "미입력";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

export function DeemedGiftResultView({
  result,
  onToGiftTax,
}: {
  result: DeemedGiftAnyResult;
  onToGiftTax: () => void;
}) {
  if ("perBeneficiary" in result) {
    return <AllocationResultView result={result} onToGiftTax={onToGiftTax} />;
  }
  return <SingleResultView result={result} onToGiftTax={onToGiftTax} />;
}

function SingleResultView({
  result,
  onToGiftTax,
}: {
  result: DeemedGiftResult;
  onToGiftTax: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="space-y-4" data-testid="deemed-result">
      <div className="rounded-lg border border-rose-200 bg-rose-50/50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-rose-800">증여재산가액 (증여이익)</span>
          <ExpandToggleButton open={open} onClick={() => setOpen(!open)} tone="rose" />
        </div>
        <p
          className="mt-1 text-right font-mono text-2xl font-bold tabular-nums text-rose-900"
          data-testid="deemed-result-value"
        >
          {formatKRW(result.deemedGiftValue)}
        </p>
        <div className="mt-1 flex justify-end">
          <LawArticleModal legalBasis={result.legalBasis} />
        </div>

        <div className={open ? "mt-3 block" : "mt-3 hidden print:block"}>
          <table className="w-full text-sm">
            <tbody>
              {result.breakdown.map((step, i) => (
                <tr key={i} className="border-t border-rose-100">
                  <td className="py-1.5 pr-2 text-muted-foreground">
                    {step.label}
                    {step.note ? <span className="ml-1 text-xs text-rose-600">({step.note})</span> : null}
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(step.amount)}
                  </td>
                  <td className="py-1.5 pl-2">
                    {step.lawRef ? <LawArticleModal legalBasis={step.lawRef} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {result.subGifts && result.subGifts.length > 0 && (
        <div
          className="rounded-lg border border-violet-200 bg-violet-50/40 p-4"
          data-testid="deemed-subgifts"
        >
          <p className="text-sm font-semibold text-violet-800">
            증여시기별 분리 (§33①1·2호 — 원본·수익 별개 증여)
          </p>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {result.subGifts.map((sg, i) => (
                <tr key={i} className="border-t border-violet-100">
                  <td className="py-1.5 pr-2 text-violet-700">
                    {sg.right === "principal" ? "원본권 증여" : "수익권 증여"}
                    <span className="ml-1 text-xs text-muted-foreground">
                      (증여시기 {fmtGiftDate(sg.giftDate)})
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {formatKRW(sg.value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">
            원본·수익 증여시기가 다르면 각 증여시기 기준으로 별도 신고합니다.
          </p>
        </div>
      )}

      {!result.applied && result.exclusionReason && (
        <div
          className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"
          data-testid="deemed-exclusion"
        >
          증여세 미적용: {result.exclusionReason}
        </div>
      )}

      {result.applied && (
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

/** 증자 cap-table 결과 — 수증자별·증여자별 분할 + 검증내역(zero-sum) */
function AllocationResultView({
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
      {/* 수증자별 증여재산가액 */}
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

      {/* 검증내역 (증감 합계 = 0) */}
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
