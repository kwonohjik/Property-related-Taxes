"use client";

/**
 * SplitAllocationPreviewCard — 분할 양도 모드 Step2의 「1단계 건별 입력에서 자동 산출」 값 표시
 *
 * 종전 Step2는 분할 모드에서도 단건 입력칸(양도가액 합계 · 1주당 취득가액)을 **빈 칸 + 필수 표시**로
 * 렌더했다. 배너는 「자동 산출됩니다」라고 하면서 값을 어디에도 보여주지 않았다
 * (계획서 `stock-split-lots-ui-bugfix.plan.md` D-3). 값은 엔진 매칭과 같은 함수에서 온다
 * (`previewSplitAllocation` — 사이드바와 공용).
 */

import { useMemo } from "react";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { previewSplitAllocation } from "@/lib/calc/stock-split-preview";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-form";

const METHOD_LABEL = { specific: "개별법", fifo: "선입선출법", moving_avg: "이동평균법" } as const;
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmt = (n: number) => n.toLocaleString();

export function SplitAllocationPreviewCard({
  form,
  side,
}: {
  form: StockTransferFormData;
  side: "transfer" | "acquisition";
}) {
  const detail = useMemo(() => previewSplitAllocation(form), [form]);
  const isTransfer = side === "transfer";

  if (!detail) {
    return (
      <ToneCard tone="slate" title={isTransfer ? "양도가액 (자동 산출)" : "취득가액 (자동 산출)"}>
        <p className="text-xs text-slate-600" data-testid={`split-preview-${side}-pending`}>
          1단계 매수·매도 건의 일자·주식수·1주당 단가를 모두 입력하면 여기에 산출됩니다
          {form.costAllocationMethod === "specific" ? " (개별법은 매도 주식수만큼 배정이 끝나야 합니다)" : ""}.
        </p>
      </ToneCard>
    );
  }

  return (
    <ToneCard
      tone={isTransfer ? "emerald" : "amber"}
      title={
        isTransfer
          ? "양도가액 (1단계 매도 건 합계)"
          : `취득가액 (1단계 매수 건 · ${METHOD_LABEL[detail.method]} 매칭)`
      }
    >
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-slate-700">{isTransfer ? "양도가액 합계" : "취득가액 합계"}</span>
        <strong
          className="font-mono tabular-nums"
          data-testid={isTransfer ? "split-preview-transfer-total" : "split-preview-acquisition-total"}
        >
          {fmt(isTransfer ? detail.totalTransferPrice : detail.totalAcquisitionPrice)}
        </strong>
      </div>
      {!isTransfer && (
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="text-left font-normal">양도일</th>
              <th className="text-left font-normal">취득 기산일</th>
              <th className="text-right font-normal">주식수</th>
              <th className="text-right font-normal">1주당 취득가액</th>
              <th className="text-right font-normal">취득가액</th>
            </tr>
          </thead>
          <tbody>
            {detail.matched.map((m, i) => (
              <tr key={i}>
                <td>{fmtDate(m.saleDate)}</td>
                <td>{fmtDate(m.acquisitionDate)}</td>
                <td className="text-right font-mono tabular-nums">{fmt(m.buyShares)}</td>
                <td className="text-right font-mono tabular-nums">{fmt(m.perShareBuyPrice)}</td>
                <td className="text-right font-mono tabular-nums">{fmt(m.buyShares * m.perShareBuyPrice)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-slate-500">
        {isTransfer
          ? "매도 건별 주식수 × 1주당 단가의 합계입니다. 수정은 1단계에서 하세요."
          : "양도한 주식수만큼 매칭된 매수 건의 원가입니다(남은 보유분은 포함하지 않습니다). 수정은 1단계에서 하세요."}
      </p>
    </ToneCard>
  );
}
