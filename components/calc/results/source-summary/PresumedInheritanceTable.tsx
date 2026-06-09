/**
 * Table B — 과세가액 가산 추정상속재산 요약 (이미지 33~34 재현).
 *
 * 데이터: presumedItems (input) + result.presumedInheritanceDetail.items (engine echo) join.
 * 엔진 변경 0 — 모든 필드 echo 완비.
 */
"use client";

import type {
  PresumedInheritanceItem,
  PresumedInheritanceItemResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { PRESUMED_CATEGORY_LABEL } from "./source-summary-constants";

interface Props {
  presumedItems: PresumedInheritanceItem[];
  resultItems?: PresumedInheritanceItemResult[];
}

function calcRatio(verified: number, scrutiny: number): string {
  if (scrutiny === 0) return "-";
  const r = (verified / scrutiny) * 100;
  return `${r.toFixed(1)}%`;
}

export function PresumedInheritanceTable({
  presumedItems,
  resultItems,
}: Props) {
  if (!presumedItems || presumedItems.length === 0) return null;

  const resultMap = new Map<string, PresumedInheritanceItemResult>(
    (resultItems ?? []).map((r) => [r.id, r] as const),
  );

  const totalScrutiny = presumedItems.reduce(
    (acc, it) => acc + it.amountWithin1Y + it.amountWithin2Y,
    0,
  );
  const totalVerified = presumedItems.reduce(
    (acc, it) => acc + it.verifiedUseAmount,
    0,
  );
  const totalBase = presumedItems.reduce(
    (acc, it) => acc + (resultMap.get(it.id)?.baseDeduction ?? 0),
    0,
  );
  const totalAdded = presumedItems.reduce(
    (acc, it) => acc + (resultMap.get(it.id)?.addedAmount ?? 0),
    0,
  );

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2">
          <h4 className="text-sm font-semibold text-slate-800">
            (2) 과세가액에 가산하는 추정상속재산 요약
          </h4>
        </div>
        <table
          className="w-full text-xs"
          data-testid="presumed-inheritance-table"
        >
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              <th className="border border-slate-200 px-2 py-1.5 text-center" rowSpan={2}>
                재산종류별
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-center" rowSpan={2}>
                세부내용
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-center" colSpan={3}>
                소명대상 금액
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap" rowSpan={2}>
                사용처 확인금액
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap" rowSpan={2}>
                소명비율(%)
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap" rowSpan={2}>
                기준금액
              </th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap" rowSpan={2}>
                과세가액 산입액
              </th>
            </tr>
            <tr>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">1년 이내</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">2년 이내</th>
              <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">소계</th>
            </tr>
          </thead>
          <tbody>
            {presumedItems.map((item) => {
              const r = resultMap.get(item.id);
              const scrutiny = item.amountWithin1Y + item.amountWithin2Y;
              return (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="border border-slate-200 px-2 py-1.5 text-center">
                    {PRESUMED_CATEGORY_LABEL[item.category]}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5">
                    {/* PresumedInheritanceItem에 name 없음 — category 라벨 fallback */}
                    {PRESUMED_CATEGORY_LABEL[item.category]}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {item.amountWithin1Y.toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {item.amountWithin2Y.toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {scrutiny.toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {item.verifiedUseAmount.toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {calcRatio(item.verifiedUseAmount, scrutiny)}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {(r?.baseDeduction ?? 0).toLocaleString()}
                  </td>
                  <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                    {(r?.addedAmount ?? 0).toLocaleString()}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-amber-50 font-semibold">
              <td
                colSpan={2}
                className="border border-slate-200 px-2 py-1.5 text-center"
              >
                합계
              </td>
              <td className="border border-slate-200" colSpan={2}></td>
              <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {totalScrutiny.toLocaleString()}
              </td>
              <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {totalVerified.toLocaleString()}
              </td>
              <td className="border border-slate-200"></td>
              <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {totalBase.toLocaleString()}
              </td>
              <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {totalAdded.toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-900">
        <p className="mb-1 font-medium">산식 (상증법 §15)</p>
        <p>㉠ 미소명액 = 처분액 − 사용처확인액</p>
        <p>㉡ 추정상속재산 = max(0, 미소명액 − Min(처분액×20%, 2억))</p>
      </div>

      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-700">
        <p className="font-medium">상속추정의 배제 (상증법 집행기준 15-11-6)</p>
        <p className="mt-1">
          용도불분명한 금액 &lt; Min(처분재산가액·인출금액·채무부담액×20%, 2억) → 상속추정 배제
        </p>
      </div>
    </div>
  );
}
