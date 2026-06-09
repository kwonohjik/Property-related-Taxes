/**
 * Table C — 채무 등의 협의분할 내역 (이미지 35 상단).
 *
 * 4분류 그룹화 (financial / tax / personal / funeral) + 소계 + 합계.
 * 기존 DebtAllocationResultCard와 역할 분리: 본 카드 = 원시 자료 echo / 기존 = 안분 결과 강조.
 */
"use client";

import type { DebtItem, Heir, DebtCategory } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  DEBT_CATEGORY_LABEL,
  DEBT_CATEGORY_ORDER,
} from "./source-summary-constants";
import {
  findAllocationAmount,
  formatCellOrDash,
  formatIncurredDate,
  sumAllocationByHeir,
} from "./source-summary-helpers";

interface Props {
  debtItems: DebtItem[];
  heirs: Heir[];
  deathDate?: string;
}

function formatDeathDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}.`;
}

function buildNote(item: DebtItem): string {
  const parts: string[] = [];
  if (item.incurredDate) parts.push(formatIncurredDate(item.incurredDate));
  if (item.category === "funeral") {
    parts.push(item.isBongan ? "(봉안시설 한도 500만)" : "(장례비 한도 1,000만)");
  }
  return parts.join(" ");
}

export function DebtAllocationTable({ debtItems, heirs, deathDate }: Props) {
  if (!debtItems || debtItems.length === 0) return null;

  const groupItems = (cat: DebtCategory) =>
    debtItems.filter((d) => d.category === cat);
  const nonEmptyGroups = DEBT_CATEGORY_ORDER.filter(
    (cat) => groupItems(cat).length > 0,
  );

  const totalAmount = debtItems.reduce((acc, d) => acc + d.amount, 0);
  const totalByHeir = (heirId: string) =>
    debtItems.reduce(
      (acc, d) => acc + findAllocationAmount(d.heirAllocations, heirId),
      0,
    );

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h4 className="text-sm font-semibold text-slate-800">
          (3) 채무 등의 협의분할 내역
        </h4>
        {deathDate && (
          <span className="text-xs text-slate-600">
            (상속개시일 : {formatDeathDate(deathDate)})
          </span>
        )}
      </div>
      <table className="w-full text-xs" data-testid="debt-allocation-table">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="border border-slate-200 px-2 py-1.5 text-center">구분</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">채권자 주소</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">채권자등</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">금액</th>
            {heirs.map((h) => (
              <th
                key={h.id}
                className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
              >
                {h.name ?? h.relation}
              </th>
            ))}
            <th className="border border-slate-200 px-2 py-1.5 text-center">비고</th>
          </tr>
        </thead>
        <tbody>
          {nonEmptyGroups.map((cat) => {
            const items = groupItems(cat);
            const groupAmount = items.reduce((a, d) => a + d.amount, 0);
            return (
              <DebtGroupRows
                key={cat}
                category={cat}
                items={items}
                heirs={heirs}
                groupAmount={groupAmount}
              />
            );
          })}
          {/* 합계 */}
          <tr className="bg-amber-50 font-semibold">
            <td
              colSpan={3}
              className="border border-slate-200 px-2 py-1.5 text-center"
            >
              합계
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalAmount.toLocaleString()}
            </td>
            {heirs.map((h) => (
              <td
                key={h.id}
                className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
              >
                {formatCellOrDash(totalByHeir(h.id))}
              </td>
            ))}
            <td className="border border-slate-200"></td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function DebtGroupRows({
  category,
  items,
  heirs,
  groupAmount,
}: {
  category: DebtCategory;
  items: DebtItem[];
  heirs: Heir[];
  groupAmount: number;
}) {
  return (
    <>
      {items.map((item) => (
        <tr key={item.id} className="hover:bg-slate-50">
          <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">
            {DEBT_CATEGORY_LABEL[category]}
          </td>
          <td className="border border-slate-200 px-2 py-1.5">
            {formatCellOrDash(item.creditorAddress)}
          </td>
          <td className="border border-slate-200 px-2 py-1.5">{item.name}</td>
          <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
            {item.amount.toLocaleString()}
          </td>
          {heirs.map((h) => (
            <td
              key={h.id}
              className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
            >
              {formatCellOrDash(findAllocationAmount(item.heirAllocations, h.id))}
            </td>
          ))}
          <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">
            {buildNote(item)}
          </td>
        </tr>
      ))}
      <tr className="bg-slate-100 font-medium">
        <td
          colSpan={3}
          className="border border-slate-200 px-2 py-1.5 text-center"
        >
          {DEBT_CATEGORY_LABEL[category]} 소계
        </td>
        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
          {groupAmount.toLocaleString()}
        </td>
        {heirs.map((h) => (
          <td
            key={h.id}
            className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
          >
            {formatCellOrDash(sumAllocationByHeir(items, h.id))}
          </td>
        ))}
        <td className="border border-slate-200"></td>
      </tr>
    </>
  );
}
