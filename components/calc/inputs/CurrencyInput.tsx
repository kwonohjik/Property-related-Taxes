"use client";

import { useState, useEffect, useRef } from "react";

/** 숫자를 천 단위 콤마 포맷으로 변환 (소수점 앞 정수 부분만 사용) */
export function formatWithCommas(value: string): string {
  const intPart = value.split(".")[0];
  const num = intPart.replace(/[^0-9]/g, "");
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 콤마 제거 후 정수 반환 */
export function parseAmount(value: string): number {
  return parseInt(value.replace(/,/g, "") || "0", 10);
}

/** 원화 표시 (아라비아 숫자 + 천단위 콤마) */
export function formatKRW(amount: number): string {
  return amount.toLocaleString() + "원";
}

/** 외부 value(문자열, 소수점·콤마 포함 가능) → 순수 숫자 문자열 */
function toRawDigits(value: string | undefined): string {
  if (!value) return "";
  return value.split(".")[0].replace(/[^0-9]/g, "");
}

export interface CurrencyInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  disabled?: boolean;
}

export function CurrencyInput({
  label,
  value,
  onChange,
  placeholder = "금액 입력",
  required = false,
  hint,
  disabled = false,
}: CurrencyInputProps) {
  const [focused, setFocused] = useState(false);
  const [localRaw, setLocalRaw] = useState(toRawDigits(value));
  const inputRef = useRef<HTMLInputElement>(null);

  // 외부 value가 변경되면 로컬 raw 동기화 (단, 포커스 중에는 사용자 입력 보호)
  useEffect(() => {
    if (!focused) {
      setLocalRaw(toRawDigits(value));
    }
  }, [value, focused]);

  // 포커스 중에는 콤마 없이 raw 숫자만, 블러 시에는 천단위 콤마
  const displayValue = focused
    ? localRaw
    : formatWithCommas(localRaw);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/[^0-9]/g, "");
    setLocalRaw(raw);
    onChange(raw);
  }

  function handleFocus() {
    setFocused(true);
    // 포커스 전환 시점에 localRaw를 최신 외부 value와 맞춤
    setLocalRaw(toRawDigits(value));
    // select()는 SelectOnFocusProvider가 RAF로 처리
  }

  function handleBlur() {
    setFocused(false);
  }

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          원
        </span>
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
