"use client";

import { cn } from "@/lib/utils";

/**
 * 단계별 완료 상태.
 * - "complete": 해당 단계의 필수 입력이 모두 충족됨 (emerald ✓)
 * - "attention": 사용자가 지나친(또는 건너뛴) 단계인데 필수 입력 누락 (amber !)
 * - "neutral": 아직 도달하지 않았거나 평가 보류 — 기존 번호 표시
 */
export type StepStatus = "complete" | "attention" | "neutral";

export interface StepIndicatorProps {
  steps: string[];
  current: number;
  /**
   * 단계 클릭 시 호출. 제공되면 단계 번호 원이 button으로 렌더되어 자유 이동 가능.
   * 미제공 시 기존처럼 표시 전용.
   */
  onStepClick?: (index: number) => void;
  /** root div에 추가 적용할 className (예: `!mb-0`로 기본 mb-6 override) */
  className?: string;
  /**
   * 단계별 완료/주의 상태 (선택). steps와 같은 길이의 배열.
   * 제공되면 원 안에 ✓(완료)·!(입력 필요)·번호(중립)를 색상과 함께 표시한다.
   * 미제공 시 기존 위치 기반(i<current=✓) 렌더를 그대로 유지한다(타 세목 폼 호환).
   */
  stepStatus?: StepStatus[];
}

const STATUS_CIRCLE_CLASS: Record<StepStatus, string> = {
  complete:
    "bg-emerald-500 border-emerald-500 text-white dark:bg-emerald-600 dark:border-emerald-600",
  attention:
    "bg-amber-50 border-amber-400 text-amber-600 dark:bg-amber-950/40 dark:border-amber-500 dark:text-amber-300",
  neutral: "", // 아래에서 current 여부로 결정
};

const STATUS_ARIA_SUFFIX: Record<StepStatus, string> = {
  complete: " (완료)",
  attention: " (입력 필요)",
  neutral: "",
};

export function StepIndicator({
  steps,
  current,
  onStepClick,
  className,
  stepStatus,
}: StepIndicatorProps) {
  const clickable = typeof onStepClick === "function";

  return (
    <div className={cn("flex items-center gap-1 mb-6", className)}>
      {steps.map((label, i) => {
        const status = stepStatus?.[i];
        const isCurrent = i === current;

        // 원 내부 색상·내용 결정.
        // stepStatus 미제공 시: 기존 위치 기반 렌더(하위 호환).
        // 제공 시: 상태별 색상 + current는 ring으로 "현재 위치" 항상 강조.
        let toneClass: string;
        let content: string;
        if (!status || status === "neutral") {
          toneClass = isCurrent
            ? "border-primary text-primary bg-background"
            : status === undefined && i < current
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/30 text-muted-foreground bg-background";
          content = status === undefined && i < current ? "✓" : `${i + 1}`;
        } else {
          toneClass = STATUS_CIRCLE_CLASS[status];
          content = status === "complete" ? "✓" : "!";
        }

        const circle = (
          <div
            data-testid={`step-circle-${i}`}
            data-status={status}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
              toneClass,
              // stepStatus 모드에서 현재 단계는 ring으로 "여기 있음" 강조
              status && isCurrent && "ring-2 ring-offset-1 ring-primary/40",
            )}
          >
            {content}
          </div>
        );

        // 연결선: stepStatus 모드면 완료 단계는 emerald, 아니면 기존 primary 진행 표시
        const connectorDone = status ? status === "complete" : i < current;

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(i)}
                  aria-label={`${label} 단계로 이동${status ? STATUS_ARIA_SUFFIX[status] : ""}`}
                  aria-current={isCurrent ? "step" : undefined}
                  className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  {circle}
                </button>
              ) : (
                circle
              )}
              <span
                className={cn(
                  "mt-1 text-[10px] font-medium whitespace-nowrap hidden sm:block",
                  isCurrent ? "text-primary" : "text-muted-foreground",
                  clickable && "cursor-pointer",
                )}
                onClick={clickable ? () => onStepClick?.(i) : undefined}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1 mx-1 transition-colors",
                  connectorDone
                    ? status
                      ? "bg-emerald-400 dark:bg-emerald-600"
                      : "bg-primary"
                    : "bg-muted-foreground/20",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
