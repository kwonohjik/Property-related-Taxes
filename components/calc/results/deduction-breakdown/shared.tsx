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
// PrintExpandable — 펼침 영역을 «언마운트하지 않고» CSS 로만 접는다
// ============================================================

/**
 * 접힌 펼침 영역은 **인쇄물에서 통째로 빠진다** — 조건부 렌더(`{open && …}`)는 DOM 자체를
 * 만들지 않으므로 `print:` 유틸리티가 붙을 대상이 없다. 상속공제 상세는 인쇄해서 보관하는
 * 화면인데, 사용자가 펼치지 않은 카드는 종이에서 사라졌다.
 *
 * 바깥 섹션(`DeductionBreakdownSection`)은 IG-148 에서 이미 같은 이유로 CSS 토글로 바꿨다.
 * 그때는 섹션 하나만 고쳤고 **카드 8개(9곳)는 남아 있었다** — 그래서 섹션을 펼쳐도 그 안의
 * 개별 카드가 접혀 있으면 인쇄물에는 헤더만 나왔다. (별건 정리 2026-09-11)
 *
 * ⚠️ `hidden` 은 `display:none` 이라 접힌 동안 화면에서 완전히 빠진다 — 종전 조건부 렌더와
 *    보이는 동작이 같다. 다른 점은 DOM 이 남아 `print:block` 이 되살릴 수 있다는 것뿐이다.
 */
export function PrintExpandable({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return <div className={open ? "" : "hidden print:block"}>{children}</div>;
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
  label: React.ReactNode;
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
      className="ml-2 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-micro text-muted-foreground hover:bg-muted transition-colors"
      aria-label={expanded ? "접기" : "펼치기"}
    >
      {expanded ? "▲" : "▼"}
    </button>
  );
}
