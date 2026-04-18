"use client";

import { cn } from "@/lib/utils";

export interface StepIndicatorProps {
  steps: string[];
  current: number;
  /**
   * 단계 클릭 시 호출. 제공되면 단계 번호 원이 button으로 렌더되어 자유 이동 가능.
   * 미제공 시 기존처럼 표시 전용.
   */
  onStepClick?: (index: number) => void;
}

export function StepIndicator({ steps, current, onStepClick }: StepIndicatorProps) {
  const clickable = typeof onStepClick === "function";

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((label, i) => {
        const circle = (
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-colors",
              i < current
                ? "bg-primary border-primary text-primary-foreground"
                : i === current
                  ? "border-primary text-primary bg-background"
                  : "border-muted-foreground/30 text-muted-foreground bg-background",
            )}
          >
            {i < current ? "✓" : i + 1}
          </div>
        );

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onStepClick?.(i)}
                  aria-label={`${label} 단계로 이동`}
                  aria-current={i === current ? "step" : undefined}
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
                  i === current ? "text-primary" : "text-muted-foreground",
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
                  i < current ? "bg-primary" : "bg-muted-foreground/20",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
