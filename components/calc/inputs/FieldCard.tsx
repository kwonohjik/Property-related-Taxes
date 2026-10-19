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
  /** 검증 오류 → 입력칸 이동 앵커(`data-field`). 검증의 `ValidationIssue.field`와 같은 값 */
  field?: string;
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
  field,
}: FieldCardProps) {
  return (
    <div
      data-slot="field-card"
      data-field={field}
      data-disabled={disabled || undefined}
      className={cn(
        "rounded-lg border bg-card px-4 py-3",
        // stacked: 라벨 상단·입력 전폭(다열 그리드용). 기본: 라벨-좌/입력-우.
        // 라벨 칼럼 콘텐츠 기반 가변(auto 트랙 + 라벨 min-w 168 / max-w 240):
        // 짧은 라벨("별칭" 등)은 168px로 수축해 우측 입력폭을 확보하고, 긴 라벨(배지 포함)은
        // 240px까지 늘어 한 줄 유지·초과 시 240px 내 줄바꿈(좁은 편집 모달에서 입력 데이터 잘림 방지).
        // minmax(168,240)는 1fr 형제와 함께 쓰면 240 고정이 되어 불가 — 라벨 min/max로 제어(브라우저 실측 확인).
        // 모바일(sm 미만)은 라벨이 입력 위에 올라가므로 min/max 미적용.
        // sm 이상은 grid가 아니라 flex-wrap이다 — 입력의 **최소 폭**이 라벨 옆에 안 들어가면(카드가 좁은 다열 배치 등)
        // 본문이 라벨 아래로 내려간다. grid(auto_1fr)는 화면 폭만 보고 라벨-좌를 고정해, 330px 카드에서 날짜칸(약 150px)이
        // 122px 자리에 밀려 카드 밖으로 넘쳤다(768 전체 E2E 실측 2,319회 → 15회).
        // 배치를 className으로 덮어쓰는 호출부는 `grid sm:grid-cols-[…]`처럼 grid를 함께 넘긴다(cn이 flex를 대체).
        stacked
          ? "grid gap-1.5"
          : "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start",
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
      {/* min-w-0: grid 항목은 최소 폭이 콘텐츠 폭이라, 없으면 본문이 카드보다 넓어져 trailing이 카드 밖으로 나간다.
          trailing이 있으면 입력의 최소 폭(min-content)과 한 줄에 안 들어갈 때만 다음 줄로 내린다 —
          줄어드는 입력칸은 최소 폭이 작아 그대로 한 줄이고, 날짜·Select처럼 줄지 않는 입력만 배지가 내려간다
          (내리지 않으면 입력이 짓눌려 글자가 잘리거나 배지와 겹친다). */}
      <div className={cn("min-w-0 space-y-1.5", !stacked && "sm:flex-[1_1_min-content]")}>
        <div className={cn("flex items-center gap-2", trailing && "flex-wrap")}>
          <div className={cn("flex-1 min-w-0", trailing && "basis-[min-content]")}>{children}</div>
          {trailing ? (
            <div className="shrink-0 max-w-full">{trailing}</div>
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
