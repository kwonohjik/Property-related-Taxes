"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * 숫자를 천 단위 콤마 포맷으로 변환 (소수점 앞 정수 부분만 사용).
 * allowNegative=true이면 선행 `-`를 보존 (음수 금액 표시용).
 */
export function formatWithCommas(value: string, allowNegative = false): string {
  const intPart = value.split(".")[0];
  const neg = allowNegative && intPart.trim().startsWith("-");
  const num = intPart.replace(/[^0-9]/g, "");
  const commas = num.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return neg ? (num ? `-${commas}` : "-") : commas;
}

/**
 * 콤마 제거 후 정수 반환. undefined/null 안전.
 * 음수 부호(`-`)는 보존하되, 파싱 불가(예: 전이 상태 `"-"`)는 0으로 가드 (NaN 전파 방지).
 */
export function parseAmount(value: string | undefined | null): number {
  if (value == null) return 0;
  const n = parseInt(value.replace(/,/g, "") || "0", 10);
  return Number.isNaN(n) ? 0 : n;
}

/** 원화 표시 (아라비아 숫자 + 천단위 콤마, "원" 단위 생략 — 사용자 정책 2026-05-03) */
export function formatKRW(amount: number): string {
  return amount.toLocaleString();
}

/**
 * 외부 value(문자열, 소수점·콤마 포함 가능) → 순수 숫자 문자열.
 * allowNegative=true이면 선행 `-`를 보존.
 */
function toRawDigits(value: string | undefined, allowNegative = false): string {
  if (!value) return "";
  const intPart = value.split(".")[0];
  const neg = allowNegative && intPart.trim().startsWith("-");
  const digits = intPart.replace(/[^0-9]/g, "");
  return neg ? (digits ? `-${digits}` : "-") : digits;
}

export interface CurrencyInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
  /** FieldCard 카드 모드 래핑 시 내부 "원" 단위 표시 숨김 (단위 중복 방지) */
  hideUnit?: boolean;
  /** 외부(FieldCard·테이블 좌측 셀)에 이미 라벨이 있을 때 입력 위 시각 라벨 숨김 (중복 방지). aria-label로 접근성은 보존 */
  hideLabel?: boolean;
  /** 음수 입력 허용 (선행 `-` 1개). 기본 false — 기존 사용처 동작 보존. (예: 비상장주식 결손 순손익·음수 순자산) */
  allowNegative?: boolean;
}

export function CurrencyInput({
  label,
  value,
  onChange,
  placeholder = "금액 입력",
  required = false,
  hint,
  disabled = false,
  hideUnit = false,
  hideLabel = false,
  allowNegative = false,
}: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [localRaw, setLocalRaw] = useState(toRawDigits(value, allowNegative));
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부 value가 변경되면 로컬 raw 동기화 (단, 포커스 중에는 사용자 입력 보호)
  /* eslint-disable react-hooks/set-state-in-effect -- 의도된 외부→로컬 sync. 포커스 가드로 cascading render 방지 */
  useEffect(() => {
    if (!focused) {
      setLocalRaw(toRawDigits(value, allowNegative));
    }
  }, [value, focused, allowNegative]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 포커스 중에는 콤마 없이 raw 숫자만, 블러 시에는 천단위 콤마
  const displayValue = focused
    ? localRaw
    : formatWithCommas(localRaw, allowNegative);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = allowNegative
      ? e.target.value.replace(/[^0-9-]/g, "").replace(/(?!^)-/g, "") // 선행 `-` 1개만 보존
      : e.target.value.replace(/[^0-9]/g, "");
    setLocalRaw(raw);
    onChange(raw);
  }

  function handleFocus() {
    setFocused(true);
    // 포커스 전환 시점에 localRaw를 최신 외부 value와 맞춤
    setLocalRaw(toRawDigits(value, allowNegative));
    // select()는 SelectOnFocusProvider가 RAF로 처리
  }

  function handleBlur() {
    setFocused(false);
  }

  return (
    <div className="space-y-1.5">
      {label && !hideLabel && (
        <label className="block text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          aria-label={hideLabel && label ? label : undefined}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={cn(
            "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
            hideUnit ? "pr-3" : "pr-8"
          )}
        />
        {!hideUnit && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            원
          </span>
        )}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
