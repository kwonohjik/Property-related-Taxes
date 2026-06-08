"use client";

/**
 * Step1 — 상속재산 평가 + 추정상속재산 §15
 *
 * steps.tsx에서 분리 (800줄 정책). 상속재산 목록·주식/지분 목록·추정상속재산 §15
 * 3그룹을 CollapsibleEstateGroup으로 감싸 접기/펼치기 + 접힘 요약(개수·합계)을 제공.
 */

import { useMemo } from "react";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { PresumedInheritanceInput } from "./PresumedInheritanceInput";
import { CollapsibleEstateGroup } from "./CollapsibleEstateGroup";
import {
  sumEstateItemsValuation,
  sumPresumedItems,
} from "@/lib/stores/inheritance-summary";
import type { FormState, FormSet } from "./shared";

export function Step1({ form, set }: { form: FormState; set: FormSet }) {
  // 그룹별 합계 — computeInheritanceSummary와 동일 valuation 로직 공유 (접기 헤더 요약용)
  const estateTotal = useMemo(
    () => sumEstateItemsValuation(form.estateItems, form.deathDate),
    [form.estateItems, form.deathDate],
  );
  const stockTotal = useMemo(
    () => sumEstateItemsValuation(form.stockItems, form.deathDate),
    [form.stockItems, form.deathDate],
  );
  const presumedTotal = useMemo(
    () => sumPresumedItems(form.presumedItems),
    [form.presumedItems],
  );

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        상속재산을 모두 입력하세요. 주식은 아래 별도 섹션에 입력합니다.
      </p>

      <CollapsibleEstateGroup
        groupKey="estate"
        title="상속재산 목록"
        description={
          <>
            주식·지분은 아래{" "}
            <span className="text-indigo-600 dark:text-indigo-400">주식평가</span>{" "}
            섹션에 별도 입력
          </>
        }
        count={form.estateItems.length}
        totalAmount={estateTotal}
      >
        <PropertyValuationForm
          items={form.estateItems}
          onChange={(items) => set({ estateItems: items })}
          mode="inheritance"
          heirs={form.heirs}
          valuationDate={form.deathDate}
          hideHeader
        />
      </CollapsibleEstateGroup>

      <div className="border-t border-dashed border-gray-200 dark:border-gray-700 pt-4">
        <CollapsibleEstateGroup
          groupKey="stock"
          title="주식·지분 목록"
          description="상장주식과 비상장주식을 구분하여 입력하세요"
          count={form.stockItems.length}
          totalAmount={stockTotal}
        >
          <StockValuationForm
            items={form.stockItems}
            onChange={(items) => set({ stockItems: items })}
            mode="inheritance"
            valuationDate={form.deathDate}
            heirs={form.heirs}
            hideHeader
          />
        </CollapsibleEstateGroup>
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <CollapsibleEstateGroup
          groupKey="presumed"
          title="추정상속재산 §15"
          description="상속개시 전 2년 이내 처분·인출·차입 중 사용처가 객관적으로 불분명한 금액 (1년 이내 2억 OR 2년 이내 5억 임계)."
          count={form.presumedItems.length}
          totalAmount={presumedTotal}
        >
          <PresumedInheritanceInput
            items={form.presumedItems}
            heirs={form.heirs}
            onChange={(items) => set({ presumedItems: items })}
          />
        </CollapsibleEstateGroup>
      </div>
    </div>
  );
}
