"use client";

/**
 * CollapsibleEstateGroup — 상속재산 단계 그룹 접기/펼치기 래퍼
 *
 * 상속재산 목록·주식/지분 목록·추정상속재산 §15 각 그룹을 감싼다.
 * - 피상속인 Step(steps.tsx §①②③)과 동일한 번호 배지 + 색상 카드 형식.
 * - 기본 펼침. 접으면 헤더에 "N건 · 합계" 요약 표시.
 * - 본문은 CSS hidden 토글(unmount 안 함 → 입력값·포커스 보존).
 * - 상태는 로컬(useState) — 단계 이동/새로고침 시 기본(펼침) 복귀.
 */

import { useState, type ReactNode } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";

type EstateGroupTone = "sky" | "emerald" | "amber" | "violet" | "rose";

// 정적 tone 클래스 매핑 (JIT purge 안전 — dynamic `bg-${tone}` 금지)
const TONE_CARD: Record<EstateGroupTone, string> = {
  sky: "border-sky-200 bg-sky-50/40 dark:border-sky-800 dark:bg-sky-900/15",
  emerald:
    "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-900/15",
  amber:
    "border-amber-200 bg-amber-50/40 dark:border-amber-800 dark:bg-amber-900/15",
  violet:
    "border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-900/15",
  rose: "border-rose-200 bg-rose-50/40 dark:border-rose-800 dark:bg-rose-900/15",
};
const TONE_BADGE: Record<EstateGroupTone, string> = {
  sky: "bg-sky-200 text-sky-800",
  emerald: "bg-emerald-200 text-emerald-800",
  amber: "bg-amber-200 text-amber-800",
  violet: "bg-violet-200 text-violet-800",
  rose: "bg-rose-200 text-rose-800",
};
const TONE_TITLE: Record<EstateGroupTone, string> = {
  sky: "text-sky-700 dark:text-sky-300",
  emerald: "text-emerald-700 dark:text-emerald-300",
  amber: "text-amber-700 dark:text-amber-300",
  violet: "text-violet-700 dark:text-violet-300",
  rose: "text-rose-700 dark:text-rose-300",
};

/** 금액(원)을 억/만 단위로 축약. 0이면 빈 문자열. */
function formatKoreanAmountShort(amount: number): string {
  if (!amount || amount <= 0) return "";
  const eok = Math.floor(amount / 100_000_000);
  const man = Math.floor((amount % 100_000_000) / 10_000);
  if (eok > 0) {
    return man > 0
      ? `${eok}억 ${man.toLocaleString()}만`
      : `${eok}억`;
  }
  if (man > 0) return `${man.toLocaleString()}만`;
  // 1만 미만 잔액 — 원 단위 콤마
  return `${amount.toLocaleString()}`;
}

interface CollapsibleEstateGroupProps {
  /** 그룹 식별자 — data-testid·고유 key 용 (예: "estate", "stock", "presumed") */
  groupKey: string;
  /** 섹션 번호 — 제목 앞 원형 배지 (피상속인 Step §①②③과 동일) */
  sectionNum?: number;
  /** 카드·배지·제목 색조 (기본 sky) */
  tone?: EstateGroupTone;
  title: string;
  description?: ReactNode;
  /** 헤더 우측 액션(추가 버튼 등) — 펼쳐진 상태에서만 노출(접힘 시 본문 숨김으로 추가 패널 미표시 방지) */
  headerAction?: ReactNode;
  /** 항목 개수 (배열 length) */
  count: number;
  /** 합계(원). 0이면 요약에서 금액 생략 */
  totalAmount: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleEstateGroup({
  groupKey,
  sectionNum,
  tone = "sky",
  title,
  description,
  headerAction,
  count,
  totalAmount,
  defaultOpen = true,
  children,
}: CollapsibleEstateGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const amountText = formatKoreanAmountShort(totalAmount);

  return (
    <div className={`rounded-lg border p-3 space-y-3 ${TONE_CARD[tone]}`}>
      {/* 헤더 — 좌측(번호·제목·요약·설명) + 우측(추가 액션 + 펼치기 버튼, 결과 탭과 동형) */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {sectionNum !== undefined && (
              <span
                data-testid={`estate-group-badge-${groupKey}`}
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-micro font-bold select-none ${TONE_BADGE[tone]}`}
              >
                {sectionNum}
              </span>
            )}
            <span className={`text-xs font-semibold ${TONE_TITLE[tone]}`}>
              {title}
            </span>
            {/* 접힘 시에만 요약 배지 — 펼치면 본문에 다 보이므로 숨김 */}
            {!open && (
              <span
                className="text-xs text-gray-500 dark:text-gray-400"
                data-testid={`estate-group-summary-${groupKey}`}
              >
                {count}건{amountText ? ` · ${amountText}` : ""}
              </span>
            )}
          </div>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {open && headerAction}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            data-testid={`estate-group-toggle-${groupKey}`}
            className={expandToggleClass("slate")}
          >
            {expandToggleLabel(open)}
          </button>
        </div>
      </div>

      {/* 본문 — 접힘 시 hidden(display:none)으로 입력값·포커스 보존 */}
      <div className={open ? "block" : "hidden"}>{children}</div>
    </div>
  );
}
