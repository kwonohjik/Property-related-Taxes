"use client";

/**
 * AssetSection — 양도세 자산 카드 접기 섹션 컨테이너.
 *
 * 계획: docs/00-pm/transfer-asset-input-progressive-disclosure.plan.md §4-1
 * - tone 정적 Record (dynamic bg-${tone} 금지 — JIT purge 안전). CollapsibleHintCard HINT_CARD_TONE 컨벤션.
 * - 내부 블록의 원형 번호(h-5 w-5 text-[10px])와 구분되는 **굵은 제목 + 큰 번호 배지**(M1).
 * - 접힌 본문은 hidden print:block (인쇄 자동 펼침 — print-only-css-toggle).
 * - 상태(open)는 부모 로컬 state — useEffect→store 미러링 없음.
 * - a11y: 헤더 = <button aria-expanded>. forceOpen(검증 오류) 시 강제 펼침.
 */
import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";

export type AssetSectionTone = "sky" | "emerald" | "amber" | "slate" | "violet";

interface ToneClasses {
  card: string;
  border: string;
  badgeBg: string;
  badgeText: string;
  title: string;
}

const SECTION_TONE: Record<AssetSectionTone, ToneClasses> = {
  sky: {
    card: "bg-sky-50/40 dark:bg-sky-900/15",
    border: "border-sky-200 dark:border-sky-800",
    badgeBg: "bg-sky-200 dark:bg-sky-800",
    badgeText: "text-sky-800 dark:text-sky-100",
    title: "text-sky-900 dark:text-sky-100",
  },
  emerald: {
    card: "bg-emerald-50/40 dark:bg-emerald-900/15",
    border: "border-emerald-200 dark:border-emerald-800",
    badgeBg: "bg-emerald-200 dark:bg-emerald-800",
    badgeText: "text-emerald-800 dark:text-emerald-100",
    title: "text-emerald-900 dark:text-emerald-100",
  },
  amber: {
    card: "bg-amber-50/40 dark:bg-amber-900/15",
    border: "border-amber-200 dark:border-amber-800",
    badgeBg: "bg-amber-200 dark:bg-amber-800",
    badgeText: "text-amber-800 dark:text-amber-100",
    title: "text-amber-900 dark:text-amber-100",
  },
  slate: {
    card: "bg-slate-50/40 dark:bg-slate-800/20",
    border: "border-slate-200 dark:border-slate-700",
    badgeBg: "bg-slate-200 dark:bg-slate-700",
    badgeText: "text-slate-800 dark:text-slate-100",
    title: "text-slate-900 dark:text-slate-100",
  },
  violet: {
    card: "bg-violet-50/40 dark:bg-violet-900/15",
    border: "border-violet-200 dark:border-violet-800",
    badgeBg: "bg-violet-200 dark:bg-violet-800",
    badgeText: "text-violet-800 dark:text-violet-100",
    title: "text-violet-900 dark:text-violet-100",
  },
};

const STATUS_DOT: Record<"filled" | "empty", { glyph: string; cls: string }> = {
  filled: { glyph: "✓", cls: "text-emerald-600 dark:text-emerald-400" },
  empty: { glyph: "○", cls: "text-muted-foreground/50" },
};

interface AssetSectionProps {
  /** 섹션 번호 ①②③④⑤ */
  num: number;
  title: string;
  tone: AssetSectionTone;
  /** 접힘 헤더 라벨 (금액 없음 — asset-section-summary) */
  summary: string;
  status: "filled" | "empty";
  open: boolean;
  onToggle: () => void;
  /** 검증 오류 시 강제 펼침 (open 무시하고 항상 노출) */
  forceOpen?: boolean;
  children: ReactNode;
}

export function AssetSection({
  num,
  title,
  tone,
  summary,
  status,
  open,
  onToggle,
  forceOpen = false,
  children,
}: AssetSectionProps) {
  const t = SECTION_TONE[tone];
  const expanded = open || forceOpen;
  const dot = STATUS_DOT[status];
  return (
    <div data-asset-section={num} className={cn("rounded-lg border", t.card, t.border)}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold",
            t.badgeBg,
            t.badgeText,
          )}
        >
          {num}
        </span>
        <span className={cn("shrink-0 text-sm font-bold", t.title)}>{title}</span>
        <span className="ml-1 min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span>
        <span className={cn("shrink-0 text-xs", dot.cls)} aria-hidden>
          {dot.glyph}
        </span>
        {/* 상속세 탭과 동일한 펼치기/접기 버튼 모양 — 헤더가 button이므로 중첩 button 금지, span에 시각만 적용 */}
        <span className={expandToggleClass(tone)} aria-hidden>
          {expandToggleLabel(expanded)}
        </span>
      </button>
      <div className={cn("space-y-4 px-3 pb-3 pt-1", expanded ? "" : "hidden print:block")}>
        {children}
      </div>
    </div>
  );
}
