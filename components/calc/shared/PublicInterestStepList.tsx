"use client";

/**
 * 공익법인 사후관리 계산기 3종(§48②1호 증여세 · §48②4호 증여세 · §48②5·7호 가산세)이
 * 공유하는 「산출 근거 + 안내」 렌더러.
 *
 * 세 엔진이 같은 `PublicInterestStep` 배열과 `warnings: string[]`을 내므로 표시도 한 곳에서
 * 한다 — 갈라 두면 조문 근거 배지·금액 정렬이 페이지마다 어긋난다.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { PublicInterestStep } from "@/lib/tax-engine/types/public-interest-post-mgmt.types";
import { FormulaText } from "@/components/calc/results/shared/FormulaParts";

export function PublicInterestStepList({
  steps,
  warnings,
}: {
  steps: PublicInterestStep[];
  warnings: string[];
}) {
  return (
    <>
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <p className="text-sm font-semibold">산출 근거</p>
        {steps.map((s, i) => (
          <div key={i} className="flex justify-between gap-3 text-xs">
            <span className="text-muted-foreground">
              {s.label}
              <span className="ml-1 text-micro text-blue-700">{s.legalBasis}</span>
              <span className="block text-caption"><FormulaText value={s.formula} /></span>
            </span>
            {s.amount > 0 && (
              <span className="tabular-nums font-medium whitespace-nowrap">
                {formatKRW(s.amount)}
              </span>
            )}
          </div>
        ))}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50/40 p-3 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="text-caption text-amber-800">
              · {w}
            </p>
          ))}
        </div>
      )}
    </>
  );
}
