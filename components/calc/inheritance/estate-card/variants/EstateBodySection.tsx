"use client";

/**
 * EstateBodySection — 비주식 자산 카드 본문 공용 섹션 래퍼
 *
 * 주식 종목 카드(ListedStockSecurityInfoSection)와 동일한 스타일:
 *   파란 섹션 카드 + 헤더(제목 + 서브타이틀) + space-y-3 FieldCard 나열.
 *
 * Plan: docs/01-plan/estate-asset-input-fieldcard-restyle.plan.md §2-1
 * 적용: EstateBodySimple · EstateBodyDeposit · EstateBodyRealEstate (모든 비주식 자산)
 */

import type { ReactNode } from "react";

export interface EstateBodySectionProps {
  /** 섹션 헤더 제목 (예: "평가액 입력") */
  title: string;
  /** 섹션 헤더 서브타이틀 (카테고리별 필드 안내·법령) */
  subtitle: string;
  children: ReactNode;
}

export function EstateBodySection({
  title,
  subtitle,
  children,
}: EstateBodySectionProps) {
  return (
    <section className="rounded-lg border border-sky-300 bg-sky-50/70 p-3 dark:border-sky-800 dark:bg-sky-950/30">
      <div className="mb-2">
        <h4 className="text-sm font-semibold text-sky-900 dark:text-sky-100">
          {title}
        </h4>
        <p className="mt-0.5 text-xs text-sky-700 dark:text-sky-300">
          {subtitle}
        </p>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
