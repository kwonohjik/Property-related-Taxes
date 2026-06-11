"use client";

/**
 * InheritanceMobileSummaryBar — 모바일 전용 접이식 합계 미니바 (⑧).
 *
 * 데스크톱은 좌측 sticky 전체 사이드바(InheritanceSidebar)를 그대로 쓰고,
 * 모바일(<lg)에서는 긴 Step 4를 스크롤할 때 합계가 시야에서 사라지는 문제를 해결하기 위해
 * StepIndicator sticky 바 안에 들어가는 1줄 미니바를 노출한다.
 *
 * 설계:
 *  - 접힘(기본): 헤드라인 1줄 — 과세가액(계산 가능 시) 우선, 없으면 총상속재산 + 펼침 셰브론.
 *  - 펼침: 동일한 InheritanceSidebar를 그대로 렌더(단일 출처 — 합계 산식 중복 0, dual-truth 회피).
 *  - 표시 게이트: 입력 전(합계 0·result 없음)에는 미표시 — 사이드바와 동일 조건.
 *  - `lg:hidden print:hidden`: 데스크톱·인쇄는 전체 사이드바가 담당.
 *  - 펼침 상태는 컴포넌트 로컬 useState (store 미러링 없음).
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  computeInheritanceSummary,
  type InheritanceSummaryFormInput,
} from "@/lib/stores/inheritance-summary";
import type { InheritanceTaxResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import { InheritanceSidebar } from "./InheritanceSidebar";

export function InheritanceMobileSummaryBar({
  form,
  result,
}: {
  form: InheritanceSummaryFormInput;
  result: InheritanceTaxResult | null;
}) {
  const [open, setOpen] = useState(false);
  const summary = useMemo(
    () => computeInheritanceSummary(form, result),
    [form, result],
  );

  // 사이드바와 동일한 표시 게이트 — 입력 전에는 미니바 미노출
  const hasAnyInput = summary.totalEstate > 0 || summary.priorGiftTotal > 0;
  if (!hasAnyInput && !result) return null;

  // 헤드라인: 과세가액(② 계산 가능) 우선, 없으면 총상속재산(①)
  const showTaxable = summary.taxableEstateValue > 0;
  const headlineLabel = showTaxable ? "상속세 과세가액" : "총상속재산";
  const headlineValue = showTaxable
    ? summary.taxableEstateValue
    : summary.totalEstate;

  return (
    <div className="mt-2 lg:hidden print:hidden" data-testid="inheritance-mobile-summary">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`합계 미리보기 ${open ? "접기" : "펼치기"}`}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50/70 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/30"
      >
        <span className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
          {headlineLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="font-mono text-sm font-bold tabular-nums text-indigo-700 dark:text-indigo-300">
            {formatKRW(headlineValue)}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-indigo-700 transition-transform dark:text-indigo-300",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {/* 펼침 — 전체 사이드바 재사용(단일 출처). 최대 높이 제한 + 내부 스크롤. */}
      {open && (
        <div className="mt-2 max-h-[55vh] overflow-y-auto">
          <InheritanceSidebar form={form} result={result} />
        </div>
      )}
    </div>
  );
}
