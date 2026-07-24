"use client";

/**
 * 마법사 네비게이션 버튼 공용 컴포넌트 (전 세목 통일 — 2026-07-24).
 *
 * 기준: 양도세 단건 화면(TransferTaxCalculator). 상단 헤더·하단 네비 공용.
 *  - NavButton: 컴팩트 아웃라인 이전/다음 (rounded-md · text-xs · 아이콘 h-3.5).
 *  - CtaButton: 글자 폭 primary/아웃라인 계산 CTA (전체폭 아님).
 *
 * 클래스 문자열의 단일 소스 — 세목은 이 컴포넌트만 사용(인라인 nav 클래스 금지).
 * data-testid·aria-label·title 등은 ...props로 통과.
 */
import type { ComponentProps, ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_CLASS =
  "inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

type NavButtonProps = Omit<ComponentProps<"button">, "children"> & {
  /** prev → ChevronLeft(라벨 앞) / next → ChevronRight(라벨 뒤) */
  direction: "prev" | "next";
  label: ReactNode;
};

export function NavButton({ direction, label, type = "button", className, ...props }: NavButtonProps) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button type={type} className={cn(NAV_CLASS, className)} {...props}>
      {direction === "prev" && <Icon className="h-3.5 w-3.5" />}
      {label}
      {direction === "next" && <Icon className="h-3.5 w-3.5" />}
    </button>
  );
}

const CTA_SOLID =
  "rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors";
const CTA_OUTLINE =
  "rounded-lg border border-primary px-5 py-2.5 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60 transition-colors";

type CtaButtonProps = ComponentProps<"button"> & {
  /** solid = bg-primary(주 CTA) / outline = 테두리 primary(보조 CTA) */
  tone?: "solid" | "outline";
};

export function CtaButton({ tone = "solid", type = "button", className, children, ...props }: CtaButtonProps) {
  return (
    <button type={type} className={cn(tone === "outline" ? CTA_OUTLINE : CTA_SOLID, className)} {...props}>
      {children}
    </button>
  );
}
