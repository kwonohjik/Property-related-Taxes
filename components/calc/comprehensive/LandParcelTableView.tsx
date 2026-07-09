"use client";

/**
 * LandParcelTableView — 토지 필지 요약 테이블 (행 클릭 → 편집 모달).
 *
 * 종합합산·별도합산 공용(kind). 주택 PropertyListTableView와 동일한 행 패턴
 * (role="button"·testid·우정렬 숫자). 컬럼: 필지 · 시군구 · 필지명 · 면적 · 지분 · 당해 공시지가(원/㎡) · 편집.
 */

import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import type { LandParcelForm } from "@/lib/stores/comprehensive-wizard-store";

type Kind = "aggregate" | "separate";

interface LandParcelTableRowProps {
  parcel: LandParcelForm;
  index: number;
  kind: Kind;
  isSelected: boolean;
  onSelect: () => void;
}

function LandParcelTableRow({ parcel, index, kind, isSelected, onSelect }: LandParcelTableRowProps) {
  const area = parseDecimal(parcel.area);
  const ratio = parcel.shareRatio?.trim() || "100";
  const price = parseAmount(parcel.officialPricePerSqm);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      aria-label={`필지 ${index + 1} 편집`}
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 " +
        (isSelected
          ? "bg-sky-50/70 dark:bg-sky-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
      data-testid={`land-${kind}-parcel-row-${parcel.id}`}
    >
      {/* 필지 번호 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs font-medium">필지 {index + 1}</td>
      {/* 시군구 */}
      <td className="pl-2 py-1.5 text-xs max-w-[8rem] truncate">
        {parcel.jurisdiction?.trim() || <span className="text-gray-400">미입력</span>}
      </td>
      {/* 필지명 */}
      <td className="pl-2 py-1.5 text-xs max-w-[8rem] truncate">
        {parcel.name?.trim() || <span className="text-gray-300 dark:text-gray-600">—</span>}
      </td>
      {/* 면적 (우정렬) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {area > 0 ? `${area.toLocaleString()}㎡` : <span className="text-gray-400">미입력</span>}
      </td>
      {/* 지분 */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {ratio}%
      </td>
      {/* 당해 공시지가 (원/㎡, 우정렬) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {price > 0 ? price.toLocaleString() : <span className="text-gray-400">미입력</span>}
      </td>
      {/* 편집 힌트 */}
      <td className="pr-3 py-1.5 text-right text-xs select-none whitespace-nowrap">
        <span className="text-gray-300 dark:text-gray-600">✎</span>
      </td>
    </tr>
  );
}

export interface LandParcelTableViewProps {
  parcels: LandParcelForm[];
  kind: Kind;
  selectedParcelId: string | null;
  onSelect: (id: string) => void;
}

export function LandParcelTableView({
  parcels,
  kind,
  selectedParcelId,
  onSelect,
}: LandParcelTableViewProps) {
  if (parcels.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border" role="group" aria-label="토지 필지 목록">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-muted/30">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">필지</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">시군구</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">필지명</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">면적</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">지분</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">공시지가</th>
            <th className="w-12 py-2 text-right pr-3 text-gray-400 font-medium text-micro">편집</th>
          </tr>
        </thead>
        <tbody>
          {parcels.map((parcel, index) => (
            <LandParcelTableRow
              key={parcel.id}
              parcel={parcel}
              index={index}
              kind={kind}
              isSelected={parcel.id === selectedParcelId}
              onSelect={() => onSelect(parcel.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
