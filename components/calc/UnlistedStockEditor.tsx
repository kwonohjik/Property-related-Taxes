"use client";

/**
 * UnlistedStockEditor — 비상장주식 항목 편집기 (StockValuationForm 800줄 정책 분리)
 *
 * 상증법 §63①1호 다목, 시행령 §54
 *
 * PR-2 리팩터: 입력부 JSX → UnlistedStockSimpleFields.tsx 분리.
 * 공통속성 4블록(영농·가업·§22·협의분할)은 이곳에 잔류 (PR-4에서 EstateCommonAttributesSection 분리 예정).
 *
 * 외부 import 사이트 무변경을 위해 defaultStockData·UnlistedStockPreview re-export 유지.
 */

import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { FarmingCategorySection } from "@/components/calc/inheritance/FarmingCategorySection";
import { FamilyBusinessCategorySection } from "@/components/calc/inheritance/FamilyBusinessCategorySection";
import { FinancialDeductionChip } from "@/components/calc/inheritance/FinancialDeductionChip";
import { HeirAllocationToggleSection } from "@/components/calc/inheritance/HeirAllocationToggleSection";
import {
  UnlistedStockSimpleFields,
  defaultStockData,
  UnlistedStockPreview,
} from "@/components/calc/UnlistedStockSimpleFields";

// re-export — 외부 import 사이트 무변경 (feedback_800line_split_export_preservation)
export { defaultStockData, UnlistedStockPreview };

// ============================================================
// 비상장주식 항목 편집기
// ============================================================

export interface UnlistedStockEditorProps {
  item: EstateItem;
  index: number;
  isRealEstateHeavy: boolean;
  onUpdate: (updated: EstateItem) => void;
  onUpdateHeavy: (v: boolean) => void;
  onRemove: () => void;
  mode: "inheritance" | "gift";
  heirs?: Heir[];
}

export function UnlistedStockEditor({
  item,
  index,
  mode,
  heirs,
  isRealEstateHeavy,
  onUpdate,
  onUpdateHeavy,
  onRemove,
}: UnlistedStockEditorProps) {
  // 협의분할 effectiveValuation 계산 (공통속성 4블록용)
  const data = item.unlistedStockData;
  let previewForAllocation: ReturnType<typeof calcUnlistedStockPerShareValue> | null = null;
  if (data && data.totalShares > 0) {
    try {
      previewForAllocation = calcUnlistedStockPerShareValue(data, isRealEstateHeavy);
    } catch {
      previewForAllocation = null;
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-white dark:bg-gray-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📋</span>
          <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">
            비상장주식 {index + 1}
          </span>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-300 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          삭제
        </button>
      </div>

      {/* 간편평가 입력 필드 (PR-2 분리) */}
      <UnlistedStockSimpleFields
        item={item}
        isRealEstateHeavy={isRealEstateHeavy}
        onUpdate={onUpdate}
        onUpdateHeavy={onUpdateHeavy}
      />

      {/* 영농상속 자산 분류 — 비상장주식 (corporate_stock만 가능) */}
      {mode === "inheritance" && (
        <FarmingCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* 가업상속 자산 분류 — 비상장주식 (corporate_stock만 가능) */}
      {mode === "inheritance" && (
        <FamilyBusinessCategorySection item={item} onUpdate={onUpdate} />
      )}

      {/* §22 금융재산공제 — 비상장주식 (§22② 최대주주 보유분은 사용자 override) */}
      {mode === "inheritance" && (
        <FinancialDeductionChip item={item} onUpdate={onUpdate} />
      )}

      {/* 상속인·수유자별 협의분할 (상속세 전용) */}
      {mode === "inheritance" && heirs && (
        <HeirAllocationToggleSection
          item={item}
          heirs={heirs}
          effectiveValuation={
            previewForAllocation && data
              ? previewForAllocation.perShareFinalValue * data.ownedShares
              : 0
          }
          onChange={(patch) => onUpdate({ ...item, ...patch })}
        />
      )}
    </div>
  );
}
