"use client";

/**
 * CollapsibleEstateGroup — 상속재산 단계 그룹 접기/펼치기 래퍼
 *
 * 상속재산 목록·주식/지분 목록·추정상속재산 §15 각 그룹을 감싼다.
 * - 기본 펼침. 접으면 헤더에 "N건 · 합계" 요약 표시.
 * - 본문은 CSS hidden 토글(unmount 안 함 → 입력값·포커스 보존).
 * - 상태는 로컬(useState) — 단계 이동/새로고침 시 기본(펼침) 복귀.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

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
  title: string;
  description?: ReactNode;
  /** 항목 개수 (배열 length) */
  count: number;
  /** 합계(원). 0이면 요약에서 금액 생략 */
  totalAmount: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleEstateGroup({
  groupKey,
  title,
  description,
  count,
  totalAmount,
  defaultOpen = true,
  children,
}: CollapsibleEstateGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const amountText = formatKoreanAmountShort(totalAmount);

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid={`estate-group-toggle-${groupKey}`}
        className="flex w-full items-start gap-2 text-left group"
      >
        <span className="mt-0.5 text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300">
          {open ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </span>
        <span className="flex-1">
          <span className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
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
          </span>
          {description && (
            <span className="block text-xs text-muted-foreground mt-0.5">
              {description}
            </span>
          )}
        </span>
      </button>

      {/* 본문 — 접힘 시 hidden(display:none)으로 입력값·포커스 보존 */}
      <div className={open ? "block" : "hidden"}>{children}</div>
    </div>
  );
}
