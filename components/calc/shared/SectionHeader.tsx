import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

export interface SectionHeaderProps {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  leading?: ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  leading,
  className,
}: SectionHeaderProps) {
  return (
    <div
      data-slot="section-header"
      className={cn("mb-3 border-b pb-2", className)}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          {leading ?? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
              aria-hidden
            />
          )}
          <span>{title}</span>
        </h3>
        {action && (
          <div className="flex items-center gap-2">{action}</div>
        )}
      </div>
      {description && (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
