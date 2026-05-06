"use client";

/**
 * CurrencyInputWithLookup — 기준시가 자동조회 + 직접입력 통합 컴포넌트
 *
 * Phase 1: 직접입력만 활성화.
 * Phase 2: 국토부 공동주택가격 API 연동 예정.
 *
 * 사용처: RentalHousingExceptionSection B 시나리오 3-시점 기준시가 입력
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { cn } from "@/lib/utils";

export interface CurrencyInputWithLookupProps {
  /** 필드 라벨 */
  label: string;
  /** 현재 값 (원, 문자열) */
  value: string | undefined;
  /** 값 변경 콜백 */
  onChange: (v: string) => void;
  /** 자동조회 기준 연도 (Phase 2에서 활성화) */
  lookupYear?: number;
  /** 힌트 텍스트 */
  hint?: string;
  /** 필수 여부 */
  required?: boolean;
  className?: string;
}

/**
 * CurrencyInputWithLookup
 *
 * Phase 1 구현: 직접입력 + 비활성 자동조회 버튼 (tooltip 안내).
 * 자동조회 버튼은 Phase 2 국토부 공동주택가격 API 연동 전까지 disabled + tooltip.
 */
export function CurrencyInputWithLookup({
  label,
  value,
  onChange,
  lookupYear,
  hint,
  required = false,
  className,
}: CurrencyInputWithLookupProps) {
  const [inputMode, setInputMode] = useState<"manual" | "auto">("manual");

  // Phase 2에서 실제 API 호출로 대체
  const isAutoLookupPhase2 = false;

  function handleManualChange(v: string) {
    setInputMode("manual");
    onChange(v);
  }

  const modeLabel = inputMode === "auto" ? "자동조회 결과 (수정 가능)" : "수동입력";

  return (
    <FieldCard
      label={label}
      required={required}
      hint={hint}
      trailing={
        <div className="flex items-center gap-1">
          <span className={cn(
            "text-xs px-1.5 py-0.5 rounded",
            inputMode === "auto"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              : "bg-muted/60 text-muted-foreground",
          )}>
            {modeLabel}
          </span>
          <button
            type="button"
            disabled={!isAutoLookupPhase2}
            title={
              isAutoLookupPhase2
                ? `${lookupYear ?? ""}년 기준 공동주택가격 자동조회`
                : "Phase 2 — 국토부 공동주택가격 API 연동 예정"
            }
            className={cn(
              "text-xs px-2 py-1 rounded border transition-colors",
              isAutoLookupPhase2
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 cursor-pointer"
                : "border-muted-foreground/20 bg-muted/30 text-muted-foreground/50 cursor-not-allowed",
            )}
            onClick={() => {
              // Phase 2: API 호출 후 값 채우기 + setInputMode("auto")
            }}
          >
            자동조회
          </button>
        </div>
      }
      className={className}
    >
      <CurrencyInput
        label=""
        value={value ?? ""}
        onChange={handleManualChange}
        hideUnit
        placeholder="기준시가 입력 (원)"
      />
    </FieldCard>
  );
}
