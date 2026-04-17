"use client";

/**
 * CurrencyInput — 원화 금액 입력 컴포넌트 (천 단위 콤마 자동)
 * 메모리 규칙: 모든 input에 onFocus={(e) => e.target.select()} 내장
 */

/** 숫자를 천 단위 콤마 포맷으로 변환 */
export function formatWithCommas(value: string): string {
  const num = value.replace(/[^0-9]/g, "");
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

export interface CurrencyInputProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  hideFormatted?: boolean;
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
  hideFormatted = false,
}: CurrencyInputProps) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium">
          {label} {required && <span className="text-destructive">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          value={formatWithCommas(value.replace(/,/g, ""))}
          onChange={(e) => onChange(e.target.value.replace(/,/g, ""))}
          onFocus={(e) => e.target.select()}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          원
        </span>
      </div>
      {!hideFormatted && value && parseAmount(value) > 0 && (
        <p className="text-xs text-muted-foreground">= {formatKRW(parseAmount(value))}</p>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
