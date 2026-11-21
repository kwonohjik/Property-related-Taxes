import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { TRANSFER } from "@/lib/tax-engine/legal-codes";

/**
 * §164⑨ 2호 공매·경락 특례 산출근거 (계획 P4).
 * min(양도당시 기준시가 총액, 공매·경락가액) = 환산 분모 (총액 2후보).
 */
export function AuctionValuationCard({
  detail,
}: {
  detail: NonNullable<TransferTaxResult["auctionValuationDetail"]>;
}) {
  const rows = [
    { label: "양도당시 기준시가 총액", value: detail.standardTotal },
    { label: "공매·경락가액", value: detail.auctionPrice },
  ];
  return (
    // R-c03-04 — 톤은 `ToneCard`(tones.ts 단일 소스), 조문은 법령 상수(verify:legal 추적 대상)에서 가져온다.
    <ToneCard tone="amber" title={`공매·경락 양도당시 기준시가 특례 (${TRANSFER.EXPROPRIATION_VALUATION_CLAUSE_2})`} bodyClassName="space-y-0">
      <p className="mt-1 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
        공매·경락(2009.02.04 이후) 자산의 환산취득가액 계산 시 양도당시 기준시가는 아래 둘 중 작은 금액(총액)을 적용합니다.
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
    </ToneCard>
  );
}
