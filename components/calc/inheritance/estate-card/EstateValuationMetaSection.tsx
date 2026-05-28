"use client";

/**
 * 상속개시자료 요약 4표 — Table A 신규 입력 위젯 (지점 ⑤).
 *
 * 3종 신규 필드:
 *   - valuationMethod (RadioCardGroup 5종: 자동 + 4 enum)
 *   - areaSqm        (조건부: real_estate_*)
 *   - quantityCount  (조건부: category==="other")
 *
 * 디자인: docs/02-design/features/inheritance-source-data-summary.ui.design.md §3-1
 */

import type { EstateItem, ValuationMethod } from "@/lib/tax-engine/types/inheritance-gift.types";
import { RadioCardGroup } from "@/components/calc/inputs/RadioCardGroup";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { isRealEstateCategory } from "@/components/calc/results/source-summary/source-summary-constants";

interface Props {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

type AutoOrMethod = "auto" | Extract<ValuationMethod, "market_value" | "similar_sales" | "standard_price" | "appraisal">;

const VALUATION_OPTIONS: Array<{ value: AutoOrMethod; label: string; description?: string }> = [
  { value: "auto", label: "자동", description: "입력된 가액에서 추론" },
  { value: "market_value", label: "시가", description: "매매·감정·수용·경매" },
  { value: "similar_sales", label: "매매사례가", description: "시행령 §49①5호" },
  { value: "standard_price", label: "기준시가", description: "보충적 평가" },
  { value: "appraisal", label: "감정가액", description: "감정평가서" },
];

export function EstateValuationMetaSection({ item, onUpdate }: Props) {
  const cat = item.category;
  const showArea = isRealEstateCategory(cat);
  const showQuantity = cat === "other";

  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  const currentMethod: AutoOrMethod = (item.valuationMethod as AutoOrMethod) ?? "auto";

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          평가방식·수량 (상속개시자료 요약 표시용)
        </p>
      </div>

      <div>
        <p className="mb-1 text-xs font-medium text-slate-600">평가방식 (Table A 비고 열)</p>
        <RadioCardGroup
          name={`valuation-method-${item.id}`}
          value={currentMethod}
          onChange={(v) =>
            set({
              valuationMethod:
                v === "auto" ? undefined : (v as ValuationMethod),
            })
          }
          options={VALUATION_OPTIONS}
          layout="inline"
          tone="emerald"
        />
      </div>

      {showArea && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            면적 (㎡) — 미입력 시 상속인별 분배 면적 합계 자동 사용
          </p>
          <DecimalInput
            value={item.areaSqm !== undefined ? String(item.areaSqm) : ""}
            onChange={(v) =>
              set({ areaSqm: parseDecimal(v) || undefined })
            }
            placeholder="자산 전체 면적"
          />
        </div>
      )}

      {showQuantity && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">수량 (점)</p>
          <DecimalInput
            value={item.quantityCount !== undefined ? String(item.quantityCount) : ""}
            onChange={(v) =>
              set({ quantityCount: parseDecimal(v) || undefined })
            }
            placeholder="기타자산 수량"
          />
        </div>
      )}
    </div>
  );
}
