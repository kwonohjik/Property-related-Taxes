"use client";

/**
 * 소수점 숫자 입력 컴포넌트 — 면적(㎡)·연수 등 소수점이 필요한 필드 전용.
 *
 * ## CurrencyInput과의 차이
 * - CurrencyInput: 원(KRW) 정수 전용. 소수점을 제거해 면적 입력 불가.
 * - DecimalInput: 소수점 허용. 콤마 포맷 없음. 있는 그대로 표시.
 *
 * ## 사용 규칙 (CLAUDE.md 참조)
 * 소수점이 필요한 필드(면적㎡, 기간년수 등)에는 반드시 이 컴포넌트를 사용.
 * CurrencyInput에 소수점 값을 넣으면 소수점이 제거돼 버그 발생.
 */

import { useRef } from "react";
import { cn } from "@/lib/utils";

export interface DecimalInputProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  unit?: string;
  className?: string;
  /** 천단위 콤마 표시 (주식수·금액 등). 저장값은 콤마 없음. */
  thousandSeparator?: boolean;
  /** E2E·단위 테스트 셀렉터용 data-testid (내부 input에 전달) */
  "data-testid"?: string;
}

/** 소수점 유지하며 정수부에 천단위 콤마 적용. */
function formatDecimalWithCommas(value: string): string {
  if (!value) return "";
  const [intPart, decPart] = value.split(".");
  const intWithCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return decPart !== undefined ? `${intWithCommas}.${decPart}` : intWithCommas;
}

export function DecimalInput({
  value,
  onChange,
  placeholder = "숫자 입력",
  disabled = false,
  unit,
  className,
  thousandSeparator = false,
  "data-testid": dataTestId,
}: DecimalInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    // 콤마 제거 후 소수점 1개 + 숫자만 허용 (음수 제외)
    const cleaned = raw
      .replace(/,/g, "")                // 콤마 제거 (천단위 구분자)
      .replace(/[^0-9.]/g, "")          // 숫자·소수점 외 제거
      .replace(/^\./, "")               // 선행 소수점 제거
      .replace(/(\..*)\./g, "$1");      // 소수점 중복 제거
    onChange(cleaned);
  }

  const displayValue = thousandSeparator
    ? formatDecimalWithCommas(value ?? "")
    : (value ?? "");

  return (
    <div className={cn("relative", className)}>
      <input
        ref={inputRef}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        data-testid={dataTestId}
        className={cn(
          "w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
          unit ? "pr-10" : "pr-3",
        )}
      />
      {unit && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {unit}
        </span>
      )}
    </div>
  );
}

/** 문자열 → 숫자 변환 (parseAmount의 소수점 버전). undefined/null 안전. */
export function parseDecimal(value: string | undefined | null): number {
  if (value == null || value === "") return 0;
  const n = parseFloat(value.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
