import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

/**
 * 주택(라목) §164⑨ 1호 공익수용 특례 산출근거 (계획 P5).
 * min(개별주택가격 총액, 보상액 총액, 보상기초 기준시가 총액) = 환산 분모 (총액 3후보).
 */
export function HousingExpropriationValuationCard({
  detail,
}: {
  detail: NonNullable<TransferTaxResult["housingExpropriationValuationDetail"]>;
}) {
  const rows = [
    { label: "개별주택가격 총액", value: detail.standardTotal },
    { label: "보상액 총액", value: detail.compensationTotal },
    { label: "보상산정 기초 기준시가 총액", value: detail.compensationBasisTotal },
  ];
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
        주택 수용 양도당시 기준시가 특례 (소득령 §164⑨ 1호)
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        수용(2009.02.04 이후) 주택의 환산취득가액 계산 시 양도당시 기준시가는 아래 셋 중 가장 작은 금액(총액)을 적용합니다.
      </p>
      <table className="mt-3 w-full text-sm">
        <tbody>
          {rows.map((r) => {
            const isChosen = r.value === detail.chosen;
            return (
              <tr key={r.label} className={isChosen ? "font-semibold text-amber-900 dark:text-amber-200" : ""}>
                <td className="py-0.5">
                  {r.label}
                  {isChosen && <span className="ml-1 text-xs">← 적용(최솟값)</span>}
                </td>
                <td className="py-0.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {formatKRW(r.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-3 border-t border-amber-200 pt-2 text-sm dark:border-amber-900/50">
        적용 양도당시 기준시가{" "}
        <b className="font-mono tabular-nums">{formatKRW(detail.denominator)}</b>{" "}
        <span className="text-xs text-muted-foreground">(환산취득가액 분모)</span>
      </p>
    </div>
  );
}
