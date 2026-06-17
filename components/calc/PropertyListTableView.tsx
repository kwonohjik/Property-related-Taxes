"use client";

/**
 * PropertyListTableView — 종부세 보유 주택 요약 테이블 (행 클릭 → 편집 모달)
 *
 * 카드 나열 → 요약 테이블 + 행 클릭 시 Dialog 모달(PropertyCardEditor).
 * 상속재산 EstateItemTableView와 동일한 행 패턴(role="button"·testid·우정렬 금액).
 * 컬럼: 주택 · 소재지 · 공시가격(우정렬) · 지분율 · 합산배제 · 옵션 · 편집.
 * 합산배제·옵션 배지는 property-list-shared 단일 출처 (dual-truth 회피).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import {
  advancedOptionBadges,
  exclusionTypeShortLabel,
} from "@/components/calc/property-list-shared";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

// ============================================================
// 행
// ============================================================

interface PropertyTableRowProps {
  property: PropertyEntry;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
}

function PropertyTableRow({ property, index, isSelected, onSelect }: PropertyTableRowProps) {
  const locationText =
    property.road?.trim() ||
    property.jibun?.trim() ||
    property.building?.trim() ||
    "미입력";
  const assessed = parseAmount(property.assessedValue);
  const ratio = property.ownershipRatio?.trim() || "100";
  const exclusion = exclusionTypeShortLabel(property.exclusionType);
  // 옵션 배지 — 합산배제는 별도 컬럼이므로 제외
  const optionBadges = advancedOptionBadges(property).filter((b) => b !== "합산배제");

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
      aria-label={`주택 ${index + 1} 편집`}
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 " +
        (isSelected
          ? "bg-violet-50/70 dark:bg-violet-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
      data-testid={`property-table-row-${property.id}`}
    >
      {/* 주택 번호 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs font-medium">
        주택 {index + 1}
      </td>
      {/* 소재지 */}
      <td className="pl-2 py-1.5 text-xs max-w-[12rem] truncate">
        {locationText === "미입력" ? (
          <span className="text-gray-400">미입력</span>
        ) : (
          locationText
        )}
      </td>
      {/* 공시가격 (우정렬 — amount-column-align) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {assessed > 0 ? (
          assessed.toLocaleString()
        ) : (
          <span className="text-gray-400">미입력</span>
        )}
      </td>
      {/* 지분율 */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {ratio}%
      </td>
      {/* 합산배제 */}
      <td className="pl-2 py-1.5 text-xs whitespace-nowrap">
        {exclusion ? (
          <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            {exclusion}
          </span>
        ) : (
          <span className="text-gray-300 dark:text-gray-600">—</span>
        )}
      </td>
      {/* 옵션 배지 */}
      <td className="pl-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {optionBadges.length > 0 ? (
            optionBadges.map((b) => (
              <span
                key={b}
                className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
              >
                {b}
              </span>
            ))
          ) : (
            <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
          )}
        </div>
      </td>
      {/* 편집 힌트 */}
      <td className="pr-3 py-1.5 text-right text-xs select-none whitespace-nowrap">
        <span className="text-gray-300 dark:text-gray-600">✎</span>
      </td>
    </tr>
  );
}

// ============================================================
// 메인 export
// ============================================================

export interface PropertyListTableViewProps {
  properties: PropertyEntry[];
  selectedPropertyId: string | null;
  onSelect: (id: string) => void;
}

export function PropertyListTableView({
  properties,
  selectedPropertyId,
  onSelect,
}: PropertyListTableViewProps) {
  if (properties.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border" role="group" aria-label="보유 주택 목록">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700 bg-muted/30">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">주택</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">소재지</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">공시가격</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">지분</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">합산배제</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">옵션</th>
            <th className="w-12 py-2 text-right pr-3 text-gray-400 font-medium text-[10px]">편집</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property, index) => (
            <PropertyTableRow
              key={property.id}
              property={property}
              index={index}
              isSelected={property.id === selectedPropertyId}
              onSelect={() => onSelect(property.id)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
