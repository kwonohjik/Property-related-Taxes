"use client";

/**
 * 자산 카드 토글 안내 배지 + tone 매핑 + hint 문구 헬퍼.
 *
 * PropertyValuationForm·StockValuationForm의 hidden_expandable 펼침 영역에서 사용.
 * 정적 tone 매핑 강제 (memory `feedback_tailwind_static_tone_mapping`) — 동적 클래스 금지.
 *
 * 디자인: docs/02-design/features/asset-toggle-auto-visibility.ui.design.md §3-2
 */

import type { ReactNode } from "react";
import type { AssetCategory } from "@/lib/tax-engine/types/inheritance-gift.types";

// ============================================================
// 정적 tone 매핑 — JIT purge 차단
// ============================================================

const HINT_TONE_CLASSES: Record<"amber" | "emerald", { container: string; text: string }> = {
  amber: {
    container:
      "rounded-md border border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 dark:border-amber-800 p-2 mb-1",
    text: "text-caption text-amber-800 dark:text-amber-200",
  },
  emerald: {
    container:
      "rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-2 mb-1",
    text: "text-caption text-emerald-800 dark:text-emerald-200",
  },
};

// ============================================================
// HintBadge 컴포넌트
// ============================================================

export function HintBadge({
  tone,
  children,
}: {
  tone: "amber" | "emerald";
  children: ReactNode;
}) {
  return (
    <div className={HINT_TONE_CLASSES[tone].container} role="note">
      <span className={HINT_TONE_CLASSES[tone].text}>ⓘ {children}</span>
    </div>
  );
}

// ============================================================
// 카테고리별 안내 문구 (디자인 §3-2)
// ============================================================

/** 가업상속 §22 hidden_expandable 카테고리별 안내 (amber) */
export function getFamilyBusinessHint(category: AssetCategory): string {
  if (category === "real_estate_apartment") {
    return "주거용 아파트는 §15⑤2호 나목 사업무관자산 원칙. 단, 임대법인 보유 + 임직원 5년 이상 무상임대(국민주택 또는 기준시가 6억 이하)는 사업용 인정 가능";
  }
  if (category === "financial") {
    return '§15⑤2호 마목 "영업활동과 직접 관련 없는" 주식·채권·금융상품은 사업무관자산. 영업관련 운영자금 등은 사용자 override 가능';
  }
  return "§15⑤ 가업상속재산 본질 미적용 — 필요 시 사용자 override 가능";
}

/** §22 hidden_expandable 카테고리별 안내 (emerald) */
export function getFinancialDeductionHint(category: AssetCategory): string {
  if (
    category === "real_estate_land" ||
    category === "real_estate_building" ||
    category === "real_estate_apartment"
  ) {
    return "부동산은 §19① 미열거 — 원칙적 §22 미적용 (단, 부동산신탁 → 금전신탁 전환분은 §19① 적용)";
  }
  if (category === "deposit") {
    return '§19① "금융회사등이 취급" 한정 — 전세보증금 사인간 직접채권 미열거 (해석례 따라 사용자 override 가능)';
  }
  return "§19① 열거 항목(예금·신탁·보험금·공제금·주식·채권 등) 해당 여부 확인 후 토글";
}
