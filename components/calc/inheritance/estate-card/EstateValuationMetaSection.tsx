"use client";

/**
 * 상속개시자료 요약 4표 — Table A 수량·면적 입력 위젯 (지점 ⑤).
 *
 * 2026-06-08: 평가방식 라디오 삭제. 평가방식(Table A 비고 열)은 입력 금액에서
 * 자동 도출(property-valuation.ts resolveValuationMethod) → 별도 입력 불요(중복 제거).
 *
 * 남은 입력:
 *   - areaSqm        (조건부: real_estate_*)  — Table A "수량(면적)" 열
 *   - quantityCount  (조건부: category==="other")
 * 빈 섹션 가드: 부동산·기타자산 외 카테고리(cash·financial·deposit·주식)는 섹션 미렌더.
 *
 * 디자인: docs/02-design/features/inheritance-real-estate-valuation-accordion.ui.design.md §3
 */

import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { isRealEstateCategory } from "@/components/calc/results/source-summary/source-summary-constants";

interface Props {
  item: EstateItem;
  onUpdate: (updated: EstateItem) => void;
}

export function EstateValuationMetaSection({ item, onUpdate }: Props) {
  const cat = item.category;
  const showArea = isRealEstateCategory(cat);
  const showQuantity = cat === "other";

  const set = (patch: Partial<EstateItem>) => onUpdate({ ...item, ...patch });

  // 빈 섹션 가드 — 입력 필드가 없는 카테고리는 렌더하지 않음 (라디오 삭제 후 면적/수량만 남음).
  if (!showArea && !showQuantity) return null;

  return (
    <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-micro font-bold text-emerald-800 select-none">
          §
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          수량·면적 (상속개시자료 요약 표시용)
        </p>
      </div>

      {showArea && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">
            면적 (㎡) — 미입력 시 상속인별 분배 면적 합계 자동 사용
          </p>
          <DecimalInput
            value={item.areaSqm !== undefined ? String(item.areaSqm) : ""}
            onChange={(v) => set({ areaSqm: parseDecimal(v) || undefined })}
            placeholder="자산 전체 면적"
          />
        </div>
      )}

      {showQuantity && (
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">수량 (점)</p>
          <DecimalInput
            value={item.quantityCount !== undefined ? String(item.quantityCount) : ""}
            onChange={(v) => set({ quantityCount: parseDecimal(v) || undefined })}
            placeholder="기타자산 수량"
          />
        </div>
      )}
    </div>
  );
}
