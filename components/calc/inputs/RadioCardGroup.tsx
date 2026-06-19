"use client";

/**
 * RadioCardGroup — 라디오 그룹 가시성 강화 공용 컴포넌트
 *
 * ToggleCard와 동일한 가시성 원칙:
 *  - 모든 옵션(미선택 포함)은 항상 tone 배경 유지 (회색 배경 금지)
 *  - 선택된 옵션은 ring·border 진하기·배경 진하기·title 색으로 강조
 *
 * layout:
 *  - "stack" (기본): 세로 카드 — 라벨·설명·trailing이 풍부할 때
 *  - "inline": 가로 컴팩트 — 라벨만 짧을 때 (예: yes/no/etc)
 *
 * tone 매핑은 ToggleCard와 동일.
 */

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import type { ToggleCardTone } from "./ToggleCard";

interface RadioCardClasses {
  /** 미선택 컨테이너 */
  itemOff: string;
  /** 선택됨 컨테이너 (has-[:checked]:) */
  itemOn: string;
  /** 선택됨 라벨 색 */
  titleOn: string;
  /** 라디오 accent */
  accent: string;
}

const TONES: Record<ToggleCardTone, RadioCardClasses> = {
  amber: {
    itemOff:
      "border-amber-200/70 bg-amber-50/70 hover:border-amber-300 dark:border-amber-800/40 dark:bg-amber-950/20",
    itemOn:
      "has-[:checked]:border-amber-300 has-[:checked]:bg-amber-100/70 has-[:checked]:ring-1 has-[:checked]:ring-amber-200/50 dark:has-[:checked]:border-amber-700/60 dark:has-[:checked]:bg-amber-950/40 dark:has-[:checked]:ring-amber-800/30",
    titleOn:
      "has-[:checked]:text-amber-900 has-[:checked]:font-semibold dark:has-[:checked]:text-amber-200",
    accent: "accent-amber-600",
  },
  rose: {
    itemOff:
      "border-rose-200/70 bg-rose-50/70 hover:border-rose-300 dark:border-rose-800/40 dark:bg-rose-950/20",
    itemOn:
      "has-[:checked]:border-rose-300 has-[:checked]:bg-rose-100/70 has-[:checked]:ring-1 has-[:checked]:ring-rose-200/50 dark:has-[:checked]:border-rose-700/60 dark:has-[:checked]:bg-rose-950/40 dark:has-[:checked]:ring-rose-800/30",
    titleOn:
      "has-[:checked]:text-rose-900 has-[:checked]:font-semibold dark:has-[:checked]:text-rose-200",
    accent: "accent-rose-600",
  },
  violet: {
    itemOff:
      "border-violet-200/70 bg-violet-50/70 hover:border-violet-300 dark:border-violet-800/40 dark:bg-violet-950/20",
    itemOn:
      "has-[:checked]:border-violet-300 has-[:checked]:bg-violet-100/70 has-[:checked]:ring-1 has-[:checked]:ring-violet-200/50 dark:has-[:checked]:border-violet-700/60 dark:has-[:checked]:bg-violet-950/40 dark:has-[:checked]:ring-violet-800/30",
    titleOn:
      "has-[:checked]:text-violet-900 has-[:checked]:font-semibold dark:has-[:checked]:text-violet-200",
    accent: "accent-violet-600",
  },
  emerald: {
    itemOff:
      "border-emerald-200/70 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-800/40 dark:bg-emerald-950/20",
    itemOn:
      "has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-100/70 has-[:checked]:ring-1 has-[:checked]:ring-emerald-200/50 dark:has-[:checked]:border-emerald-700/60 dark:has-[:checked]:bg-emerald-950/40 dark:has-[:checked]:ring-emerald-800/30",
    titleOn:
      "has-[:checked]:text-emerald-900 has-[:checked]:font-semibold dark:has-[:checked]:text-emerald-200",
    accent: "accent-emerald-600",
  },
  sky: {
    itemOff:
      "border-sky-200/70 bg-sky-50/70 hover:border-sky-300 dark:border-sky-800/40 dark:bg-sky-950/20",
    itemOn:
      "has-[:checked]:border-sky-300 has-[:checked]:bg-sky-100/70 has-[:checked]:ring-1 has-[:checked]:ring-sky-200/50 dark:has-[:checked]:border-sky-700/60 dark:has-[:checked]:bg-sky-950/40 dark:has-[:checked]:ring-sky-800/30",
    titleOn:
      "has-[:checked]:text-sky-900 has-[:checked]:font-semibold dark:has-[:checked]:text-sky-200",
    accent: "accent-sky-600",
  },
  fuchsia: {
    itemOff:
      "border-fuchsia-200/70 bg-fuchsia-50/70 hover:border-fuchsia-300 dark:border-fuchsia-800/40 dark:bg-fuchsia-950/20",
    itemOn:
      "has-[:checked]:border-fuchsia-300 has-[:checked]:bg-fuchsia-100/70 has-[:checked]:ring-1 has-[:checked]:ring-fuchsia-200/50 dark:has-[:checked]:border-fuchsia-700/60 dark:has-[:checked]:bg-fuchsia-950/40 dark:has-[:checked]:ring-fuchsia-800/30",
    titleOn:
      "has-[:checked]:text-fuchsia-900 has-[:checked]:font-semibold dark:has-[:checked]:text-fuchsia-200",
    accent: "accent-fuchsia-600",
  },
};

export interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
  /** 우측 슬롯 (세율 배지 등) */
  trailing?: ReactNode;
  /** 옵션 하단 힌트·경고 */
  hint?: ReactNode;
  disabled?: boolean;
  /** 라디오 input에 부여할 data-testid (E2E·단위 테스트 셀렉터용) */
  testId?: string;
}

export interface RadioCardGroupProps<T extends string> {
  name: string;
  options: RadioCardOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  tone?: ToggleCardTone;
  /** stack(기본): 세로 카드 / inline: 가로 컴팩트 */
  layout?: "stack" | "inline";
  /** stack 레이아웃 열 수 (반응형: 모바일은 항상 1열, sm↑부터 적용). 기본 1 */
  columns?: 1 | 2;
  className?: string;
}

export function RadioCardGroup<T extends string>({
  name,
  options,
  value,
  onChange,
  tone = "violet",
  layout = "stack",
  columns = 1,
  className,
}: RadioCardGroupProps<T>) {
  const t = TONES[tone];

  return (
    <div
      data-slot="radio-card-group"
      data-layout={layout}
      className={cn(
        layout === "inline"
          ? "flex flex-wrap gap-2"
          : columns === 2
            ? "grid grid-cols-1 sm:grid-cols-2 gap-2"
            : "space-y-2",
        className,
      )}
    >
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <label
            key={opt.value}
            data-checked={isSelected || undefined}
            data-disabled={opt.disabled || undefined}
            className={cn(
              "rounded-lg border transition-colors select-none",
              layout === "inline"
                ? "inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                : "flex items-start gap-3 p-3",
              t.itemOff,
              t.itemOn,
              t.titleOn,
              opt.disabled
                ? "cursor-not-allowed opacity-60"
                : "cursor-pointer",
            )}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={isSelected}
              disabled={opt.disabled}
              onChange={() => !opt.disabled && onChange(opt.value)}
              data-testid={opt.testId}
              className={cn(
                layout === "inline" ? "h-4 w-4 shrink-0" : "mt-0.5 h-4 w-4 shrink-0",
                t.accent,
              )}
            />
            {layout === "inline" ? (
              <span>{opt.label}</span>
            ) : (
              <div className="flex-1 min-w-0 space-y-0.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium leading-tight">
                    {opt.label}
                  </p>
                  {opt.trailing && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {opt.trailing}
                    </span>
                  )}
                </div>
                {opt.description && (
                  <p className="text-xs text-muted-foreground leading-snug">
                    {opt.description}
                  </p>
                )}
                {opt.hint && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
                    {opt.hint}
                  </p>
                )}
              </div>
            )}
          </label>
        );
      })}
    </div>
  );
}
