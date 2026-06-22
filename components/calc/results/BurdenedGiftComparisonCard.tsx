/**
 * BurdenedGiftComparisonCard — 단순증여 vs 부담부증여 세부담 비교 (⑦ 결과 카드)
 *
 * 단순증여(채무 0 가정) 증여세 vs 부담부증여(증여세 + 양도소득세) 총 세부담을 표로 비교.
 * 계산은 computeBurdenedGiftComparison 단일 진실에 위임 — UI 자체 산술 없음
 * (feedback_ui_engine_dual_truth_avoidance).
 *
 * 표시 규칙: "원" 접미사 생략(feedback_no_won_suffix), 유불리 표현 금지
 * (feedback_tax_calculation_principle). 차액은 △(양수)/0/▼(음수) 중립 기호.
 */

import type { GiftTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import type { StockTransferResult } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import { computeBurdenedGiftComparison } from "@/lib/calc/gift-burden-comparison";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface Props {
  simpleGiftResult: GiftTaxResult;
  giftResult: GiftTaxResult;
  transferTaxResults: TransferTaxResult[];
  /** 주식 부담부 양도소득세 결과 — 비교 합산에 포함 */
  stockTransferTaxResults?: StockTransferResult[];
  /** 채무 > 0이나 양도세 토글 OFF인 자산이 있어 양도세 일부가 비교에 누락됨 (T-11) */
  hasUncoveredDebtAsset?: boolean;
}

const AMOUNT_CELL = "py-1.5 text-right font-mono tabular-nums whitespace-nowrap";

export function BurdenedGiftComparisonCard({
  simpleGiftResult,
  giftResult,
  transferTaxResults,
  stockTransferTaxResults = [],
  hasUncoveredDebtAsset = false,
}: Props) {
  const cmp = computeBurdenedGiftComparison(
    simpleGiftResult,
    giftResult,
    transferTaxResults,
    stockTransferTaxResults,
  );

  const diffText =
    cmp.taxBurdenDiff > 0
      ? `△ ${formatKRW(cmp.taxBurdenDiff)}`
      : cmp.taxBurdenDiff === 0
        ? "0"
        : `▼ ${formatKRW(Math.abs(cmp.taxBurdenDiff))}`;

  return (
    <div className="rounded-xl border border-sky-200 dark:border-sky-800 bg-sky-50/40 dark:bg-sky-950/20 p-4">
      <p className="text-sm font-semibold text-sky-800 dark:text-sky-200 mb-3">
        단순증여 vs 부담부증여 세부담 비교
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sky-200 dark:border-sky-800">
              <th className="text-left py-1 font-medium text-gray-600 dark:text-gray-400">
                구분
              </th>
              <th className="text-right py-1 font-medium text-gray-600 dark:text-gray-400 pr-4 whitespace-nowrap">
                단순증여
              </th>
              <th className="text-right py-1 font-medium text-gray-600 dark:text-gray-400 whitespace-nowrap">
                부담부증여
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-sky-100 dark:border-sky-900">
              <td className="py-1.5 text-gray-700 dark:text-gray-300">증여세</td>
              <td className={`${AMOUNT_CELL} pr-4`}>{formatKRW(cmp.simpleGiftTax)}</td>
              <td className={AMOUNT_CELL}>{formatKRW(cmp.burdenedGiftTax)}</td>
            </tr>
            <tr className="border-b border-sky-200 dark:border-sky-800">
              <td className="py-1.5 text-gray-700 dark:text-gray-300">양도소득세</td>
              <td className="py-1.5 text-right text-gray-400 pr-4">—</td>
              <td className={AMOUNT_CELL}>{formatKRW(cmp.burdenedTransferTax)}</td>
            </tr>
            <tr className="border-b border-sky-200 dark:border-sky-800 bg-sky-100/40 dark:bg-sky-900/30">
              <td className="py-1.5 font-semibold text-gray-800 dark:text-gray-200">
                합계
              </td>
              <td className={`${AMOUNT_CELL} pr-4 font-semibold`}>
                {formatKRW(cmp.simpleGiftTax)}
              </td>
              <td className={`${AMOUNT_CELL} font-semibold`}>
                {formatKRW(cmp.burdenedTotal)}
              </td>
            </tr>
            <tr>
              <td className="py-1.5 text-gray-700 dark:text-gray-300">세부담 차이</td>
              <td className="pr-4" />
              <td
                className={`${AMOUNT_CELL} font-semibold text-sky-700 dark:text-sky-300`}
              >
                {diffText}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        두 시나리오의 세부담을 비교한 참고 정보입니다.
      </p>
      {hasUncoveredDebtAsset && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          일부 자산의 양도소득세는 비교에 포함되지 않았습니다.
        </p>
      )}
    </div>
  );
}
