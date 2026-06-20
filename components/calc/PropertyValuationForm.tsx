"use client";

/**
 * PropertyValuationForm — 부동산·금융·보증금 자산 평가 입력 (요약 테이블 + 편집 모달)
 *
 * estate-asset-table-view.plan.md · ui.design.md.
 * 카드 나열 → 요약 테이블(EstateItemTableView) + 행 클릭 시 Dialog 모달(EstateItemEditor).
 * 추가 직후 자동 모달 오픈(E-1). public props 동일 → Step1Estate·gift-tax-form-shared 무변경.
 *
 * 지원 카테고리: real_estate_land, real_estate_building, real_estate_apartment,
 *   financial, deposit, cash, other. 주식(listed/unlisted)은 StockValuationForm.
 */

import { useState } from "react";
import { EstateItemTableView } from "@/components/calc/EstateItemTableView";
import { EstateItemEditor } from "@/components/calc/EstateItemEditor";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TotalEstimatedValue } from "@/components/calc/property-valuation-preview";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  GIFT_CATEGORIES,
  type SupportedCategory,
} from "@/components/calc/inheritance/estate-card/estate-category-meta";
import {
  DEEMED_ALLOWED_CATEGORIES,
  DEEMED_FILTER_NOTE,
} from "@/lib/calc/deemed-category-policy";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * 자산 카드별 "효과 평가액" 우선순위 — 시가 > 감정가 > 기준시가 > 보증금(deposit).
 * backwards-compat re-export. 본체는 lib/calc/estate-item-valuation.ts.
 */
export { computeEffectiveValuation } from "@/lib/calc/estate-item-valuation";
/** backwards-compat re-export (본체 lib/calc/deemed-category-policy.ts) */
export { DEEMED_ALLOWED_CATEGORIES, DEEMED_FILTER_NOTE };

// ============================================================
// 카테고리 선택 버튼 (추가 패널)
// ============================================================

interface CategoryButtonProps {
  category: SupportedCategory;
  onAdd: (cat: SupportedCategory) => void;
}

function CategoryButton({ category, onAdd }: CategoryButtonProps) {
  return (
    <button
      type="button"
      onClick={() => onAdd(category)}
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors text-sm"
    >
      <span className="text-base leading-none">{CATEGORY_ICONS[category]}</span>
      <span className="text-gray-700 dark:text-gray-300 leading-tight">
        {CATEGORY_LABELS[category]}
      </span>
    </button>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface PropertyValuationFormProps {
  /** 현재 자산 목록 (주식 제외) */
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  /** "상속" 또는 "증여" — 안내 문구 조정 + 협의분할·옵션 노출 분기 */
  mode?: "inheritance" | "gift";
  /** 협의분할 분배 후보 — inheritance 모드에서 필수 */
  heirs?: Heir[];
  /** 평가기준일 (상속개시일·증여일) — 기준시가 공시연도 기본값 계산용 */
  valuationDate?: string;
  /** 헤더(제목·설명·개수 배지) 숨김 — 외부 접기 래퍼가 헤더를 담당할 때 사용 */
  hideHeader?: boolean;
  /**
   * 추가 패널 열림 상태 (controlled). onAddPanelOpenChange와 함께 전달 시 외부 헤더
   * 버튼이 추가를 트리거 → 하단 기본 "+추가" 버튼 미렌더(중복 방지). 미전달 시 내부 상태 사용.
   */
  addPanelOpen?: boolean;
  onAddPanelOpenChange?: (open: boolean) => void;
}

let _nextId = 1;
function generateId() {
  return `prop-${Date.now()}-${_nextId++}`;
}

export function PropertyValuationForm({
  items,
  onChange,
  mode = "inheritance",
  heirs,
  valuationDate,
  hideHeader = false,
  addPanelOpen,
  onAddPanelOpenChange,
}: PropertyValuationFormProps) {
  const [internalAddPanel, setInternalAddPanel] = useState(false);
  // controlled(외부 헤더 버튼) vs uncontrolled(내부 하단 버튼)
  const isAddControlled = onAddPanelOpenChange !== undefined;
  const showAddPanel = addPanelOpen ?? internalAddPanel;
  const setShowAddPanel = onAddPanelOpenChange ?? setInternalAddPanel;
  // 자산 추가 시 미리 선택할 간주상속재산 분류 (상속세 모드 전용)
  const [pendingDeemed, setPendingDeemed] = useState<
    "none" | "insurance" | "trust" | "retirement"
  >("none");
  // 편집 모달 대상 (UI ephemeral — zustand store 금지)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedIndex = items.findIndex((it) => it.id === selectedItemId);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  /** 테이블 행 선택 → 모달 오픈 (추가 패널 강제 종료) */
  const handleSelect = (id: string) => {
    setSelectedItemId(id);
    setShowAddPanel(false);
    setPendingDeemed("none");
  };

  /** 자산 추가 — 추가 직후 자동 선택(E-1) → Dialog 자동 오픈 */
  const handleAdd = (category: SupportedCategory) => {
    const newItem: EstateItem = {
      id: generateId(),
      category,
      name: "",
      ...(mode === "inheritance" && pendingDeemed !== "none"
        ? { deemedCategory: pendingDeemed }
        : {}),
    };
    onChange([...items, newItem]);
    setSelectedItemId(newItem.id);
    setShowAddPanel(false);
    setPendingDeemed("none");
  };

  const handleUpdate = (index: number, updated: EstateItem) => {
    let next = [...items];
    next[index] = updated;
    // §23의2 동거주택 단일선택 — 한 주택 지정 시 다른 주택 자동 해제(1세대 1주택)
    if (updated.isCohabitantHouse === true) {
      next = next.map((it, i) =>
        i !== index && it.isCohabitantHouse
          ? { ...it, isCohabitantHouse: undefined }
          : it,
      );
    }
    onChange(next);
  };

  /** 삭제 — 삭제 행이 선택 중이면 모달 자동 닫힘(E-2) */
  const handleRemove = (index: number) => {
    const removedId = items[index].id;
    onChange(items.filter((_, i) => i !== index));
    if (selectedItemId === removedId) setSelectedItemId(null);
  };

  const modeLabel = mode === "inheritance" ? "상속" : "증여";

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              {modeLabel}재산 목록
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              주식·지분은 아래 <span className="text-indigo-600 dark:text-indigo-400">주식평가</span> 섹션에 별도 입력
            </p>
          </div>
          {items.length > 0 && (
            <span className="text-xs text-gray-400">{items.length}개 입력됨</span>
          )}
        </div>
      )}

      {/* 요약 테이블 (행 클릭 → 편집 모달) */}
      <EstateItemTableView
        items={items}
        selectedItemId={selectedItemId}
        onSelect={handleSelect}
        mode={mode}
        heirsCount={heirs?.length ?? 0}
        ariaLabel={`${modeLabel}재산 목록`}
      />

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
      <Dialog
        open={selectedItemId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>
              {selectedItem
                ? `${CATEGORY_LABELS[selectedItem.category as SupportedCategory]} 편집`
                : "자산 편집"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="estate-edit-dialog"
          >
            {selectedItem && (
              <EstateItemEditor
                item={selectedItem}
                index={selectedIndex}
                mode={mode}
                heirs={heirs}
                valuationDate={valuationDate}
                onUpdate={(updated) => handleUpdate(selectedIndex, updated)}
                onRemove={() => handleRemove(selectedIndex)}
                hasOtherBurdenedGiftTransfer={
                  mode === "gift"
                    ? items.some(
                        (it, i) =>
                          i !== selectedIndex &&
                          it.burdenedGiftTransferTax !== undefined,
                      )
                    : undefined
                }
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-end">
            <button
              type="button"
              onClick={() => setSelectedItemId(null)}
              className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 자산 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          {/* 상속세 모드 전용: 간주상속재산 분류 사전 선택 → 카드 필터링 */}
          {mode === "inheritance" && (
            <div className="rounded-md border border-violet-200 dark:border-violet-800 bg-violet-50/40 dark:bg-violet-950/20 p-2.5 space-y-1.5">
              <p className="text-[11px] font-semibold text-violet-800 dark:text-violet-200">
                간주상속재산 분류 (§8·§9·§10) — 선택하면 해당 분류에 맞는 재산 종류만 표시됩니다
              </p>
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {([
                  { v: "none", label: "일반 상속재산" },
                  { v: "insurance", label: "보험금 (§8)" },
                  { v: "trust", label: "신탁재산 (§9)" },
                  { v: "retirement", label: "퇴직금 등 (§10)" },
                ] as const).map((opt) => {
                  const active = pendingDeemed === opt.v;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setPendingDeemed(opt.v)}
                      className={
                        "px-2.5 py-1 rounded border transition-colors " +
                        (active
                          ? "border-violet-400 bg-violet-200/70 dark:bg-violet-800/40 text-violet-900 dark:text-violet-100 font-medium"
                          : "border-violet-200/70 dark:border-violet-800/70 bg-white/40 dark:bg-violet-950/10 text-violet-700 dark:text-violet-300 hover:bg-violet-100/60")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {pendingDeemed !== "none" && (
                <p className="text-[11px] text-violet-700 dark:text-violet-300 pt-0.5">
                  ⓘ {DEEMED_FILTER_NOTE[pendingDeemed]}
                </p>
              )}
            </div>
          )}

          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 재산 종류 선택
          </p>
          <div className="grid grid-cols-3 gap-2">
            {(mode === "gift"
              ? GIFT_CATEGORIES
              : DEEMED_ALLOWED_CATEGORIES[pendingDeemed]
            ).map((cat) => (
              <CategoryButton key={cat} category={cat} onAdd={handleAdd} />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setShowAddPanel(false);
              setPendingDeemed("none");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : (
        // controlled(외부 헤더 버튼) 시 하단 기본 버튼 미렌더
        !isAddControlled && (
          <button
            type="button"
            onClick={() => setShowAddPanel(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 py-3 text-sm text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
          >
            <span className="text-lg">+</span>
            {modeLabel}재산 추가
          </button>
        )
      )}

      {/* 합계 */}
      <TotalEstimatedValue items={items} />
    </div>
  );
}
