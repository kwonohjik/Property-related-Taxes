"use client";

/**
 * payable-calc-helpers — "주택분 종합부동산세 납부할세액의 계산" 카드 프리젠테이션 프리미티브.
 *
 * 교재(국세청 2022 귀속 종합부동산세 계산 사례, 사례12 p.186~187) narrative 형식 재현용.
 * 금액·억원·세율 포맷 + 단계(①~⑥)·서브(ⓐⓑⓒ)·bullet(○)·가나다 라인.
 *
 * Design: docs/01-plan/features/comprehensive-housing-payable-tax-calc-card.plan.md §2
 * 정책: 교재 narrative 충실 재현 — "원"·"억원" 표기는 교재 인용(앱 일반 표 no-won 규칙의 예외).
 */

import type { ReactNode } from "react";

// ── 포맷 ────────────────────────────────────────────────────
/** 1,440,000 → "1,440,000원" */
export function won(n: number): string {
  return `${Math.round(n).toLocaleString("ko-KR")}원`;
}
/** 240,000,000 → "2.4억원" / 675,000,000 → "6.75억원" (교재 억원 표기) */
export function eok(n: number): string {
  const v = parseFloat((n / 100_000_000).toFixed(6));
  return `${v.toLocaleString("ko-KR")}억원`;
}
/** 0.45 → "45%" / 0.006 → "0.6%" / 1.3 → "130%" */
export function pct(r: number): string {
  return `${parseFloat((r * 100).toFixed(6)).toLocaleString("ko-KR")}%`;
}

// ── 라인 프리미티브 ────────────────────────────────────────
/** 네모 숫자 배지 (①~⑥) */
function SquareBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] border border-emerald-400 bg-emerald-100 px-0.5 text-caption font-bold leading-none text-emerald-800 dark:border-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-200 select-none">
      {label}
    </span>
  );
}
/** 동그라미 배지 (ⓐⓑⓒ / 원숫자) */
function CircleBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-emerald-300 bg-white px-0.5 text-caption font-bold leading-none text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 select-none">
      {label}
    </span>
  );
}

/**
 * 단계 라인 — "[배지] 라벨 : 금액" (교재 ①~⑥·ⓐⓑⓒ·나의①②).
 * amount 미지정 시 라벨만(중간 헤더).
 */
export function StepLine({
  badge,
  badgeShape = "square",
  label,
  formula,
  amount,
  indent = 0,
  strong = false,
  testId,
}: {
  badge?: string;
  badgeShape?: "square" | "circle";
  label: ReactNode;
  /** 라벨 옆 괄호 산식 (예: "(① − ②)") */
  formula?: string;
  amount?: number;
  indent?: number;
  strong?: boolean;
  testId?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-1.5 py-0.5"
      style={{ paddingLeft: `${indent * 14}px` }}
      data-testid={testId}
    >
      {badge ? (
        badgeShape === "square" ? <SquareBadge label={badge} /> : <CircleBadge label={badge} />
      ) : null}
      <span className={strong ? "font-semibold text-foreground" : "text-foreground"}>
        {label}
        {formula ? (
          <span className="ml-1 text-caption font-normal text-muted-foreground">{formula}</span>
        ) : null}
      </span>
      {amount !== undefined && (
        <span
          className={`ml-1 font-mono tabular-nums whitespace-nowrap ${
            strong ? "font-bold text-emerald-700 dark:text-emerald-300" : "text-foreground"
          }`}
        >
          : {won(amount)}
        </span>
      )}
    </div>
  );
}

/** ○ 산식 bullet — 들여쓰기된 회색 설명 라인 */
export function Bullet({
  children,
  indent = 1,
  testId,
}: {
  children: ReactNode;
  indent?: number;
  testId?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-1.5 py-0.5 text-xs text-muted-foreground"
      style={{ paddingLeft: `${indent * 14 + 18}px` }}
      data-testid={testId}
    >
      <span className="select-none">○</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/** − 하이픈 bullet (토지 ≪지역≫ 블록 내부) */
export function DashBullet({
  children,
  indent = 2,
  testId,
}: {
  children: ReactNode;
  indent?: number;
  testId?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-1.5 py-0.5 text-xs text-muted-foreground"
      style={{ paddingLeft: `${indent * 14 + 18}px` }}
      data-testid={testId}
    >
      <span className="select-none">−</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/** • 필지 나열 (토지 ≪지역≫ 블록 내 복수 필지) */
export function ParcelDot({ children, indent = 3 }: { children: ReactNode; indent?: number }) {
  return (
    <div
      className="flex items-baseline gap-1.5 py-0.5 text-xs text-muted-foreground"
      style={{ paddingLeft: `${indent * 14 + 18}px` }}
    >
      <span className="select-none">•</span>
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/** ≪지역≫ 서브헤더 (토지 지자체 블록) */
export function JurisdictionHeader({ name, indent = 1 }: { name: string; indent?: number }) {
  return (
    <div
      className="py-0.5 text-xs font-semibold text-sky-700 dark:text-sky-300"
      style={{ paddingLeft: `${indent * 14 + 18}px` }}
    >
      ≪{name} 토지≫
    </div>
  );
}

/** 각주(*) 라인 — 외부 고지서값 등 */
export function Footnote({ children, indent = 2 }: { children: ReactNode; indent?: number }) {
  return (
    <div
      className="py-0.5 text-caption italic text-muted-foreground"
      style={{ paddingLeft: `${indent * 14 + 18}px` }}
    >
      * {children}
    </div>
  );
}

/** 가·나·다 라인 (들여쓰기 prefix) */
export function GaNaDaLine({
  prefix,
  label,
  formula,
  amount,
  indent = 1,
  testId,
}: {
  prefix: string;
  label: ReactNode;
  formula?: string;
  amount?: number;
  indent?: number;
  testId?: string;
}) {
  return (
    <div
      className="flex items-baseline gap-1.5 py-0.5"
      style={{ paddingLeft: `${indent * 14}px` }}
      data-testid={testId}
    >
      <span className="font-semibold text-emerald-700 dark:text-emerald-300 select-none">
        {prefix}.
      </span>
      <span className="text-foreground">
        {label}
        {formula ? (
          <span className="ml-1 text-caption font-normal text-muted-foreground">{formula}</span>
        ) : null}
      </span>
      {amount !== undefined && (
        <span className="ml-1 font-mono tabular-nums whitespace-nowrap text-foreground">
          : {won(amount)}
        </span>
      )}
    </div>
  );
}
