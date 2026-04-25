"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface WizardSidebarStep {
  label: string;
  description?: string;
  status: "done" | "active" | "todo";
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
  title?: string;
  forceShow?: boolean;
}

function renderValue(value: number | string | null, unit?: string): string {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString() + (unit ?? "원");
  return value;
}

function StepRow({ step }: { step: WizardSidebarStep }) {
  const baseClass = "w-full text-left rounded-md px-3 py-2 text-sm transition-colors";

  const content: ReactNode = (
    <span className="flex items-center gap-2">
      {step.status === "done" && (
        <span className="text-primary font-medium">✓</span>
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
  title,
  forceShow = false,
}: WizardSidebarProps) {
  return (
    <aside
      data-slot="wizard-sidebar"
      className={cn(
        "w-64 shrink-0 space-y-3",
        !forceShow && "hidden lg:block",
        "lg:sticky lg:top-20 lg:self-start"
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

      {summary && summary.length > 0 && (
        <div className="rounded-lg border bg-card px-4 py-3 space-y-2">
          {summary.map((item, i) => (
            <SummaryRow key={i} item={item} />
          ))}
        </div>
      )}
    </aside>
  );
}
