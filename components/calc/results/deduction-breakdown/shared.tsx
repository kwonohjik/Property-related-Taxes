"use client";

/**
 * deduction-breakdown/shared.tsx
 * 상속공제 펼침 컴포넌트 공유 헬퍼
 * 원본: InheritanceTaxResultView.tsx → 분리 이관
 * 메인에서 re-export 보존(import 사이트 무변경)
 */

// ============================================================
// Row
// ============================================================

export function Row({
  label,
  value,
  sub = false,
  highlight = false,
  deduction = false,
}: {
  label: string;
  value: string;
  sub?: boolean;
  highlight?: boolean;
  deduction?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 ${
        highlight ? "bg-muted/50 font-semibold" : ""
      } ${sub ? "pl-7" : ""}`}
    >
      <span className={sub ? "text-xs text-muted-foreground" : "text-sm"}>{label}</span>
      <span
        className={`font-mono text-sm ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================
// formatBillion
// ============================================================

/** 한도 가독화 — 60_000_000_000 → "600억". */
export function formatBillion(amount: number): string {
  if (amount === 0) return "0";
  const eok = amount / 100_000_000;
  return `${eok.toLocaleString()}억`;
}

// ============================================================
// LawBadge
// ============================================================

export function LawBadge({ law }: { law: string }) {
  return (
    <span className="inline-block text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 mr-1 mb-1">
      {law}
    </span>
  );
}

// ============================================================
// 소계 구분선 Row (펼침 표 내부 소계)
// ============================================================

export function SubTotalRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "blue" | "amber";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-muted/40",
    blue: "bg-blue-50/60 dark:bg-blue-950/20",
    amber: "bg-amber-50/60 dark:bg-amber-950/20",
  };
  return (
    <div
      className={`flex items-center justify-between px-3 py-2 ${toneClasses[tone]} font-semibold text-xs`}
    >
      <span>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}

// ============================================================
// DetailTable wrapper — 펼침 영역 공통 컨테이너
// ============================================================

export function DetailTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-3 mb-3 rounded-md border border-border bg-muted/20 divide-y divide-border text-xs overflow-hidden">
      {children}
    </div>
  );
}

// ============================================================
// DetailRow — 표 한 행 (label + value)
// ============================================================

export function DetailRow({
  label,
  value,
  indent = false,
  muted = false,
  deduction = false,
}: {
  label: string;
  value: string;
  indent?: boolean;
  muted?: boolean;
  deduction?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between px-3 py-1.5 ${indent ? "pl-6" : ""}`}>
      <span className={muted ? "text-muted-foreground" : ""}>{label}</span>
      <span
        className={`font-mono ${deduction ? "text-blue-600 dark:text-blue-400" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

// ============================================================
// ExpandButton — ▼ 펼침 버튼
// ============================================================

export function ExpandButton({
  expanded,
  onClick,
}: {
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="ml-2 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted transition-colors"
      aria-label={expanded ? "접기" : "펼치기"}
    >
      {expanded ? "▲" : "▼"}
    </button>
  );
}
