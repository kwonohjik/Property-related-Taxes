"use client";

/**
 * Step4DeductionGroup — 상속세 Step 4(공제·세액공제) 접이식 그룹 카드.
 *
 * Step 4는 추가 공제 10여 종 + 세액공제·납부 방법까지 한 화면에 세로로 나열돼 매우 길다.
 * 해당하지 않는 그룹을 접어 폼을 짧게 만들 수 있도록 그룹 단위 disclosure를 제공한다.
 *
 * 설계 원칙:
 *  - controlled 모드(open + onToggle props 전달 시): 부모가 open 상태를 관리.
 *    uncontrolled 모드(props 미전달 시): 로컬 useState(defaultOpen) 사용. 하위 호환.
 *  - 기본값(defaultOpen=false): Step4 진입 시 전체 접힘 → 체크리스트 패널 + 그룹 헤더만 노출.
 *    데이터가 이미 있는 그룹은 부모가 open=true로 초기화해 자동 펼침.
 *  - 체크리스트 칩 클릭 시 해당 그룹 자동 펼침: 부모(Step4Deductions)가 controlled mode로 제어.
 *    ★ useEffect → state 미러링 금지 — 칩 onClick에서 직접 open 상태 set (feedback_useeffect_store_mirror_forbidden).
 *  - 인쇄 시 자동 펼침: 토글 헤더는 print:hidden, 본문은 `hidden print:block`으로 CSS-only
 *    처리(useEffect·isPrinting 상태 추적 금지 — print-only-css-toggle 정책).
 *  - tone 색조는 정적 Record 매핑(feedback_tailwind_static_tone_mapping — dynamic `bg-${tone}` 금지).
 */

import { useState, type ReactNode } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
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
  defaultOpen = false,
  open: controlledOpen,
  onToggle,
  testId,
  children,
}: {
  title: string;
  tone: Step4GroupTone;
  /** 그룹 내 입력값 존재 여부 — true면 헤더에 "입력됨" 배지 표시(접어도 보임). */
  hasData?: boolean;
  /**
   * uncontrolled 모드 초기값. defaultOpen=false (Step4 디폴트 접힘).
   * 데이터가 있는 그룹은 부모가 controlled mode(open=true)로 펼쳐 준다.
   */
  defaultOpen?: boolean;
  /**
   * controlled 모드 open 값. 전달하면 controlled mode 동작 — 내부 setState 무시.
   * 미전달 시 uncontrolled (defaultOpen 기반 로컬 useState).
   */
  open?: boolean;
  /**
   * controlled 모드 토글 콜백. controlled 모드에서 헤더 클릭 시 호출.
   */
  onToggle?: () => void;
  testId?: string;
  children: ReactNode;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  // controlled 모드: open prop 우선. uncontrolled: 로컬 state.
  const isOpen = controlledOpen !== undefined ? controlledOpen : localOpen;
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setLocalOpen((o) => !o);
    }
  };
  const t = TONE[tone];

  return (
    <div
      className={cn("rounded-lg border overflow-hidden", t.border)}
      data-testid={testId}
      data-open={isOpen}
    >
      {/* 토글 헤더 — 인쇄 시 숨김(본문이 자동 펼침되므로 중복 방지) */}
      <button
        type="button"
        onClick={handleToggle}
        aria-expanded={isOpen}
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
                "shrink-0 rounded-full px-2 py-0.5 text-micro font-medium",
                t.badge,
              )}
            >
              입력됨
            </span>
          )}
        </span>
        <span className={expandToggleClass(tone)}>{expandToggleLabel(isOpen)}</span>
      </button>

      {/* 본문 — 펼침 시 표시. 인쇄 시 접혀 있어도 항상 표시(print:block). */}
      <div className={cn("px-3 pb-3 pt-3 space-y-4", isOpen ? "block" : "hidden print:block")}>
        {/* 인쇄 전용 제목(헤더가 print:hidden이므로 인쇄본에 그룹명 노출) */}
        <p className={cn("hidden print:block text-sm font-semibold", t.title)}>{title}</p>
        {children}
      </div>
    </div>
  );
}
