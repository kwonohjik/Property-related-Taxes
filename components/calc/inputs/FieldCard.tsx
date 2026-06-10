"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface FieldCardProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: ReactNode;
  warning?: ReactNode;
  trailing?: ReactNode;
  unit?: string;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
  htmlFor?: string;
}

export function FieldCard({
  label,
  required = false,
  children,
  hint,
  warning,
  trailing,
  unit,
  badge,
  disabled = false,
  className,
  htmlFor,
}: FieldCardProps) {
  return (
    <div
      data-slot="field-card"
      data-disabled={disabled || undefined}
      className={cn(
        "rounded-lg border bg-card px-4 py-3",
        // 라벨 칼럼 240px — 라벨+배지(수동/자동 등)가 한 줄 유지 (이전 160px에서 8자+배지 라벨 줄바꿈 발생).
        // 모바일(sm 미만)은 grid-cols-1로 라벨이 입력 위에 올라가므로 영향 없음.
        "grid gap-2 sm:grid-cols-[240px_1fr] sm:items-start",
        disabled && "opacity-60",
        className
      )}
    >
      {label && (
        <label
          htmlFor={htmlFor}
          className="flex items-start gap-1 text-sm font-medium pt-1 sm:pt-2"
        >
          {required && (
            <span className="text-destructive" aria-hidden>
              *
            </span>
          )}
          <span className="leading-tight">{label}</span>
          {badge && <span className="ml-auto text-xs text-muted-foreground font-normal">{badge}</span>}
        </label>
      )}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">{children}</div>
          {trailing ? (
            <div className="shrink-0">{trailing}</div>
          ) : unit ? (
            <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
          ) : null}
        </div>
        {warning && (
          <p className="text-xs font-medium text-destructive">{warning}</p>
        )}
        {hint && (
          <p className="text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}
