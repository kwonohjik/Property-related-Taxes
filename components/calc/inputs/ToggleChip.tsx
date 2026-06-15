"use client";

/**
 * ToggleChip — 인라인 pill 형 boolean 토글 칩 (이미지 10 ExemptionChip 패턴 일반화)
 *
 * - 칩은 ON/OFF 선택만. 펼침(입력·라디오)은 칩 그룹 아래에 호출부가 별도 렌더.
 * - <button aria-pressed> + ✓ 체크박스 + 라벨. native checkbox 신규 금지 정책 준수.
 * - feedback_tailwind_static_tone_mapping: dynamic bg-${tone} 금지 → Record 정적 매핑.
 *
 * 참조: components/calc/exemption/ExemptionChecklistPanel.tsx (ExemptionChip)
 */

import { cn } from "@/lib/utils";

export type ChipTone = "sky" | "violet" | "amber" | "rose" | "emerald";

const CHIP_ON: Record<ChipTone, string> = {
  sky: "border-sky-300 bg-sky-100/80 text-sky-800 dark:border-sky-700 dark:bg-sky-900/40 dark:text-sky-200",
  violet:
    "border-violet-300 bg-violet-100/80 text-violet-800 dark:border-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  amber:
    "border-amber-300 bg-amber-100/80 text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  rose: "border-rose-300 bg-rose-100/80 text-rose-800 dark:border-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
  emerald:
    "border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const CHIP_OFF_HOVER: Record<ChipTone, string> = {
  sky: "hover:border-sky-300 hover:bg-sky-50/60",
  violet: "hover:border-violet-300 hover:bg-violet-50/60",
  amber: "hover:border-amber-300 hover:bg-amber-50/60",
  rose: "hover:border-rose-300 hover:bg-rose-50/60",
  emerald: "hover:border-emerald-300 hover:bg-emerald-50/60",
};

const CHECK_ON: Record<ChipTone, string> = {
  sky: "border-sky-500 bg-sky-500 text-white",
  violet: "border-violet-500 bg-violet-500 text-white",
  amber: "border-amber-500 bg-amber-500 text-white",
  rose: "border-rose-500 bg-rose-500 text-white",
  emerald: "border-emerald-500 bg-emerald-500 text-white",
};

const CHIP_BASE =
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none cursor-pointer";

const CHIP_OFF_BASE =
  "border-gray-200 bg-gray-50/80 text-gray-500 dark:border-gray-700 dark:bg-gray-800/30 dark:text-gray-400";

export interface ToggleChipProps {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  label: string;
  tone?: ChipTone;
  /** hover 툴팁 — 칩에 담지 못한 법령 설명 보존 */
  title?: string;
  disabled?: boolean;
  "data-testid"?: string;
}

export function ToggleChip({
  checked,
  onCheckedChange,
  label,
  tone = "sky",
  title,
  disabled = false,
  "data-testid": testId,
}: ToggleChipProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onCheckedChange(!checked)}
      disabled={disabled}
      aria-pressed={checked}
      title={title}
      data-testid={testId}
      className={cn(
        CHIP_BASE,
        checked ? CHIP_ON[tone] : cn(CHIP_OFF_BASE, CHIP_OFF_HOVER[tone]),
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] font-bold shrink-0",
          checked
            ? CHECK_ON[tone]
            : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800",
        )}
      >
        {checked && "✓"}
      </span>
      <span>{label}</span>
    </button>
  );
}
