"use client";

/**
 * ListedStockValuationPreviewCard — 상장주식 입력 폼 "평가액 미리보기" 카드.
 *
 * §63③ 할증 반영 산식 표시:
 *   - 일반 분기: ⑨ × (1+할증) = ⑩, ⑩ × shares = 평가액
 *   - §63②3호 분기: (⑨ − ⑮) = ⑯ × (1+할증) = ⑰, ⑰ × shares = 평가액
 *
 * Plan: docs/00-pm/listed-stock-form-formula-premium-display-fix.plan.md §2-2
 *
 * 단일 진실 소스 [[feedback_ui_engine_dual_truth_avoidance]]:
 *   `evaluateListedStock(item, {})` 결과의 page1Values 를 직접 인용. UI 자체 재계산 0.
 */

import React from "react";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

interface Props {
  item: EstateItem;
}

export function ListedStockValuationPreviewCard({ item }: Props) {
  const shares = item.listedStockShares ?? 0;
  const avgPriceRaw = item.listedStockAvgPrice ?? 0;
  if (avgPriceRaw <= 0 || shares <= 0) return null;

  // 단일 source — 엔진이 SSOT (closingAvg 도출·할증 반영·§63②3호 분기 모두 책임)
  let totalValue = 0;
  let closingAvg = avgPriceRaw;
  let perShareMajorShareholder = avgPriceRaw;
  let perShareValue: number | undefined;
  let perShareMajorShareholderUnlisted: number | undefined;
  let dividendDifference: number | undefined;
  let majorShareholderRate: 0 | 0.2 = 0;
  let premiumExclusionLabel: string | undefined;
  let isCapIncSection = false;

  try {
    const r = evaluateListedStock(item, {});
    totalValue = r.valuatedAmount;
    const p1 = r.besshiData?.page1Values;
    if (p1) {
      closingAvg = p1.closingAvg;
      perShareMajorShareholder = p1.perShareMajorShareholder;
      perShareValue = p1.perShareValue;
      perShareMajorShareholderUnlisted = p1.perShareMajorShareholderUnlisted;
      dividendDifference = p1.dividendDifference;
      majorShareholderRate = p1.majorShareholderRate;
      premiumExclusionLabel = p1.premiumExclusionLabel;
    }
    isCapIncSection = r.besshiData?.page1.isUnlistedShareSection ?? false;
  } catch {
    return null;
  }

  const premiumPctLabel = majorShareholderRate === 0.2 ? "120%" : "100%";
  const sameBaseDate = item.dividendBaseDateSameAsListed ?? false;

  // 1주당 산식 텍스트 — 갑지 ⑨·⑩·⑯·⑰ 양식 정합
  let perShareLabel: string;
  let perShareFormula: string;
  let perShareValueDisplay: number;

  if (isCapIncSection) {
    // §63②3호 분기 — ⑯ → ⑰
    perShareValueDisplay = perShareMajorShareholderUnlisted ?? perShareValue ?? closingAvg;
    if (majorShareholderRate === 0.2) {
      perShareLabel = "⑰ 최대주주 1주당 평가액";
      perShareFormula = sameBaseDate
        ? `floor(${closingAvg.toLocaleString()} × 1.2) = ${perShareValueDisplay.toLocaleString()}`
        : `floor((${closingAvg.toLocaleString()} − ${(dividendDifference ?? 0).toLocaleString()}) × 1.2) = ${perShareValueDisplay.toLocaleString()}`;
    } else {
      perShareLabel = "1주당 평가액 (⑯·⑰)";
      perShareFormula = sameBaseDate
        ? `${closingAvg.toLocaleString()}`
        : `${closingAvg.toLocaleString()} − ${(dividendDifference ?? 0).toLocaleString()} = ${perShareValueDisplay.toLocaleString()}`;
    }
  } else {
    // 일반 분기 — ⑨ → ⑩
    perShareValueDisplay = perShareMajorShareholder;
    if (majorShareholderRate === 0.2) {
      perShareLabel = "⑩ 최대주주 1주당 평가액";
      perShareFormula = `floor(${closingAvg.toLocaleString()} × 1.2) = ${perShareValueDisplay.toLocaleString()}`;
    } else {
      perShareLabel = "1주당 평가액 (⑨·⑩)";
      perShareFormula = `${closingAvg.toLocaleString()}`;
    }
  }

  const totalFormula = `${perShareValueDisplay.toLocaleString()} × ${shares.toLocaleString()}주`;
  const resultLabel = isCapIncSection ? "§63②3호 평가액" : "상장주식 평가액";

  return (
    <div
      className="rounded-md bg-gray-50 dark:bg-gray-800 px-3 py-2 text-xs space-y-1"
      data-testid="ls-valuation-preview-card"
    >
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>{perShareLabel}</span>
        <span data-testid="ls-preview-per-share-formula">{perShareFormula}</span>
      </div>
      {premiumExclusionLabel && (
        <div
          className="text-caption text-amber-700 dark:text-amber-300"
          data-testid="ls-preview-premium-exclusion"
        >
          ※ 할증 배제 사유: {premiumExclusionLabel} (할증율 {premiumPctLabel})
        </div>
      )}
      <div className="flex justify-between text-gray-500 dark:text-gray-400">
        <span>평가 산식</span>
        <span data-testid="ls-preview-total-formula">{totalFormula}</span>
      </div>
      <div className="flex justify-between font-semibold border-t border-gray-200 dark:border-gray-700 pt-1">
        <span>{resultLabel}</span>
        <span
          className="text-indigo-700 dark:text-indigo-300"
          data-testid="ls-preview-total-value"
        >
          {formatKRW(totalValue)}
        </span>
      </div>
    </div>
  );
}
