"use client";

/**
 * StockItemTableView — 주식·지분(상장·비상장) 요약 테이블 (행 클릭 → 편집 모달)
 *
 * stock-item-table-view.ui.design.md §3·§4.
 * 행은 read-only 요약. 컬럼: 종류(+평가방식 배지) · 자산명 · 평가액(우정렬) · 분류·옵션 배지 · 편집.
 * 배지·평가액은 기존 resolveChips·computeEffectiveValuation 단일 출처 재사용
 * (dual-truth 회피 — feedback_ui_engine_dual_truth_avoidance). 행에서는 클릭 비활성.
 *
 * EstateItemTableView와 분리: 주식은 SupportedCategory에서 제외(라벨·아이콘 Record 부재) +
 * valuationDate(V2 fallback)·평가방식 배지·showMajorShareholderChip 주식 고유.
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
  STOCK_CATEGORY_ICONS,
  STOCK_CATEGORY_LABELS,
  type StockCategory,
} from "@/components/calc/inheritance/stock/stock-category-meta";
import {
  computeEffectiveValuation,
} from "@/lib/calc/estate-item-valuation";
import {
  resolveUnlistedDisplayMode,
  shouldShowMajorShareholderChip,
} from "@/lib/calc/stock-valuation";
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
// 평가방식 배지 (비상장만 — 간편/정식)
// ============================================================

function ValuationModeBadge({ item }: { item: EstateItem }) {
  if (item.category !== "unlisted_stock") return null;
  const mode = resolveUnlistedDisplayMode(item);
  const isSimple = mode === "simple";
  const cls = isSimple
    ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
  return (
    <span className={`ml-1 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${cls}`}>
      {isSimple ? "간편" : "정식"}
    </span>
  );
}

// ============================================================
// 행
// ============================================================

interface StockItemTableRowProps {
  item: EstateItem;
  isSelected: boolean;
  onSelect: () => void;
  mode: "inheritance" | "gift";
  heirsCount: number;
  valuationDate?: string;
}

function StockItemTableRow({ item, isSelected, onSelect, mode, heirsCount, valuationDate }: StockItemTableRowProps) {
  const cat = item.category as StockCategory;
  // 자산명 3중 fallback: name(비상장=회사명·상장=별명) → companyName(상장 갑지①) → 카테고리 라벨
  const nameDisplay = item.name?.trim() || item.companyName?.trim() || STOCK_CATEGORY_LABELS[cat];
  const value = computeEffectiveValuation(item, valuationDate);

  // resolveChips 단일 출처 — 읽기 전용 테이블은 실제 적용·설정된 비기본 옵션만 표시.
  //   showMajorShareholderChip은 stock 전용 술어 (상장·V1=true, V2=false).
  const optionChips = resolveChips({
    item,
    mode,
    heirsCount,
    showMajorShareholderChip: shouldShowMajorShareholderChip(item),
  }).filter((c) => c.isActiveData === true);
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
      data-testid="stock-card"
      data-category={item.category}
    >
      {/* 종류 + 평가방식 배지 */}
      <td className="pl-3 py-1.5 whitespace-nowrap text-xs">
        <span className="mr-1" aria-hidden>{STOCK_CATEGORY_ICONS[cat]}</span>
        {STOCK_CATEGORY_LABELS[cat]}
        <ValuationModeBadge item={item} />
      </td>
      {/* 자산명 + 특례 배지 */}
      <td className="pl-2 py-1.5 text-xs font-medium">
        <span>{nameDisplay}</span>
        {item.isSpecialTreatmentAsset === true && (
          <span className="ml-1.5 inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium align-middle">
            특례 귀속
          </span>
        )}
      </td>
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

export interface StockItemTableViewProps {
  items: EstateItem[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  mode: "inheritance" | "gift";
  /** 협의분할 칩 노출 판정용 (상속인 수) */
  heirsCount: number;
  /** 평가기준일 — 평가액 컬럼 computeEffectiveValuation V2 fallback (EstateItemTableView엔 없음) */
  valuationDate?: string;
  /** 테이블 aria-label */
  ariaLabel: string;
}

export function StockItemTableView({
  items,
  selectedItemId,
  onSelect,
  mode,
  heirsCount,
  valuationDate,
  ariaLabel,
}: StockItemTableViewProps) {
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
            <StockItemTableRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              onSelect={() => onSelect(item.id)}
              mode={mode}
              heirsCount={heirsCount}
              valuationDate={valuationDate}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
