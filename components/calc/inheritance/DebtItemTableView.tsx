"use client";

/**
 * DebtItemTableView — 채무·공과·장례비 요약 테이블 (행 클릭 → 편집 모달)
 *
 * debt-item-table-view.plan.md §4.
 * 행은 read-only 요약. 컬럼: 분류 · 채권자·내용 · 금액(우정렬) · 분배·옵션 배지 · 편집.
 * 분배 합계 일치 판정은 isHeirAllocationMatched 단일 출처 재사용
 * (dual-truth 회피 — feedback_ui_engine_dual_truth_avoidance).
 *
 * 증여세 무관 — 채무 협의분할은 상속세 전용(steps.tsx 단일 사용처).
 */

import { Settings } from "lucide-react";
import type {
  DebtItem,
  Heir,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import {
  heirShortLabel,
  isHeirAllocationMatched,
} from "./HeirAllocationInput";
import { CATEGORY_STYLES } from "./debt-category-meta";

// ============================================================
// 배지 derive (read-only — 실제 입력된 비기본 옵션만)
// ============================================================

type BadgeTone = "emerald" | "amber" | "rose" | "slate";

interface DebtBadge {
  key: string;
  label: string;
  tone: BadgeTone;
}

const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  emerald:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800",
  amber:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800",
  rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:border-rose-800",
  slate:
    "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-300 dark:border-slate-700",
};

/**
 * 행 배지 도출 — 실제 적용된 비기본 옵션만 표시 (자산 탭 isActiveData 정책 동형).
 * §22는 financial 기본 true가 노이즈이므로 명시 false("제외")일 때만 배지.
 */
export function resolveDebtBadges(item: DebtItem, heirs: Heir[]): DebtBadge[] {
  const badges: DebtBadge[] = [];

  // 협의분할 분배 + 합계 상태
  const allocs = item.heirAllocations ?? [];
  if (allocs.length > 0) {
    const first = heirs.find((h) => h.id === allocs[0].heirId);
    const firstLabel = first ? heirShortLabel(first) : "상속인";
    const rest = allocs.length - 1;
    const summary = rest > 0 ? `${firstLabel} 외 ${rest}명` : firstLabel;
    const matched = isHeirAllocationMatched(allocs, item.amount);
    badges.push({
      key: "allocation",
      label: matched ? `${summary} ✓` : `${summary} △`,
      tone: matched ? "emerald" : "amber",
    });
  }

  // 봉안시설 (장례비)
  if (item.category === "funeral" && item.isBongan === true) {
    badges.push({ key: "bongan", label: "봉안", tone: "emerald" });
  }

  // §22 차감 제외 (financial인데 명시 false)
  if (
    item.category === "financial" &&
    item.isFinancialDebtForDeduction === false
  ) {
    badges.push({ key: "section22", label: "§22 제외", tone: "rose" });
  }

  // Table C 입력됨
  if (item.creditorAddress || item.incurredDate) {
    badges.push({ key: "tableC", label: "Table C", tone: "slate" });
  }

  return badges;
}

function ReadonlyDebtBadge({ badge }: { badge: DebtBadge }) {
  return (
    <span
      className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full border ${BADGE_TONE_CLASSES[badge.tone]}`}
    >
      {badge.label}
    </span>
  );
}

// ============================================================
// 행
// ============================================================

interface DebtItemTableRowProps {
  item: DebtItem;
  isSelected: boolean;
  onSelect: () => void;
  heirs: Heir[];
}

function DebtItemTableRow({
  item,
  isSelected,
  onSelect,
  heirs,
}: DebtItemTableRowProps) {
  const style = CATEGORY_STYLES[item.category];
  const nameDisplay = item.name?.trim() || style.label;
  const badges = resolveDebtBadges(item, heirs);

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
      data-testid={`debt-table-row-${item.id}`}
    >
      {/* 분류 칩 */}
      <td className="pl-3 py-1.5 whitespace-nowrap">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${style.chipClass}`}
        >
          {style.label}
        </span>
      </td>
      {/* 채권자·내용 */}
      <td className="pl-2 py-1.5 text-xs font-medium">{nameDisplay}</td>
      {/* 금액 (우정렬 — amount-column-align) */}
      <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
        {item.amount > 0 ? (
          item.amount.toLocaleString()
        ) : (
          <span className="text-gray-400">미입력</span>
        )}
      </td>
      {/* 분배·옵션 배지 */}
      <td className="pl-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {badges.map((badge) => (
            <ReadonlyDebtBadge key={badge.key} badge={badge} />
          ))}
        </div>
      </td>
      {/* 편집 힌트 */}
      <td className="pr-3 py-1.5 text-right text-xs select-none whitespace-nowrap">
        {item.heirAllocations && item.heirAllocations.length > 0 && (
          <span className="inline-flex items-center gap-0.5 text-slate-400 mr-1.5">
            <Settings className="h-3 w-3" aria-hidden />
            {item.heirAllocations.length}
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

export interface DebtItemTableViewProps {
  items: DebtItem[];
  selectedItemId: string | null;
  onSelect: (id: string) => void;
  heirs: Heir[];
}

export function DebtItemTableView({
  items,
  selectedItemId,
  onSelect,
  heirs,
}: DebtItemTableViewProps) {
  if (items.length === 0) return null;

  return (
    <div
      className="overflow-x-auto"
      role="group"
      aria-label="채무·공과·장례비 목록"
    >
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">분류</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              채권자·내용
            </th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">금액</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">
              분배·옵션
            </th>
            <th className="w-16 py-2 text-right pr-3 text-gray-400 font-medium text-[10px]">
              편집
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <DebtItemTableRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              onSelect={() => onSelect(item.id)}
              heirs={heirs}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
