"use client";

/**
 * EstateItemTableView — 상속재산·증여재산 요약 테이블 (행 클릭 → 편집 모달)
 *
 * estate-asset-table-view.ui.design.md §3·§4.
 * 행은 read-only 요약. 컬럼: 종류 · 자산명 · 평가액(우정렬) · 분류·옵션 배지 · 편집.
 * 배지·평가액은 기존 resolveChips·computeEffectiveValuation 단일 출처 재사용
 * (dual-truth 회피 — feedback_ui_engine_dual_truth_avoidance). 행에서는 클릭 비활성.
 *
 * 증여세(mode!=="inheritance")는 resolveChips가 평가액 칩만 반환 → 분류·옵션 컬럼 자동 생략.
 */

import { Settings } from "lucide-react";
import {
  resolveChips,
  countNonDefaultOptions,
  CHIP_TONE_CLASSES,
  type ChipState,
} from "@/components/calc/inheritance/estate-card/chip-config";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  type SupportedCategory,
} from "@/components/calc/inheritance/estate-card/estate-category-meta";
import { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 읽기 전용 배지 (resolveChips 결과 표시 — 클릭 비활성)
// ============================================================

function ReadonlyChipBadge({ chip }: { chip: ChipState }) {
  const cls = CHIP_TONE_CLASSES[chip.tone] ?? CHIP_TONE_CLASSES.gray;
  const markGlyph = chip.mark === "on" ? "✓ " : chip.mark === "off" ? "✕ " : "";
  return (
    <span
      className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border ${cls}`}
      title={chip.tooltip}
    >
      {markGlyph}
      {chip.label}
    </span>
  );
}

// ============================================================
// 행
// ============================================================

interface EstateItemTableRowProps {
  item: EstateItem;
  isSelected: boolean;
  onSelect: () => void;
  mode: "inheritance" | "gift";
  heirsCount: number;
}

function EstateItemTableRow({ item, isSelected, onSelect, mode, heirsCount }: EstateItemTableRowProps) {
  const cat = item.category as SupportedCategory;
  const nameDisplay = item.name?.trim() || CATEGORY_LABELS[cat];
  const value = computeEffectiveValuation(item);

  // resolveChips 단일 출처 — 읽기 전용 테이블은 실제 적용·설정된 비기본 옵션만 표시.
  //   isActiveData=false인 기본/미설정 안내 칩(평가액·일반·법정분할·영농/가업 미선택 등) 제외.
  //   실제 입력 여부 판정은 chip-config의 countNonDefaultOptions와 동일 술어 (단일 진실).
  const optionChips = resolveChips({ item, mode, heirsCount }).filter(
    (c) => c.isActiveData === true,
  );
  const optionCount = countNonDefaultOptions(item, mode);

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
      aria-label={`${nameDisplay} 편집`}
      className={
        "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 " +
        (isSelected
          ? "bg-violet-50/70 dark:bg-violet-900/20"
          : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
      }
      data-testid={`estate-table-row-${item.id}`}
    >
      {/* 종류 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs">
        <span className="mr-1" aria-hidden>{CATEGORY_ICONS[cat]}</span>
        {CATEGORY_LABELS[cat]}
      </td>
      {/* 자산명 */}
      <td className="pl-2 py-1.5 text-xs font-medium">{nameDisplay}</td>
      {/* 평가액 (우정렬 — amount-column-align) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {value > 0 ? (
          value.toLocaleString()
        ) : (
          <span className="text-gray-400">미입력</span>
        )}
      </td>
      {/* 분류·옵션 배지 (상속세 모드만) */}
      {mode === "inheritance" && (
        <td className="pl-2 py-1.5">
          <div className="flex flex-wrap gap-1">
            {optionChips.map((chip) => (
              <ReadonlyChipBadge key={chip.key} chip={chip} />
            ))}
          </div>
        </td>
      )}
      {/* 편집 힌트 + ⚙️ 옵션 카운트 */}
      <td className="pr-3 py-1.5 text-right text-xs select-none whitespace-nowrap">
        {optionCount > 0 && (
          <span className="inline-flex items-center gap-0.5 text-slate-400 mr-1.5">
            <Settings className="h-3 w-3" aria-hidden />
            {optionCount}
          </span>
        )}
        <span className="text-gray-300 dark:text-gray-600">✎</span>
      </td>
    </tr>
  );
}

// ============================================================
// 메인 export
// ============================================================

export interface EstateItemTableViewProps {
  items: EstateItem[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  mode: "inheritance" | "gift";
  /** 협의분할 칩 노출 판정용 (상속인 수) */
  heirsCount: number;
  /** 테이블 aria-label — "상속재산 목록"/"증여재산 목록" */
  ariaLabel: string;
}

export function EstateItemTableView({
  items,
  selectedItemId,
  onSelect,
  mode,
  heirsCount,
  ariaLabel,
}: EstateItemTableViewProps) {
  if (items.length === 0) return null;
  const showOptionCol = mode === "inheritance";

  return (
    <div className="overflow-x-auto" role="group" aria-label={ariaLabel}>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">종류</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">자산명</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">평가액</th>
            {showOptionCol && (
              <th className="py-2 text-left pl-2 text-gray-500 font-medium">분류·옵션</th>
            )}
            <th className="w-16 py-2 text-right pr-3 text-gray-400 font-medium text-[10px]">편집</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <EstateItemTableRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              onSelect={() => onSelect(item.id)}
              mode={mode}
              heirsCount={heirsCount}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
