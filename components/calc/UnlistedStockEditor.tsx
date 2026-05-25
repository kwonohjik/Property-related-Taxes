"use client";

/**
 * UnlistedStockEditor — 비상장주식 항목 편집기 (레거시 래퍼)
 *
 * 상증법 §63①1호 다목, 시행령 §54
 *
 * PR-2 리팩터: 입력부 JSX → UnlistedStockSimpleFields.tsx 분리.
 * PR-4 리팩터: 공통속성 4블록 → EstateCommonAttributesSection 분리.
 *   StockValuationForm.tsx의 UnlistedStockCard가 직접 이 두 컴포넌트를 사용하므로
 *   이 파일은 re-export 보존 목적으로만 유지.
 *
 * 외부 import 사이트 무변경을 위해 defaultStockData·UnlistedStockPreview re-export 유지
 * (feedback_800line_split_export_preservation).
 */

import {
  UnlistedStockSimpleFields,
  defaultStockData,
  UnlistedStockPreview,
} from "@/components/calc/UnlistedStockSimpleFields";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

// re-export — 외부 import 사이트 무변경 (feedback_800line_split_export_preservation)
export { defaultStockData, UnlistedStockPreview };

// ============================================================
// 비상장주식 항목 편집기 (레거시 — StockValuationForm.UnlistedStockCard가 실사용)
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
  isRealEstateHeavy,
  onUpdate,
  onUpdateHeavy,
  onRemove,
  mode = "inheritance",
}: UnlistedStockEditorProps) {
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
        mode={mode}
      />
      {/* 공통속성 4블록은 StockValuationForm.UnlistedStockCard에서 EstateCommonAttributesSection으로 노출 (PR-4) */}
    </div>
  );
}
