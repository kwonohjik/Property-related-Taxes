"use client";

/**
 * DateInput — 연도(4자리) · 월(2자리) · 일(2자리) 분리 입력 컴포넌트
 *
 * - value / onChange: YYYY-MM-DD 문자열로 교환 (type="date"와 동일 인터페이스)
 * - 연도는 최대 4자리, 월·일은 자동 2자리 패딩
 * - 각 필드 입력 완료 시 다음 필드로 자동 포커스 이동
 * - 포커스 시 전체 선택 (select-on-focus)
 * - 내부 onChange로 촉발된 useEffect 동기화는 건너뜀
 *   (backspace로 일 필드가 비워질 때 연·월 필드가 초기화되는 버그 방지)
 */

import { useRef, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface DateInputProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
}

function parseDateStr(value: string): { year: string; month: string; day: string } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    // 선행 0 제거: "03" → "3"
    // 부모로부터 패딩된 값이 돌아와 로컬 입력 버퍼를 덮어쓰지 않도록 함
    return {
      year,
      month: String(parseInt(month, 10)),
      day: String(parseInt(day, 10)),
    };
  }
  return { year: "", month: "", day: "" };
}

function buildDateStr(year: string, month: string, day: string): string {
  if (year.length === 4 && month.length >= 1 && day.length >= 1) {
    const m = month.padStart(2, "0");
    const d = day.padStart(2, "0");
    return `${year}-${m}-${d}`;
  }
  return "";
}

export function DateInput({ value, onChange, className, disabled }: DateInputProps) {
  const parsed = parseDateStr(value);
  const [year, setYear] = useState(parsed.year);
  const [month, setMonth] = useState(parsed.month);
  const [day, setDay] = useState(parsed.day);

  const monthRef = useRef<HTMLInputElement>(null);
  const dayRef = useRef<HTMLInputElement>(null);

  /**
   * 내부에서 보낸 onChange 횟수 + 마지막 emit 값 추적.
   * - 카운터가 남아있고 외부 value === 마지막 emit 값 → 자기 자신의 콜백 → 동기화 건너뜀
   * - 외부 value !== 마지막 emit 값 → 부모가 클램핑/변환한 결과 → 강제 동기화
   * → backspace 케이스(빈 문자열) 보호 + 외부 클램핑 반영을 동시에 만족
   */
  const pendingInternal = useRef(0);
  const lastEmittedRef = useRef<string>(value);

  useEffect(() => {
    if (pendingInternal.current > 0) {
      pendingInternal.current -= 1;
      // 외부에서 emit한 값과 다르면 클램핑/변환된 것 → 강제 동기화
      if (value === lastEmittedRef.current) return;
    }
    const p = parseDateStr(value);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setYear(p.year);
    setMonth(p.month);
    setDay(p.day);
  }, [value]);

  /** onChange 를 호출하기 전에 내부 변경임을 표시 */
  function emitChange(built: string) {
    pendingInternal.current += 1;
    lastEmittedRef.current = built;
    onChange(built);
  }

  function handleYearChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    setYear(v);
    emitChange(buildDateStr(v, month, day));
    if (v.length === 4) monthRef.current?.focus();
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(v, 10);
    const corrected = v.length === 2 && num > 12 ? "12" : v;
    setMonth(corrected);
    emitChange(buildDateStr(year, corrected, day));
    if (corrected.length === 2) dayRef.current?.focus();
  }

  function handleDayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, "").slice(0, 2);
    const num = parseInt(v, 10);
    const corrected = v.length === 2 && num > 31 ? "31" : v;
    setDay(corrected);
    emitChange(buildDateStr(year, month, corrected));
  }

  const baseInput =
    "w-full border-0 bg-transparent text-sm text-center focus:outline-none focus:ring-0 tabular-nums";

  return (
    <div
      className={cn(
        "flex items-center rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      <input
        type="text"
        inputMode="numeric"
        placeholder="YYYY"
        maxLength={4}
        value={year}
        onChange={handleYearChange}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        className={cn(baseInput, "w-12")}
        aria-label="연도"
      />
      <span className="text-muted-foreground select-none">-</span>
      <input
        ref={monthRef}
        type="text"
        inputMode="numeric"
        placeholder="MM"
        maxLength={2}
        value={month}
        onChange={handleMonthChange}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        className={cn(baseInput, "w-8")}
        aria-label="월"
      />
      <span className="text-muted-foreground select-none">-</span>
      <input
        ref={dayRef}
        type="text"
        inputMode="numeric"
        placeholder="DD"
        maxLength={2}
        value={day}
        onChange={handleDayChange}
        onFocus={(e) => e.target.select()}
        disabled={disabled}
        className={cn(baseInput, "w-8")}
        aria-label="일"
      />
    </div>
  );
}
