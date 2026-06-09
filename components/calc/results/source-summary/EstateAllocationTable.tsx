/**
 * Table A — 상속재산의 협의분할 내역 (이미지 32~33 재현).
 *
 * 데이터: estateItems + stockItems 합쳐서 4그룹(예금/부동산/주식/기타) × 소계 + 합계 + 총계.
 */
"use client";

import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  ESTATE_GROUP_LABEL,
  ESTATE_GROUP_ORDER,
} from "./source-summary-constants";
import {
  findAllocationAmount,
  formatQuantity,
  groupEstateItems,
  resolveValuation,
  resolveValuationLabel,
  sumAllocationByHeir,
  formatCellOrDash,
  type GroupedEstateItems,
} from "./source-summary-helpers";

interface Props {
  estateItems: EstateItem[];
  heirs: Heir[];
  /** 추정상속재산 가산 총액 (Table B 합계 — 총계 행 표시용) */
  presumedTotal?: number;
  deathDate?: string;
}

function formatDeathDate(iso?: string): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(iso);
  if (!m) return iso;
  return `${m[1]}.${Number(m[2])}.${Number(m[3])}.`;
}

export function EstateAllocationTable({
  estateItems,
  heirs,
  presumedTotal = 0,
  deathDate,
}: Props) {
  if (!estateItems || estateItems.length === 0) return null;

  const groups = groupEstateItems(estateItems);
  const groupMap = new Map<string, GroupedEstateItems>(
    groups.map((g) => [g.group, g] as const),
  );
  const orderedGroups = ESTATE_GROUP_ORDER.filter((k) => groupMap.has(k)).map(
    (k) => groupMap.get(k)!,
  );

  const totalValuation = estateItems.reduce(
    (acc, it) => acc + resolveValuation(it),
    0,
  );
  const totalByHeir = (heirId: string) =>
    estateItems.reduce(
      (acc, it) => acc + findAllocationAmount(it.heirAllocations, heirId),
      0,
    );

  const grandTotalValuation = totalValuation + presumedTotal;

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2">
        <h4 className="text-sm font-semibold text-slate-800">
          (1) 상속재산의 협의분할 내역
        </h4>
        {deathDate && (
          <span className="text-xs text-slate-600">
            (상속개시일 : {formatDeathDate(deathDate)})
          </span>
        )}
      </div>
      <table className="w-full text-xs" data-testid="estate-allocation-table">
        <thead className="bg-slate-100 text-slate-700">
          <tr>
            <th className="border border-slate-200 px-2 py-1.5 text-center">재산분류</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">적요</th>
            <th className="border border-slate-200 px-2 py-1.5 text-center">수량(면적)</th>
            <th className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">평가금액</th>
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
          {orderedGroups.map((g) => (
            <GroupRows key={g.group} group={g} heirs={heirs} />
          ))}
          {/* 상속재산 합계 */}
          <tr className="bg-amber-50 font-semibold">
            <td
              colSpan={3}
              className="border border-slate-200 px-2 py-1.5 text-center"
            >
              상속재산 합계
            </td>
            <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
              {totalValuation.toLocaleString()}
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
          {presumedTotal > 0 && (
            <>
              <tr className="bg-rose-50">
                <td className="border border-slate-200 px-2 py-1.5 text-center">
                  추정상속
                </td>
                <td
                  colSpan={2}
                  className="border border-slate-200 px-2 py-1.5"
                >
                  부동산 처분 등
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {presumedTotal.toLocaleString()}
                </td>
                <td
                  colSpan={heirs.length}
                  className="border border-slate-200 px-2 py-1.5 text-center text-slate-500"
                >
                  Table B 참조
                </td>
                <td className="border border-slate-200"></td>
              </tr>
              <tr className="bg-amber-100 font-semibold">
                <td
                  colSpan={3}
                  className="border border-slate-200 px-2 py-1.5 text-center"
                >
                  상속재산 총계
                </td>
                <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                  {grandTotalValuation.toLocaleString()}
                </td>
                <td
                  colSpan={heirs.length + 1}
                  className="border border-slate-200"
                ></td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}

function GroupRows({
  group,
  heirs,
}: {
  group: GroupedEstateItems;
  heirs: Heir[];
}) {
  return (
    <>
      {group.items.map((item) => (
        <tr key={item.id} className="hover:bg-slate-50">
          <td className="border border-slate-200 px-2 py-1.5 text-center text-slate-600">
            {ESTATE_GROUP_LABEL[group.group]}
          </td>
          <td className="border border-slate-200 px-2 py-1.5">{item.name}</td>
          <td className="border border-slate-200 px-2 py-1.5 text-center">
            {formatQuantity(item)}
          </td>
          <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
            {resolveValuation(item).toLocaleString()}
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
            {resolveValuationLabel(item)}
          </td>
        </tr>
      ))}
      {/* 그룹 소계 */}
      <tr className="bg-slate-100 font-medium">
        <td
          colSpan={3}
          className="border border-slate-200 px-2 py-1.5 text-center"
        >
          {ESTATE_GROUP_LABEL[group.group]} 소계
        </td>
        <td className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
          {group.groupValuationTotal.toLocaleString()}
        </td>
        {heirs.map((h) => (
          <td
            key={h.id}
            className="border border-slate-200 px-2 py-1.5 text-right font-mono tabular-nums whitespace-nowrap"
          >
            {formatCellOrDash(sumAllocationByHeir(group.items, h.id))}
          </td>
        ))}
        <td className="border border-slate-200"></td>
      </tr>
    </>
  );
}
