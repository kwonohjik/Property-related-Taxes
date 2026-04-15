"use client";

/**
 * ExemptionSummaryCard — 비과세 적용 결과 요약 카드
 * 계산 결과 화면에서 비과세 차감 내역을 표시합니다.
 */

import type { ExemptionResult } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionItemResult } from "@/lib/tax-engine/exemption-evaluator";

// ============================================================
// 금액 포매터
// ============================================================

function formatKRW(amount: number) {
  if (amount === 0) return "0원";
  const eok = Math.floor(amount / 100_000_000);
  const man = Math.floor((amount % 100_000_000) / 10_000);
  if (eok > 0 && man > 0) return `${eok}억 ${man}만원`;
  if (eok > 0) return `${eok}억원`;
  if (man > 0) return `${man}만원`;
  return `${amount.toLocaleString()}원`;
}

// ============================================================
// 항목 행
// ============================================================

function ItemRow({ item }: { item: ExemptionItemResult }) {
  const hasOverflow = item.taxableOverflow > 0;
  return (
    <div className="py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-700 dark:text-gray-300">{item.ruleName}</span>
        <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          -{formatKRW(item.exemptAmount)}
        </span>
      </div>
      {hasOverflow && (
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-xs text-gray-400 dark:text-gray-500">
            한도 초과 (일반 과세)
          </span>
          <span className="text-xs text-amber-600 dark:text-amber-400">
            +{formatKRW(item.taxableOverflow)}
          </span>
        </div>
      )}
      {item.warnings.map((w, i) => (
        <p key={i} className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
          ⚠️ {w}
        </p>
      ))}
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

interface ExemptionSummaryCardProps {
  result: ExemptionResult;
  itemResults?: ExemptionItemResult[];
}

export function ExemptionSummaryCard({
  result,
  itemResults = [],
}: ExemptionSummaryCardProps) {
  if (result.totalExemptAmount === 0 && itemResults.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/20 p-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          비과세 적용 내역
        </h3>
        <div className="text-right">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">총 비과세 차감</p>
          <p className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
            -{formatKRW(result.totalExemptAmount)}
          </p>
        </div>
      </div>

      {/* 항목별 내역 */}
      {itemResults.length > 0 && (
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {itemResults.map((item) => (
            <ItemRow key={item.ruleId} item={item} />
          ))}
        </div>
      )}

      {/* 적용 법령 */}
      {result.appliedLaws.length > 0 && (
        <div className="mt-3 pt-3 border-t border-emerald-200 dark:border-emerald-800">
          <p className="text-xs text-emerald-600 dark:text-emerald-500">
            적용 조문: {result.appliedLaws.join(" · ")}
          </p>
        </div>
      )}
    </div>
  );
}
