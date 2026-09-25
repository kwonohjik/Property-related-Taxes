"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface WizardSidebarStep {
  label: string;
  description?: string;
  /**
   * 표식의 **색이 심각도를 말한다** — 같은 화면의 배너 관례(rose=오류 · amber=경고)와 맞춘다.
   *
   * - `"attention"`: 필수 입력 누락 = **차단 오류** — rose `!` («입력 필요»)
   * - `"warning"`: 진행은 되지만 확인이 필요 = **비차단 경고** — amber `!` («확인 필요»)
   *
   * ⚠️ 한 단계에 둘 다 있으면 **호출부가 `attention`을 고른다** — 차단 사유가 비차단 주의에
   *    가려지면 안 된다. `status`가 단일값이라 그 우선순위는 여기서 강제하지 못한다.
   *
   * ⚠️ **어떤 단계에 표식을 붙일지는 마법사마다 다르다.** 양도세는 «지나친 단계»만
   *    (`i < currentStep`), 판정은 «오류가 있는 모든 단계»를 표시한다 — 판정은 전진 점프가
   *    차단되므로(F-2) 미방문 단계의 `!`가 그 차단의 예고 구실을 한다. 여기서 통일하지 않는다.
   */
  status: "done" | "active" | "todo" | "attention" | "warning";
  onClick?: () => void;
}

export interface WizardSidebarSummaryItem {
  label: string;
  value: number | string | null;
  highlight?: boolean;
  unit?: string;
}

export interface WizardSidebarProps {
  steps: WizardSidebarStep[];
  summary?: WizardSidebarSummaryItem[];
  /** summary 배열 대신 렌더할 커스텀 요약 영역 (스택·목록형). 지정 시 summary 무시. */
  summaryContent?: ReactNode;
  title?: string;
  forceShow?: boolean;
  /** aside 클래스 override (기본 폭 w-64). tailwind-merge로 w-* 덮어씀. */
  className?: string;
}

function renderValue(value: number | string | null, unit?: string): string {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString() + (unit ?? "");
  return value;
}

function StepRow({ step }: { step: WizardSidebarStep }) {
  const baseClass = "w-full text-left rounded-md px-3 py-2 text-sm transition-colors";

  const content: ReactNode = (
    <span className="flex items-center gap-2">
      {step.status === "done" && (
        <span className="text-primary font-medium">✓</span>
      )}
      {step.status === "attention" && (
        <span
          className="text-rose-600 font-bold dark:text-rose-400"
          aria-label="입력 필요"
        >
          !
        </span>
      )}
      {/*
        글리프는 오류와 같은 `!`다 — 색과 aria-label로만 가른다. 두 상태 모두 「여기를 보라」는
        같은 행동을 요구하므로, 색을 못 보는 사용자에게도 전달되는 정보는 온전하다(심각도
        차이는 aria-label이 말한다). 별도 글리프를 만들면 ✓/! 두 글자뿐인 이 열이 어수선해진다.
      */}
      {step.status === "warning" && (
        <span
          className="text-amber-500 font-bold dark:text-amber-400"
          aria-label="확인 필요"
        >
          !
        </span>
      )}
      <span className={step.status === "todo" ? "text-muted-foreground" : undefined}>
        {step.label}
      </span>
    </span>
  );

  if (step.onClick) {
    return (
      <button
        type="button"
        onClick={step.onClick}
        aria-current={step.status === "active" ? "step" : undefined}
        className={cn(
          baseClass,
          "cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          step.status === "active"
            ? "bg-primary text-primary-foreground font-medium"
            : "hover:bg-muted/50"
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      aria-current={step.status === "active" ? "step" : undefined}
      className={cn(
        baseClass,
        step.status === "active"
          ? "bg-primary text-primary-foreground font-medium"
          : "text-muted-foreground"
      )}
    >
      {content}
    </div>
  );
}

function SummaryRow({ item }: { item: WizardSidebarSummaryItem }) {
  if (item.highlight) {
    return (
      <div className="flex items-baseline justify-between gap-2 border-t pt-2 text-sm font-semibold text-primary">
        <span>{item.label}</span>
        <span>{renderValue(item.value, item.unit)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{item.label}</span>
      <span>{renderValue(item.value, item.unit)}</span>
    </div>
  );
}

export function WizardSidebar({
  steps,
  summary,
  summaryContent,
  title,
  forceShow = false,
  className,
}: WizardSidebarProps) {
  return (
    <aside
      data-slot="wizard-sidebar"
      className={cn(
        "w-64 shrink-0 space-y-3",
        !forceShow && "hidden lg:block",
        "lg:sticky lg:top-20 lg:self-start",
        className
      )}
    >
      {title && (
        <h2 className="px-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {title}
        </h2>
      )}

      <nav aria-label="진행 단계" className="rounded-lg border bg-card p-2">
        <ul className="space-y-0.5" role="list">
          {steps.map((s, i) => (
            <li key={i}>
              <StepRow step={s} />
            </li>
          ))}
        </ul>
      </nav>

      {summaryContent ? (
        <div className="rounded-lg border bg-card px-4 py-3">{summaryContent}</div>
      ) : (
        summary && summary.length > 0 && (
          <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
            {summary.map((item, i) => (
              <SummaryRow key={i} item={item} />
            ))}
          </div>
        )
      )}
    </aside>
  );
}
