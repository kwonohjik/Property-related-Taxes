"use client";

/**
 * §22 금융재산공제 대상 체크박스 (상증령 §19①)
 *
 * PropertyValuationForm·StockValuationForm·DeemedInheritanceCard 공용 컴포넌트.
 * 자산 카드 하단에 노출. 사용자 명시값이 카테고리 기본값을 override.
 *
 * 우선순위 (resolveFinancialEligibility):
 *   1. item.isFinancialAssetForDeduction (사용자 명시)
 *   2. deemedCategory override (insurance=true / trust=cash_trust만 true / retirement=false)
 *   3. CATEGORY_DEFAULT (financial·deposit·listed_stock·unlisted_stock=true)
 */

import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import {
  getCategoryDefaultEligibility,
  resolveFinancialEligibility,
} from "@/lib/calc/financial-deduction-resolver";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

export interface FinancialDeductionChipProps {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function FinancialDeductionChip({
  item,
  onUpdate,
}: FinancialDeductionChipProps) {
  const eligible = resolveFinancialEligibility(item);
  const defaultEligible = getCategoryDefaultEligibility(item);
  const isUserOverride = item.isFinancialAssetForDeduction !== undefined;

  return (
    <div className="rounded-md border border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20 dark:border-emerald-800 p-2 space-y-1.5">
      <div className="flex items-center justify-between flex-wrap gap-1">
        <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">
          §22 금융재산공제 대상
        </p>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full ${
            isUserOverride
              ? "bg-violet-200 text-violet-800 dark:bg-violet-900 dark:text-violet-200"
              : defaultEligible
                ? "bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          {isUserOverride
            ? "사용자 지정"
            : defaultEligible
              ? "기본 적용"
              : "기본 제외"}
        </span>
      </div>
      <ToggleCard
        lawLinks="상증법"
        tone="emerald"
        size="sm"
        title={eligible ? "공제 대상으로 포함" : "공제 대상 제외"}
        description="예금·신탁(금전)·보험금·주식·채권·수익증권 등이 §22 대상 (상증령 §19①)"
        checked={eligible}
        onCheckedChange={(v) =>
          onUpdate({ ...item, isFinancialAssetForDeduction: v })
        }
      />
      {isUserOverride && (
        <button
          type="button"
          onClick={() =>
            onUpdate({ ...item, isFinancialAssetForDeduction: undefined })
          }
          className="text-[10px] text-emerald-700 dark:text-emerald-300 underline"
        >
          기본값으로 되돌리기
        </button>
      )}
    </div>
  );
}
