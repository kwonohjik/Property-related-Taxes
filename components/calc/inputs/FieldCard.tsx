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
  /**
   * 라벨을 입력 위로 올린 세로 배치(기본 false=라벨-좌/입력-우).
   * 다열 그리드 셀처럼 가로폭이 좁아 라벨-좌 배치가 입력을 압박할 때 사용.
   */
  stacked?: boolean;
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
  stacked = false,
}: FieldCardProps) {
  return (
    <div
      data-slot="field-card"
      data-disabled={disabled || undefined}
      className={cn(
        "rounded-lg border bg-card px-4 py-3",
        // stacked: 라벨 상단·입력 전폭(다열 그리드용). 기본: 라벨-좌/입력-우.
        // 라벨 칼럼 콘텐츠 기반 가변(auto 트랙 + 라벨 min-w 168 / max-w 240):
        // 짧은 라벨("별칭" 등)은 168px로 수축해 우측 입력폭을 확보하고, 긴 라벨(배지 포함)은
        // 240px까지 늘어 한 줄 유지·초과 시 240px 내 줄바꿈(좁은 편집 모달에서 입력 데이터 잘림 방지).
        // minmax(168,240)는 1fr 형제와 함께 쓰면 240 고정이 되어 불가 — 라벨 min/max로 제어(브라우저 실측 확인).
        // 모바일(sm 미만)은 grid-cols-1로 라벨이 입력 위에 올라가므로 min/max 미적용.
        stacked
          ? "grid gap-1.5"
          : "grid gap-2 sm:grid-cols-[auto_1fr] sm:items-start",
        disabled && "opacity-60",
        className
      )}
    >
      {label && (
        <label
          htmlFor={htmlFor}
          className={cn(
            "flex items-start gap-1 text-sm font-medium pt-1",
            // stacked: 전폭 라벨(min/max 미적용). 기본: 라벨-좌 정렬용 상단 패딩 + 폭 가변.
            !stacked && "sm:pt-2 sm:min-w-[168px] sm:max-w-[240px]"
          )}
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
