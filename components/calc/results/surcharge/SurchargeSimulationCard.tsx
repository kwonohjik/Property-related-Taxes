"use client";

/**
 * D3c 세부담 시뮬레이션 비교 — 응답 `simulation`을 그대로 옮긴다(계획서 §4.7 · P8). 화면은 다시 계산하지 않는다(T5).
 * A = 판정 그대로 계산한 세액 · B = 중과가 애초에 없는 세대 구성의 세액(엔진 반사실 플래그).
 */
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { SurchargeSimulationSide } from "@/app/api/calc/multi-house-surcharge-judgment/surcharge-simulation";

type Computed = { withSurcharge: SurchargeSimulationSide; withoutSurcharge: SurchargeSimulationSide; difference: number };

const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`;


const AMOUNT = "text-right font-mono tabular-nums whitespace-nowrap";

export function SurchargeSimulationCard({ simulation }: { simulation: Computed }) {
  const { withSurcharge: a, withoutSurcharge: b, difference } = simulation;

  if (a.isExempt && b.isExempt) {
    return (
      <p data-testid="surcharge-simulation-exempt" className="text-sm leading-relaxed">
        1세대1주택 비과세로 세액이 없어 중과 여부에 따른 비교가 해당하지 않습니다.
      </p>
    );
  }

  // 보조 줄(공제율·가산 세율)은 금액 아래에 둔다 — 375px에서 세 열이 한 줄에 들어가게(P8 브라우저 확인).
  const rows: { key: string; label: string; a: string; b: string; aSub?: string; bSub?: string }[] = [
    { key: "gain", label: "양도차익", a: formatKRW(a.transferGain), b: formatKRW(b.transferGain) },
    {
      key: "lthd",
      label: "장기보유특별공제",
      a: formatKRW(a.longTermHoldingDeduction),
      b: formatKRW(b.longTermHoldingDeduction),
      aSub: `공제율 ${pct(a.longTermHoldingRate)}`,
      bSub: `공제율 ${pct(b.longTermHoldingRate)}`,
    },
    { key: "basic", label: "기본공제", a: formatKRW(a.basicDeduction), b: formatKRW(b.basicDeduction) },
    { key: "base", label: "과세표준", a: formatKRW(a.taxBase), b: formatKRW(b.taxBase) },
    {
      key: "rate",
      label: "적용세율",
      a: pct(a.appliedRate),
      b: pct(b.appliedRate),
      aSub: a.surchargeRate !== null ? `가산 ${pct(a.surchargeRate)}p 포함` : undefined,
      bSub: b.surchargeRate !== null ? `가산 ${pct(b.surchargeRate)}p 포함` : undefined,
    },
    { key: "calc", label: "산출세액", a: formatKRW(a.calculatedTax), b: formatKRW(b.calculatedTax) },
    ...(a.reductionAmount || b.reductionAmount
      ? [{ key: "reduction", label: "감면세액", a: formatKRW(a.reductionAmount), b: formatKRW(b.reductionAmount) }]
      : []),
    { key: "local", label: "지방소득세", a: formatKRW(a.localIncomeTax), b: formatKRW(b.localIncomeTax) },
    { key: "total", label: "총 납부세액", a: formatKRW(a.totalTax), b: formatKRW(b.totalTax) },
  ];

  return (
    <div className="space-y-3" data-testid="surcharge-simulation">
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th className="whitespace-nowrap py-2 pr-2 text-left font-medium">항목</th>
              <th className="py-2 pl-2 text-right font-medium">판정대로(A)</th>
              <th className="py-2 pl-2 text-right font-medium">중과가 없다면(B)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-b-0" data-testid={`surcharge-sim-row-${r.key}`}>
                <td className="whitespace-nowrap py-2 pr-2 align-top">{r.label}</td>
                <td className={`py-2 pl-2 align-top ${AMOUNT}`}>
                  <span data-testid={`surcharge-sim-a-${r.key}`}>{r.a}</span>
                  {r.aSub && <span className="block text-xs text-muted-foreground" data-testid={`surcharge-sim-a-${r.key}-sub`}>{r.aSub}</span>}
                </td>
                <td className={`py-2 pl-2 align-top ${AMOUNT}`}>
                  <span data-testid={`surcharge-sim-b-${r.key}`}>{r.b}</span>
                  {r.bSub && <span className="block text-xs text-muted-foreground" data-testid={`surcharge-sim-b-${r.key}-sub`}>{r.bSub}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-t pt-3">
        <span className="text-sm font-semibold">차액 (A − B)</span>
        <span className={`text-lg font-bold ${AMOUNT}`} data-testid="surcharge-sim-difference">
          {formatKRW(difference)}
        </span>
      </div>
      {difference === 0 && (
        <p className="text-sm text-muted-foreground" data-testid="surcharge-sim-same">
          두 경우의 세액이 같습니다.
        </p>
      )}
    </div>
  );
}
