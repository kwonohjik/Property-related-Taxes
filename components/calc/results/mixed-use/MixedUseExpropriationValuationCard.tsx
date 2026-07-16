import type { MixedUseExpropriationDetail } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { ExprTotalValuationDetail } from "@/lib/tax-engine/transfer-tax-expropriation-valuation";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

/**
 * 겸용주택 §164⑨ 1호 공익수용 특례 산출근거 (계획 P7/D8).
 * 주택분(라목 개별주택가격 총액)·상가분(가목 토지 기준시가)에 각각 min(기준시가, 보상액, 보상기초) 적용.
 * 상가 건물분은 미적용(§80⑧), 양도가액 안분은 원값.
 */
function Part({ title, standardLabel, detail }: { title: string; standardLabel: string; detail: ExprTotalValuationDetail }) {
  const rows = [
    { label: standardLabel, value: detail.standardTotal },
    { label: "보상액 총액", value: detail.compensationTotal },
    { label: "보상산정 기초 기준시가 총액", value: detail.compensationBasisTotal },
  ];
  return (
    <div className="rounded-md border border-amber-200 bg-amber-100/40 p-2.5 dark:border-amber-900/50 dark:bg-amber-950/30">
      <p className="text-caption font-semibold text-amber-800 dark:text-amber-300">{title}</p>
      <table className="mt-2 w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const isChosen = r.value === detail.chosen;
            return (
              <tr key={r.label} className={isChosen ? "font-semibold text-amber-900 dark:text-amber-200" : ""}>
                <td className="py-0.5">
                  {r.label}
                  {isChosen && <span className="ml-1 text-xs">← 적용(최솟값)</span>}
                </td>
                <td className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap">{formatKRW(r.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1.5 border-t border-amber-200 pt-1.5 text-sm dark:border-amber-900/50">
        적용 양도당시 기준시가 <b className="font-mono tabular-nums">{formatKRW(detail.denominator)}</b>{" "}
        <span className="text-xs text-muted-foreground">(환산취득가액 분모)</span>
      </p>
    </div>
  );
}

export function MixedUseExpropriationValuationCard({ detail }: { detail: MixedUseExpropriationDetail }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
      <div>
        <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
          겸용주택 수용 양도당시 기준시가 특례 (소득령 §164⑨ 1호)
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
          주택분(개별주택가격)·상가분 토지(개별공시지가)의 양도당시 기준시가를 각각 아래 셋 중 가장 작은
          총액으로 낮춥니다. 상가 건물분은 적용하지 않으며(시행규칙 §80⑧) 양도가액 안분은 원값을 유지합니다.
        </p>
      </div>
      {detail.housing && <Part title="주택분 (개별주택가격)" standardLabel="개별주택가격 총액" detail={detail.housing} />}
      {detail.commercialLand && (
        <Part title="상가분 토지 (개별공시지가)" standardLabel="상가분 토지 기준시가 총액" detail={detail.commercialLand} />
      )}
    </div>
  );
}
