"use client";

/**
 * AutoSuggestBadge — Step4 자동 채움 제안 공용 위젯.
 *
 * 정책:
 *   - useEffect → store 미러링 금지 (mirror-pattern): "채우기" 클릭 시에만 set 호출
 *   - 자동 덮어쓰기 금지 (feedback_no_silent_apportion_fallback): 빈값일 때만 채움 권유
 *   - 인쇄 시 산식 자동 펼침 (print-only-css-toggle)
 *
 * 표시 분기:
 *   - currentValue === "" && isApplicable: 제안 + "채우기" 활성
 *   - currentValue === String(suggestion.value): "자동 채움 적용됨" + 되돌리기
 *   - currentValue !== "" && currentValue !== String(value): "현재 입력값과 다름" amber 경고
 *   - !isApplicable: 미렌더
 */

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { DeductionSuggestion } from "@/lib/calc/inheritance-deduction-suggest";

export interface AutoSuggestBadgeProps {
  suggestion: DeductionSuggestion;
  /** 현재 폼 입력값 (CurrencyInput의 value, "1,000,000" 또는 "") */
  currentValue: string;
  /** 채우기 클릭 시 호출 — 숫자를 콤마 포맷 없이 문자열로 전달 (CurrencyInput이 표시 시 포맷) */
  onApply: (value: string) => void;
  /** 필드 라벨 (예: "순 금융재산") */
  label: string;
  /** "되돌리기" 클릭 시 초기값(보통 "") */
  emptyValue?: string;
}

function parseAmountSafe(s: string): number {
  return Number(s.replace(/[^0-9-]/g, "")) || 0;
}

function formatKrw(n: number): string {
  return n.toLocaleString("ko-KR");
}

export function AutoSuggestBadge({
  suggestion,
  currentValue,
  onApply,
  label,
  emptyValue = "",
}: AutoSuggestBadgeProps) {
  const [open, setOpen] = useState(false);

  if (!suggestion.isApplicable) return null;

  const currentNum = parseAmountSafe(currentValue);
  const suggestedNum = suggestion.value;
  const isEmpty = currentValue.trim() === "";
  const isMatch = !isEmpty && currentNum === suggestedNum;
  const isMismatch = !isEmpty && !isMatch;

  // 상태별 카드 tone
  const toneClasses = isMatch
    ? "border-emerald-300 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-800"
    : isMismatch
      ? "border-amber-300 bg-amber-50/60 dark:bg-amber-950/30 dark:border-amber-800"
      : "border-dashed border-emerald-300 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800";

  const labelTone = isMismatch
    ? "text-amber-800 dark:text-amber-200"
    : "text-emerald-800 dark:text-emerald-200";

  return (
    <div className={`rounded-md border p-3 space-y-2 ${toneClasses}`}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="space-y-0.5">
          <p className={`text-xs font-semibold ${labelTone}`}>
            💡 자동 제안 — {label}
          </p>
          <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
            {formatKrw(suggestedNum)}원
            <span className="ml-2 text-micro font-normal text-gray-500">
              {suggestion.reason}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {suggestion.breakdown.length > 0 && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={expandToggleClass("emerald")}
            >
              {expandToggleLabel(open)} · 산식
            </button>
          )}
          {isEmpty && (
            <Button
              type="button"
              size="sm"
              variant="default"
              className="h-7 text-xs"
              onClick={() => onApply(String(suggestedNum))}
            >
              이 값으로 채우기
            </Button>
          )}
          {isMatch && (
            <button
              type="button"
              onClick={() => onApply(emptyValue)}
              className="text-micro text-gray-500 underline print:hidden"
            >
              되돌리기
            </button>
          )}
          {isMismatch && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => onApply(String(suggestedNum))}
            >
              제안값으로 변경
            </Button>
          )}
        </div>
      </div>

      {/* 산식 펼침 — 인쇄 시 자동 펼침 */}
      <div className={open ? "block" : "hidden print:block"}>
        <ul className="space-y-0.5 rounded bg-white/60 dark:bg-gray-900/40 p-2 text-caption text-gray-700 dark:text-gray-300">
          {suggestion.breakdown.map((line, i) => (
            <li key={i}>· {line}</li>
          ))}
        </ul>
      </div>

      {/* 안내 메시지 */}
      {suggestion.notes && suggestion.notes.length > 0 && (
        <ul className="space-y-0.5 text-micro text-amber-700 dark:text-amber-300">
          {suggestion.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {isMatch && (
        <p className="text-micro text-emerald-700 dark:text-emerald-300">
          ✓ 자동 채움 적용됨
        </p>
      )}
      {isMismatch && (
        <p className="text-micro text-amber-700 dark:text-amber-300">
          ⚠️ 현재 입력값({formatKrw(currentNum)}원)이 자동 제안값과 다릅니다.
        </p>
      )}
    </div>
  );
}
