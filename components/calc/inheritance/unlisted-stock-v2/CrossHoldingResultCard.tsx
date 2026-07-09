"use client";

/**
 * CrossHoldingResultCard — 다른 비상장법인 주식 보유 평가 결과 (상호출자 연립방정식)
 *
 * crossHoldingReflection echo 표시: 1주당가액 + Max(장부,보충적) + ②평가차액 주입액.
 * 결과는 evaluateUnlistedStockV2(input).crossHoldingReflection 실시간 호출.
 *
 * Design: docs/02-design/features/inheritance-unlisted-stock-cross-holding.ui.design.md §4
 */

import { useMemo } from "react";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const won = (n: number) => n.toLocaleString("ko-KR");

export function CrossHoldingResultCard({
  input,
  sectionNum,
}: {
  input: UnlistedStockValuationInput;
  sectionNum?: number;
}) {
  const reflection = useMemo(() => {
    try {
      if (input.totalShares <= 0 || input.ownedShares <= 0) return null;
      return evaluateUnlistedStockV2(input).crossHoldingReflection ?? null;
    } catch {
      return null;
    }
  }, [input]);

  if (!reflection) return null;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        {sectionNum !== undefined && (
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
            {sectionNum}
          </span>
        )}
        <p className="text-xs font-semibold text-emerald-700">
          다른 비상장법인 주식 평가 (상호출자 연립방정식 — 평가준칙 §60②)
        </p>
      </div>

      <table className="w-full text-caption">
        <thead>
          <tr className="text-muted-foreground">
            <th className="text-left font-medium">발행법인</th>
            <th className="text-right font-medium">1주당 평가액</th>
            <th className="text-right font-medium">장부가액</th>
            <th className="text-right font-medium">보충적평가</th>
            <th className="text-right font-medium">적용액(Max)</th>
          </tr>
        </thead>
        <tbody>
          {reflection.appliedHoldings.map((h) => {
            const perShare = reflection.solution.perShareSupplementary[h.rowId];
            return (
              <tr key={h.rowId} className="border-t border-emerald-100">
                <td className="py-1">{h.issuerCorpName || h.rowId}</td>
                <td className="text-right font-mono tabular-nums">{won(perShare ?? 0)}</td>
                <td className="text-right font-mono tabular-nums">{won(h.bookValue)}</td>
                <td className="text-right font-mono tabular-nums">{won(h.supplementaryValue)}</td>
                <td className="text-right font-mono tabular-nums font-semibold">{won(h.appliedValue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="rounded bg-emerald-100/60 px-2 py-1.5 text-caption text-emerald-800">
        ②평가차액 자동 주입액 ={" "}
        <span className="font-mono tabular-nums font-semibold">
          {won(reflection.assetValuationDeltaInjection)}
        </span>{" "}
        원 (적용액 − 장부가액 합계 — 순자산가액에 반영됨)
      </div>
    </div>
  );
}
