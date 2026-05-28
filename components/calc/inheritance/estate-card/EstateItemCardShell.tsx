"use client";

/**
 * EstateItemCardShell — 자산 카드 외곽 컨테이너 + collapse
 *
 * Plan estate-card-followup §FU-3 · Design §5.1 · Visual §3
 *
 * 정책 (D2-X1):
 *   - header·body slot 분리 (children 단일 prop 아님)
 *   - collapse 시 body는 hidden·print:block — local state 보존(unmount 0)
 *   - data-card-body 속성 (UV-4) — selector 견고화
 *   - collapseEnabled = totalAssetCount >= 5 (Plan §FU-3)
 *   - ⚙️ 클릭 시 collapse 자동 해제는 호출자(PropertyValuationForm) 책임
 */

import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";
import { useCollapseState } from "./useCollapseState";

export interface EstateItemCardShellProps {
  itemId: string;
  /** 자산 총 개수 — 5 이상이면 collapse 토글 노출 */
  collapseEnabled: boolean;
  header: ReactNode;
  body: ReactNode;
  /** 외부에서 collapsed 상태를 읽고 싶을 때 (예: ⚙️ 클릭으로 자동 해제) */
  onCollapseChange?: (collapsed: boolean) => void;
}

export function EstateItemCardShell({
  itemId,
  collapseEnabled,
  header,
  body,
  onCollapseChange,
}: EstateItemCardShellProps) {
  const [collapsed, setCollapsed] = useCollapseState(itemId);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      onCollapseChange?.(next);
      return next;
    });
  };

  return (
    <div
      data-testid={`estate-card-shell-${itemId}`}
      data-collapsed={collapsed}
      className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900"
    >
      {header}
      {collapseEnabled && (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "카드 펼치기" : "카드 접기"}
          data-testid={`estate-card-collapse-toggle-${itemId}`}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 print:hidden"
        >
          {collapsed ? (
            <>
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              펼치기
            </>
          ) : (
            <>
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
              접기
            </>
          )}
        </button>
      )}
      <div
        data-card-body
        data-collapsed-hidden={collapsed || undefined}
        className={collapsed ? "hidden print:block" : "block"}
      >
        {body}
      </div>
    </div>
  );
}
