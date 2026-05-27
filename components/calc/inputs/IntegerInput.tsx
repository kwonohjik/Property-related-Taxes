"use client";

/**
 * IntegerInput — 정수 카운트 입력 (주식 수 등). 천단위 콤마 포맷.
 *
 * CurrencyInput은 "원" 금액 전용 의미라 주식 수("주")에 부적합 → 별도 정수 입력.
 * 소수점 불가(parseInt). FieldCard children으로 사용하며 단위는 FieldCard unit에 둔다.
 */

import { cn } from "@/lib/utils";

/** "1,000" → 1000. 빈값·NaN → 0. */
export function parseInteger(value: string | undefined | null): number {
  if (value == null || value === "") return 0;
  const n = parseInt(value.replace(/,/g, ""), 10);
  return Number.isNaN(n) ? 0 : n;
}

export interface IntegerInputProps {
  value: number | undefined;
  onChange: (v: number) => void;
  placeholder?: string;
  id?: string;
  /** 외부 FieldCard 라벨이 있을 때 접근성 라벨 */
  ariaLabel?: string;
  className?: string;
}

export function IntegerInput({
  value,
  onChange,
  placeholder = "수량 입력",
  id,
  ariaLabel,
  className,
}: IntegerInputProps) {
  const display = value ? value.toLocaleString() : "";
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={display}
      onChange={(e) => onChange(parseInteger(e.target.value))}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}
