"use client";

/**
 * Step4DeductionGroup — 상속세 Step 4(공제·세액공제) 접이식 그룹 카드.
 *
 * Step 4는 추가 공제 10여 종 + 세액공제·납부 방법까지 한 화면에 세로로 나열돼 매우 길다.
 * 해당하지 않는 그룹을 접어 폼을 짧게 만들 수 있도록 그룹 단위 disclosure를 제공한다.
 *
 * 설계 원칙:
 *  - 기본 펼침(defaultOpen=true). 접힘으로 시작하면 그 필드를 직접 입력하는 다수 E2E 스펙이
 *    오버레이/미표시로 깨지므로, 첫 렌더는 항상 펼친 상태(회귀 0). 사용자가 필요 시 접는다.
 *  - 인쇄 시 자동 펼침: 토글 헤더는 print:hidden, 본문은 `hidden print:block`으로 CSS-only
 *    처리(useEffect·isPrinting 상태 추적 금지 — print-only-css-toggle 정책).
 *  - tone 색조는 정적 Record 매핑(feedback_tailwind_static_tone_mapping — dynamic `bg-${tone}` 금지).
 *  - 펼침 상태는 컴포넌트 로컬 useState. store 미러링 없음.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Step4GroupTone = "emerald" | "amber" | "violet" | "sky";

const TONE: Record<
  Step4GroupTone,
  { border: string; header: string; title: string; badge: string }
> = {
  emerald: {
    border: "border-emerald-200 dark:border-emerald-800",
    header: "bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/40",
    title: "text-emerald-800 dark:text-emerald-200",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300",
  },
  amber: {
    border: "border-amber-200 dark:border-amber-800",
    header: "bg-amber-50/70 hover:bg-amber-100/70 dark:bg-amber-950/20 dark:hover:bg-amber-950/40",
    title: "text-amber-800 dark:text-amber-200",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
  },
  violet: {
    border: "border-violet-200 dark:border-violet-800",
    header: "bg-violet-50/70 hover:bg-violet-100/70 dark:bg-violet-950/20 dark:hover:bg-violet-950/40",
    title: "text-violet-800 dark:text-violet-200",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300",
  },
  sky: {
    border: "border-sky-200 dark:border-sky-800",
    header: "bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-950/20 dark:hover:bg-sky-950/40",
    title: "text-sky-800 dark:text-sky-200",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300",
  },
};

export function Step4DeductionGroup({
  title,
  tone,
  hasData = false,
  defaultOpen = true,
  testId,
  children,
}: {
  title: string;
  tone: Step4GroupTone;
  /** 그룹 내 입력값 존재 여부 — true면 헤더에 "입력됨" 배지 표시(접어도 보임). */
  hasData?: boolean;
  defaultOpen?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const t = TONE[tone];

  return (
    <div
      className={cn("rounded-lg border overflow-hidden", t.border)}
      data-testid={testId}
      data-open={open}
    >
      {/* 토글 헤더 — 인쇄 시 숨김(본문이 자동 펼침되므로 중복 방지) */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors print:hidden",
          t.header,
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={cn("text-sm font-semibold truncate", t.title)}>{title}</span>
          {hasData && (
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                t.badge,
              )}
            >
              입력됨
            </span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 transition-transform",
            t.title,
            open ? "rotate-180" : "",
          )}
        />
      </button>

      {/* 본문 — 펼침 시 표시. 인쇄 시 접혀 있어도 항상 표시(print:block). */}
      <div className={cn("px-3 pb-3 pt-3 space-y-4", open ? "block" : "hidden print:block")}>
        {/* 인쇄 전용 제목(헤더가 print:hidden이므로 인쇄본에 그룹명 노출) */}
        <p className={cn("hidden print:block text-sm font-semibold", t.title)}>{title}</p>
        {children}
      </div>
    </div>
  );
}
