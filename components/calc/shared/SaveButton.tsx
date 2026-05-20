"use client";

/**
 * 세목 계산기 공통 "저장하기" 버튼
 *
 * 헤더(HomeButton ↔ ResetButton 사이)와 하단 내비게이션 우측에 배치하여
 * 현재 입력·결과를 IndexedDB 이력에 즉시 저장한다.
 *
 * variant:
 * - "outline" (기본): 헤더용. HomeButton / ResetButton과 동일 outline 스타일.
 * - "primary": 하단 내비게이션용. 다음/계산 버튼과 동일한 primary 스타일.
 */

import { Save } from "lucide-react";

interface SaveButtonProps {
  onSave: () => void;
  variant?: "outline" | "primary";
  disabled?: boolean;
  /** disabled 시 hover tooltip 문구 (브라우저 native title) */
  disabledReason?: string;
  label?: string;
  className?: string;
}

export function SaveButton({
  onSave,
  variant = "outline",
  disabled = false,
  disabledReason,
  label = "저장하기",
  className = "",
}: SaveButtonProps) {
  const outlineClass =
    "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed";

  const primaryClass =
    "flex-1 rounded-md border border-primary/30 bg-primary/10 text-primary py-2.5 text-sm font-medium hover:bg-primary/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5";

  return (
    <button
      type="button"
      onClick={onSave}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      className={(variant === "primary" ? primaryClass : outlineClass) + " " + className}
      aria-label="현재 입력 저장"
    >
      <Save className={variant === "primary" ? "h-4 w-4" : "h-3.5 w-3.5"} />
      {label}
    </button>
  );
}
