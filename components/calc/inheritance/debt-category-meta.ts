/**
 * debt-category-meta — 채무·공과·장례비 카테고리 스타일·순서·id 생성 (단일 출처)
 *
 * DebtAllocationInput(오케스트레이터)·DebtItemTableView(행)·DebtItemEditor(모달) 공유.
 * 테이블 전환 전에는 DebtAllocationInput.tsx 내부에 module-level로 있었으나,
 * 행·모달 양쪽에서 라벨·칩 색이 필요해 단일 출처로 추출.
 *
 * 정책: Tailwind dynamic class purge 차단 — `bg-${tone}-50/60` 금지, 정적 매핑 객체.
 *   (feedback_tailwind_static_tone_mapping)
 */

import type { DebtCategory } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface DebtCategoryStyle {
  label: string;
  buttonClass: string;
  cardBorderClass: string;
  chipClass: string;
}

export const CATEGORY_STYLES: Record<DebtCategory, DebtCategoryStyle> = {
  financial: {
    label: "금융채무",
    buttonClass:
      "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40",
    cardBorderClass: "border-rose-200 dark:border-rose-900",
    chipClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  tax: {
    label: "공과금",
    buttonClass:
      "border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40",
    cardBorderClass: "border-amber-200 dark:border-amber-900",
    chipClass: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  personal: {
    label: "사적채무",
    buttonClass:
      "border-violet-300 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40",
    cardBorderClass: "border-violet-200 dark:border-violet-900",
    chipClass: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  funeral: {
    label: "장례비",
    buttonClass:
      "border-emerald-300 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
    cardBorderClass: "border-emerald-200 dark:border-emerald-900",
    chipClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};

export const CATEGORY_ORDER: DebtCategory[] = [
  "financial",
  "tax",
  "personal",
  "funeral",
];

let nextId = 0;
/** 항목 id 생성 — UI ephemeral. 엔진은 id를 비교 키로만 사용. */
export const newDebtId = () => `debt_${Date.now()}_${++nextId}`;
