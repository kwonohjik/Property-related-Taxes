"use client";

/**
 * Step1 — 상속재산 평가 + 추정상속재산 §15
 *
 * steps.tsx에서 분리 (800줄 정책). 상속재산 목록·주식/지분 목록·추정상속재산 §15
 * 3그룹을 CollapsibleEstateGroup으로 감싸 접기/펼치기 + 접힘 요약(개수·합계)을 제공.
 */

import { useMemo, useState } from "react";
import { PropertyValuationForm } from "@/components/calc/PropertyValuationForm";
import { StockValuationForm } from "@/components/calc/StockValuationForm";
import { PresumedInheritanceInput } from "./PresumedInheritanceInput";
import { CollapsibleEstateGroup } from "./CollapsibleEstateGroup";
import {
  sumEstateItemsValuation,
  sumPresumedItems,
} from "@/lib/stores/inheritance-summary";
import type { FormState, FormSet } from "./shared";

/** 섹션 헤더 우측 "+ 추가" 버튼 — 상속인 추가 버튼(HeirComposition)과 동형 스타일 */
function SectionAddButton({
  onClick,
  label,
  testId,
}: {
  onClick: () => void;
  label: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="shrink-0 rounded-md border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-[11px] font-medium text-indigo-800 hover:bg-indigo-200 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
    >
      + {label}
    </button>
  );
}

export function Step1({ form, set }: { form: FormState; set: FormSet }) {
  // 추가 패널 열림 상태 — 헤더 "+추가" 버튼(controlled)이 토글
  const [estateAddOpen, setEstateAddOpen] = useState(false);
  const [stockAddOpen, setStockAddOpen] = useState(false);
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
        sectionNum={1}
        tone="sky"
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
        headerAction={
          !estateAddOpen && (
            <SectionAddButton
              onClick={() => setEstateAddOpen(true)}
              label="상속재산 추가"
              testId="estate-add-header-estate"
            />
          )
        }
      >
        <PropertyValuationForm
          items={form.estateItems}
          onChange={(items) => set({ estateItems: items })}
          mode="inheritance"
          heirs={form.heirs}
          valuationDate={form.deathDate}
          hideHeader
          addPanelOpen={estateAddOpen}
          onAddPanelOpenChange={setEstateAddOpen}
        />
      </CollapsibleEstateGroup>

      <CollapsibleEstateGroup
        groupKey="stock"
        sectionNum={2}
        tone="emerald"
        title="주식·지분 목록"
        description="상장주식과 비상장주식을 구분하여 입력하세요"
        count={form.stockItems.length}
        totalAmount={stockTotal}
        headerAction={
          !stockAddOpen && (
            <SectionAddButton
              onClick={() => setStockAddOpen(true)}
              label="주식·지분 추가"
              testId="estate-add-header-stock"
            />
          )
        }
      >
        <StockValuationForm
          items={form.stockItems}
          onChange={(items) => set({ stockItems: items })}
          mode="inheritance"
          valuationDate={form.deathDate}
          heirs={form.heirs}
          hideHeader
          addPanelOpen={stockAddOpen}
          onAddPanelOpenChange={setStockAddOpen}
        />
      </CollapsibleEstateGroup>

      <CollapsibleEstateGroup
        groupKey="presumed"
        sectionNum={3}
        tone="amber"
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
  );
}
