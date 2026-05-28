"use client";

/**
 * EstateItemActionsMenu — 자산 카드 헤더 ⋮ DropdownMenu
 *
 * Plan estate-card-followup-phase2 §FU-6 · Visual §4.1
 *
 * 위치: 헤더 우측 액션 영역 (⋮ → ⚙️ → 삭제 순)
 * 항목: 현재는 "카테고리 변경"만, 향후 "복제" 등 확장 가능
 */

import { MoreVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface EstateItemActionsMenuProps {
  itemId: string;
  onChangeCategory?: () => void;
}

export function EstateItemActionsMenu({
  itemId,
  onChangeCategory,
}: EstateItemActionsMenuProps) {
  if (!onChangeCategory) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="자산 카드 더보기 메뉴"
        data-testid={`estate-card-actions-menu-${itemId}`}
        className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 print:hidden inline-flex items-center"
      >
        <MoreVertical className="h-3.5 w-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuItem
          onClick={onChangeCategory}
          data-testid={`estate-card-category-change-${itemId}`}
        >
          카테고리 변경
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
