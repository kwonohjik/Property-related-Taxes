"use client";

/**
 * 동시증여 추가 건 결과 — 별지 제10호서식 건별 표 + 수증자 총 납부세액 합계 카드 (⑦-b 지점).
 *
 * `GiftTaxResultView.tsx` 800줄 정책 분리 — JSX와 계산을 그대로 옮겼다(동작 변경 없음).
 * 추가 건이 없으면(단건 모드) 아무것도 그리지 않는다.
 */
import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { GiftDonorRelation } from "@/lib/tax-engine/types/inheritance-gift.types";
import { GIFT_DONOR_LABELS } from "@/components/calc/prior-gift/meta";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { GiftTaxFilingFormTable } from "@/components/calc/results/GiftTaxFilingFormTable";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";

interface Props {
  /** 건 0(주 건)의 결과 — 합계 카드의 건 0 결정세액 */
  result: GiftTaxResult;
  simultaneousResults?: GiftTaxResult[];
  /** 추가 건별 증여자 관계 레이블 — 결과 헤더 표시용 */
  simultaneousResultLabels?: string[];
  /** 건 0의 donor — 합계 카드 레이블용 */
  mainDonor?: GiftDonorRelation;
  selectedPrintIds: ReadonlySet<string>;
}

export function GiftSimultaneousResultSections({
  result,
  simultaneousResults,
  simultaneousResultLabels,
  mainDonor,
  selectedPrintIds,
}: Props) {
  return (
    <>
      {/* 동시증여 추가 건 별지 제10호서식 (⑦-b 지점) */}
      {simultaneousResults && simultaneousResults.length > 0 && (
        <PrintSection id="simultaneous-filing-10" selectedIds={selectedPrintIds}>
          <div className="space-y-4">
            {simultaneousResults.map((sr, i) => (
              <div key={i} className="space-y-2">
                {/* 건 헤더 */}
                <div className="flex items-center gap-2 px-1" data-testid={`sim-result-header-${i}`}>
                  <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                    건 {i + 1}
                  </span>
                  {simultaneousResultLabels?.[i] && (
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {simultaneousResultLabels[i]}
                    </span>
                  )}
                </div>
                <GiftTaxFilingFormTable
                  rows={sr.besshi10Rows}
                  warnings={sr.warnings}
                  testIdPrefix={`besshi10-${i + 1}-`}
                />
              </div>
            ))}
          </div>
        </PrintSection>
      )}

      {/* 동시증여 수증자 총 납부세액 합계 카드 (⑦-b 지점) */}
      {simultaneousResults && simultaneousResults.length > 0 && (
        <div className="rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4 space-y-2 dark:border-sky-700 dark:bg-sky-900/20">
          <h3 className="text-sm font-bold text-sky-900 dark:text-sky-100">
            수증자 총 납부세액 합계 (상증법 §4의2①)
          </h3>
          <table className="w-full text-xs">
            <tbody>
              <tr>
                <td className="py-0.5 text-sky-700 dark:text-sky-300">
                  건 0 결정세액 {mainDonor ? `(${GIFT_DONOR_LABELS[mainDonor] ?? mainDonor})` : ""}
                </td>
                <td className="py-0.5 text-right font-mono tabular-nums">
                  {formatKRW(result.finalTax)}
                </td>
              </tr>
              {simultaneousResults.map((sr, i) => (
                <tr key={i}>
                  <td className="py-0.5 text-sky-700 dark:text-sky-300">
                    건 {i + 1} 결정세액{" "}
                    {simultaneousResultLabels?.[i]
                      ? `(${simultaneousResultLabels[i]})`
                      : ""}
                  </td>
                  <td className="py-0.5 text-right font-mono tabular-nums">
                    {formatKRW(sr.finalTax)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-sky-300 dark:border-sky-700 font-bold">
                <td className="pt-2 text-sky-900 dark:text-sky-100">합계</td>
                <td className="pt-2 text-right font-mono tabular-nums text-sky-900 dark:text-sky-100">
                  {formatKRW(
                    result.finalTax +
                      simultaneousResults.reduce((s, r) => s + r.finalTax, 0),
                  )}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-micro text-sky-700 dark:text-sky-400">
            수증자 총 납부세액 합계 = 건 0 결정세액 + 건 1 결정세액 + … + 건 N 결정세액
          </p>
        </div>
      )}
    </>
  );
}
