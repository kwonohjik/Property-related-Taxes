"use client";

/**
 * EstateItemHeader — 자산 카드 헤더 행 + 칩 + 액션
 *
 * Plan §3.1·§5 · Visual §2.1
 */

import { Settings, Trash2 } from "lucide-react";
import { EstateItemHeaderChips } from "./EstateItemHeaderChips";
import { EstateItemActionsMenu } from "./EstateItemActionsMenu";
import type { ChipKey, ChipState } from "./chip-config";

export interface EstateItemHeaderProps {
  itemId: string;
  icon: string;
  categoryLabel: string;
  index: number;
  chips: ChipState[];
  expandedKey: ChipKey | null;
  onChipClick: (chip: ChipState) => void;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
  advancedBadgeCount: number;
  onRemove: () => void;
  /** PR-F FU-6: 카테고리 변경 ⋮ 메뉴 콜백. 미전달 시 ⋮ 메뉴 미노출 */
  onChangeCategory?: () => void;
  /**
   * 모달(EstateItemEditor) 안에서 사용 시 카테고리+번호 타이틀부를 숨김.
   * DialogTitle("{카테고리} 편집")과 중복 제거. 기본 false(타이틀 표시).
   * estate-asset-table-view.ui.design.md §5.3.
   */
  hideTitle?: boolean;
  /**
   * 삭제 버튼 숨김. EstateStockChipsHeader처럼 onRemove가 noop이거나(주식 카드 자체 삭제는
   * 호출자 담당) 모달 푸터가 삭제를 별도 제공할 때 사용 — 중복 삭제 버튼 제거. 기본 false.
   */
  hideRemove?: boolean;
}

export function EstateItemHeader({
  itemId,
  icon,
  categoryLabel,
  index,
  chips,
  expandedKey,
  onChipClick,
  advancedOpen,
  onToggleAdvanced,
  advancedBadgeCount,
  onRemove,
  onChangeCategory,
  hideTitle = false,
  hideRemove = false,
}: EstateItemHeaderProps) {
  return (
    <div
      data-testid={`estate-card-header-${itemId}`}
      className="flex flex-wrap items-start justify-between gap-2"
    >
      <div className="flex flex-wrap items-center gap-2 flex-1 min-w-0">
        {!hideTitle && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-lg" aria-hidden>{icon}</span>
            <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
              {categoryLabel} {index + 1}
            </span>
          </div>
        )}
        <EstateItemHeaderChips
          itemId={itemId}
          chips={chips}
          expandedKey={expandedKey}
          onChipClick={onChipClick}
        />
      </div>
      <div className="flex items-center gap-1 shrink-0 print:hidden">
        {/* PR-F FU-6: ⋮ 더보기 메뉴 (카테고리 변경) — onChangeCategory 미전달 시 미노출 */}
        <EstateItemActionsMenu
          itemId={itemId}
          onChangeCategory={onChangeCategory}
        />
        <button
          type="button"
          onClick={onToggleAdvanced}
          aria-expanded={advancedOpen}
          aria-controls={`estate-advanced-panel-${itemId}`}
          data-testid={`estate-advanced-panel-toggle-${itemId}`}
          title="고급 옵션 (평가 우선순위·추가 분류·§14 보조)"
          className={[
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
            "border border-slate-200 dark:border-slate-700",
            "transition-colors duration-150",
            advancedOpen
              ? "bg-slate-100 dark:bg-slate-800"
              : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
          ].join(" ")}
        >
          <Settings className="h-3.5 w-3.5" aria-hidden />
          <span>옵션{advancedBadgeCount > 0 ? ` (${advancedBadgeCount})` : ""}</span>
        </button>
        {!hideRemove && (
          <button
            type="button"
            onClick={onRemove}
            data-testid={`estate-card-remove-${itemId}`}
            aria-label="자산 삭제"
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <span className="inline-flex items-center gap-1">
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              삭제
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
