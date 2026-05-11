"use client";

/**
 * TransferTaxResultView 보조 헬퍼·소형 컴포넌트
 *
 * TransferTaxResultView.tsx의 800줄 정책 준수를 위해
 * Row 컴포넌트·printScoped·formatRate 등을 sibling으로 분리.
 */

import { cn } from "@/lib/utils";

// ── 인쇄 헬퍼 ──────────────────────────────────────────────────

/** 분리 인쇄 트리거. */
export function printScoped(
  scope:
    | "form-table"
    | "full"
    | "calculation"
    | "phd"
    | "split-detail"
    | "steps"
    | "detailed-statement",
) {
  if (typeof document === "undefined") return;
  document.body.dataset.printScope = scope;
  const cleanup = () => {
    delete document.body.dataset.printScope;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => window.print(), 0);
}

// ── 포맷 ───────────────────────────────────────────────────────

export function formatRate(rate: number): string {
  return `${(rate * 100).toFixed(0)}%`;
}

// ── Row 헬퍼 ──────────────────────────────────────────────────

/** 결과 표의 단일 행 (label + value 2-cell) */
export function Row({
  label,
  value,
  sub = false,
  highlight = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
}) {
  return (
    <tr className={cn(highlight && "bg-muted/50 font-semibold")}>
      <td className={cn(
        "px-4 py-2.5 whitespace-nowrap",
        sub && "pl-7 text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {label}
      </td>
      <td className={cn(
        "px-4 py-2.5 text-right font-mono whitespace-nowrap",
        sub && "text-xs text-muted-foreground",
        highlight && "bg-muted/50",
      )}>
        {value}
      </td>
    </tr>
  );
}
