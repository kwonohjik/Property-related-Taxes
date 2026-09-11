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

interface IntegerInputBaseProps {
  value: number | undefined;
  placeholder?: string;
  id?: string;
  /** 외부 FieldCard 라벨이 있을 때 접근성 라벨 */
  ariaLabel?: string;
  className?: string;
  /**
   * 🔴 IG-094: 빈 입력을 `0`이 아니라 `undefined`로 올린다.
   *
   * 기본 동작은 빈 문자열을 `0`으로 바꿔 올리고, 표시는 `value ? … : ""`라 **0을 빈칸으로 그린다**.
   * 그래서 「빈칸 → silent 0」을 막으려고 `=== undefined` 센티널 가드를 둔 화면에서는,
   * 사용자가 한 번 입력했다가 지우면 상태는 `0`·화면은 빈칸이 되어 가드가 그대로 통과한다
   * (센티널은 「한 번도 손대지 않은」 초기 상태에서만 유지된다).
   * 이 모드에서는 `0`도 정당한 입력이므로 표시에서 빈칸과 구별한다.
   */
  allowEmpty?: boolean;
}

/**
 * `allowEmpty`에 따라 onChange가 undefined를 낼 수 있는지 **타입으로** 갈린다 —
 * 기존 호출부(allowEmpty 미지정)는 종전 시그니처 그대로다.
 */
export type IntegerInputProps =
  | (IntegerInputBaseProps & { allowEmpty?: false; onChange: (v: number) => void })
  | (IntegerInputBaseProps & { allowEmpty: true; onChange: (v: number | undefined) => void });

export function IntegerInput({
  value,
  onChange,
  placeholder = "수량 입력",
  id,
  ariaLabel,
  className,
  allowEmpty = false,
}: IntegerInputProps) {
  const display = allowEmpty
    ? value != null
      ? value.toLocaleString()
      : ""
    : value
      ? value.toLocaleString()
      : "";
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={display}
      onChange={(e) => {
        if (allowEmpty && e.target.value.trim() === "") {
          (onChange as (v: number | undefined) => void)(undefined);
          return;
        }
        onChange(parseInteger(e.target.value));
      }}
      placeholder={placeholder}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    />
  );
}
