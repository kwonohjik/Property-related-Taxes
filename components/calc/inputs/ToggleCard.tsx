"use client";

/**
 * ToggleCard — 분기 토글 가시성 강화 공용 컴포넌트
 *
 * 목적: 모드/분기 토글의 ON/OFF 상태를 카드 전체 색조로 한눈에 인지.
 *
 * variant:
 *  - "card" (기본): 풀 카드. checked === true 일 때 children 펼침.
 *  - "chip": 라벨 옆 인라인 칩. children 없음.
 *
 * tone (활성 색조):
 *  - "amber"   취득·분리계산 모드 (겸용주택, 신축, PHD, 토지/건물 분리)
 *  - "rose"    지역·지정 정보   (수도권, 조정대상지역)
 *  - "violet"  거주·자격 정보
 *  - "emerald" 양도시점 정보
 *  - "sky"     면적·규모 정보
 *  - "fuchsia" 취득 후 추가 이벤트 (증축·용도변경 등 사례 33·35 계열)
 *
 * 색상 가이드: components/calc/CLAUDE.md "다-섹션 입력 폼 — 색상 카드 + 섹션 번호 패턴" 준수.
 */

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export type ToggleCardTone = "amber" | "sky" | "emerald" | "violet" | "rose" | "fuchsia";

interface ToneClasses {
  /** 컨테이너 ON 상태 (border + bg + ring) */
  containerOn: string;
  /** 컨테이너 OFF 상태 */
  containerOff: string;
  /** 칩(chip) ON 상태 */
  chipOn: string;
  /** 칩 OFF 상태 */
  chipOff: string;
  /** ON 시 title 색 */
  titleOn: string;
  /** ON 시 description 색 */
  descOn: string;
  /** 펼침 영역 좌측 인디케이터 */
  expandBorder: string;
}

/**
 * 가시성 원칙: OFF 상태에도 tone 배경색을 항상 유지하여 토글 컨트롤의 존재가
 * 한눈에 보이도록 한다. ON/OFF 구분은 (1) Switch thumb 위치, (2) border/ring 진하기,
 * (3) title 색·굵기로 처리한다.
 */
const TONES: Record<ToggleCardTone, ToneClasses> = {
  amber: {
    containerOn:
      "border-amber-300 bg-amber-50/70 ring-1 ring-amber-200/50 dark:border-amber-700/60 dark:bg-amber-950/30 dark:ring-amber-800/30",
    containerOff:
      "border-amber-200/70 bg-amber-50/70 hover:border-amber-300 dark:border-amber-800/40 dark:bg-amber-950/20",
    chipOn:
      "border-amber-300 bg-amber-100/70 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
    chipOff:
      "border-amber-200/70 bg-amber-50/70 text-amber-800/80 hover:border-amber-300 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300/80",
    titleOn: "text-amber-900 dark:text-amber-200",
    descOn: "text-amber-700 dark:text-amber-400",
    expandBorder: "border-amber-200 dark:border-amber-800/60",
  },
  rose: {
    containerOn:
      "border-rose-300 bg-rose-50/70 ring-1 ring-rose-200/50 dark:border-rose-700/60 dark:bg-rose-950/30 dark:ring-rose-800/30",
    containerOff:
      "border-rose-200/70 bg-rose-50/70 hover:border-rose-300 dark:border-rose-800/40 dark:bg-rose-950/20",
    chipOn:
      "border-rose-300 bg-rose-100/70 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-200",
    chipOff:
      "border-rose-200/70 bg-rose-50/70 text-rose-800/80 hover:border-rose-300 dark:border-rose-800/40 dark:bg-rose-950/20 dark:text-rose-300/80",
    titleOn: "text-rose-900 dark:text-rose-200",
    descOn: "text-rose-700 dark:text-rose-400",
    expandBorder: "border-rose-200 dark:border-rose-800/60",
  },
  violet: {
    containerOn:
      "border-violet-300 bg-violet-50/70 ring-1 ring-violet-200/50 dark:border-violet-700/60 dark:bg-violet-950/30 dark:ring-violet-800/30",
    containerOff:
      "border-violet-200/70 bg-violet-50/70 hover:border-violet-300 dark:border-violet-800/40 dark:bg-violet-950/20",
    chipOn:
      "border-violet-300 bg-violet-100/70 text-violet-900 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-200",
    chipOff:
      "border-violet-200/70 bg-violet-50/70 text-violet-800/80 hover:border-violet-300 dark:border-violet-800/40 dark:bg-violet-950/20 dark:text-violet-300/80",
    titleOn: "text-violet-900 dark:text-violet-200",
    descOn: "text-violet-700 dark:text-violet-400",
    expandBorder: "border-violet-200 dark:border-violet-800/60",
  },
  emerald: {
    containerOn:
      "border-emerald-300 bg-emerald-50/70 ring-1 ring-emerald-200/50 dark:border-emerald-700/60 dark:bg-emerald-950/30 dark:ring-emerald-800/30",
    containerOff:
      "border-emerald-200/70 bg-emerald-50/70 hover:border-emerald-300 dark:border-emerald-800/40 dark:bg-emerald-950/20",
    chipOn:
      "border-emerald-300 bg-emerald-100/70 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200",
    chipOff:
      "border-emerald-200/70 bg-emerald-50/70 text-emerald-800/80 hover:border-emerald-300 dark:border-emerald-800/40 dark:bg-emerald-950/20 dark:text-emerald-300/80",
    titleOn: "text-emerald-900 dark:text-emerald-200",
    descOn: "text-emerald-700 dark:text-emerald-400",
    expandBorder: "border-emerald-200 dark:border-emerald-800/60",
  },
  sky: {
    containerOn:
      "border-sky-300 bg-sky-50/70 ring-1 ring-sky-200/50 dark:border-sky-700/60 dark:bg-sky-950/30 dark:ring-sky-800/30",
    containerOff:
      "border-sky-200/70 bg-sky-50/70 hover:border-sky-300 dark:border-sky-800/40 dark:bg-sky-950/20",
    chipOn:
      "border-sky-300 bg-sky-100/70 text-sky-900 dark:border-sky-700/60 dark:bg-sky-950/40 dark:text-sky-200",
    chipOff:
      "border-sky-200/70 bg-sky-50/70 text-sky-800/80 hover:border-sky-300 dark:border-sky-800/40 dark:bg-sky-950/20 dark:text-sky-300/80",
    titleOn: "text-sky-900 dark:text-sky-200",
    descOn: "text-sky-700 dark:text-sky-400",
    expandBorder: "border-sky-200 dark:border-sky-800/60",
  },
  fuchsia: {
    containerOn:
      "border-fuchsia-300 bg-fuchsia-50/70 ring-1 ring-fuchsia-200/50 dark:border-fuchsia-700/60 dark:bg-fuchsia-950/30 dark:ring-fuchsia-800/30",
    containerOff:
      "border-fuchsia-200/70 bg-fuchsia-50/70 hover:border-fuchsia-300 dark:border-fuchsia-800/40 dark:bg-fuchsia-950/20",
    chipOn:
      "border-fuchsia-300 bg-fuchsia-100/70 text-fuchsia-900 dark:border-fuchsia-700/60 dark:bg-fuchsia-950/40 dark:text-fuchsia-200",
    chipOff:
      "border-fuchsia-200/70 bg-fuchsia-50/70 text-fuchsia-800/80 hover:border-fuchsia-300 dark:border-fuchsia-800/40 dark:bg-fuchsia-950/20 dark:text-fuchsia-300/80",
    titleOn: "text-fuchsia-900 dark:text-fuchsia-200",
    descOn: "text-fuchsia-700 dark:text-fuchsia-400",
    expandBorder: "border-fuchsia-200 dark:border-fuchsia-800/60",
  },
};

export interface ToggleCardProps {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  /** 굵은 라벨 (예: "겸용주택 분리계산") */
  title: string;
  /** 한 줄 보조 설명 (예: "주택+상가 복합건물, §160①단서") */
  description?: ReactNode;
  /** 활성 시 색조. 기본 amber. */
  tone?: ToggleCardTone;
  /** 펼침 영역 — checked 일 때만 렌더 (variant="card" 전용) */
  children?: ReactNode;
  /** 비활성 사유. disabled 시 회색 톤 + 클릭 차단. */
  disabled?: boolean;
  /** card(기본): 풀 카드 / chip: 인라인 칩 */
  variant?: "card" | "chip";
  /** card variant 사이즈. sm: padding 축소, 텍스트 축소 */
  size?: "default" | "sm";
  /** 우측 끝 보조 슬롯 (Switch 옆 — 정보 모달 버튼 등) */
  trailing?: ReactNode;
  className?: string;
  /** 비활성화 사유 안내 (disabled 시 description 대신 표시) */
  disabledReason?: ReactNode;
}

export function ToggleCard({
  checked,
  onCheckedChange,
  title,
  description,
  tone = "amber",
  children,
  disabled = false,
  variant = "card",
  size = "default",
  trailing,
  className,
  disabledReason,
}: ToggleCardProps) {
  const t = TONES[tone];
  const handleChange = disabled ? undefined : onCheckedChange;

  if (variant === "chip") {
    const chipDescription =
      disabled && disabledReason ? disabledReason : description;
    return (
      <label
        data-slot="toggle-card"
        data-variant="chip"
        data-checked={checked || undefined}
        data-disabled={disabled || undefined}
        title={
          disabled && typeof disabledReason === "string"
            ? disabledReason
            : undefined
        }
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition-colors select-none",
          checked ? t.chipOn : t.chipOff,
          disabled
            ? "cursor-not-allowed opacity-60"
            : "cursor-pointer",
          className,
        )}
      >
        <Switch
          size="sm"
          checked={checked}
          onCheckedChange={handleChange}
          disabled={disabled}
        />
        <span className={cn("font-medium", checked && t.titleOn)}>
          {title}
        </span>
        {chipDescription && (
          <span className={cn("text-xs", checked ? t.descOn : "text-muted-foreground")}>
            {chipDescription}
          </span>
        )}
        {trailing}
      </label>
    );
  }

  // variant === "card"
  const padding = size === "sm" ? "px-3 py-2" : "px-4 py-3";

  return (
    <div
      data-slot="toggle-card"
      data-variant="card"
      data-checked={checked || undefined}
      data-disabled={disabled || undefined}
      className={cn(
        "rounded-lg border transition-colors",
        padding,
        disabled
          ? "border-border bg-muted/40 opacity-70"
          : checked
            ? t.containerOn
            : t.containerOff,
        className,
      )}
    >
      <label
        className={cn(
          "flex items-center justify-between gap-3 select-none",
          disabled ? "cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "font-semibold leading-tight",
              size === "sm" ? "text-sm" : "text-sm sm:text-base",
              checked && !disabled && t.titleOn,
            )}
          >
            {title}
          </div>
          {(disabled && disabledReason ? disabledReason : description) && (
            <div
              className={cn(
                "mt-0.5 text-xs leading-snug",
                disabled
                  ? "text-muted-foreground"
                  : checked
                    ? t.descOn
                    : "text-muted-foreground",
              )}
            >
              {disabled && disabledReason ? disabledReason : description}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {trailing}
          <Switch
            size={size === "sm" ? "sm" : "default"}
            checked={checked}
            onCheckedChange={handleChange}
            disabled={disabled}
          />
        </div>
      </label>

      {checked && children && (
        <div
          className={cn(
            "mt-3 ml-1 border-l-2 pl-3 space-y-3",
            t.expandBorder,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}
