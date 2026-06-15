"use client";

/**
 * StockValuationForm — 상장·비상장주식 평가 입력 (요약 테이블 + 행 클릭 편집 모달)
 * 상속세·증여세 계산 마법사에서 주식 EstateItem[] 입력에 사용
 *
 * 상장주식: 평가기준일 전후 2개월 종가 단순평균 × 주식 수 (상증법 §63①1가)
 * 비상장주식: (순손익가치×3 + 순자산가치×2) ÷ 5
 *             부동산과다보유법인: 순손익가치×2 + 순자산가치×3 ÷ 5 (시행령 §54)
 *
 * 카드 나열 → 요약 테이블(StockItemTableView) + 행 클릭 Dialog 모달(StockItemEditor).
 * stock-item-table-view.{plan,ui.design}.md.
 */

import { useState } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { calcUnlistedStockPerShareValue } from "@/lib/tax-engine/property-valuation-stock";
import { evaluateUnlistedStockV2 } from "@/lib/tax-engine/property-valuation/unlisted-orchestrator";
import { computeStockValuation, resolveUnlistedDisplayMode } from "@/lib/calc/stock-valuation";
import type { EstateItem, Heir } from "@/lib/tax-engine/types/inheritance-gift.types";
import { StockItemTableView } from "@/components/calc/inheritance/stock/StockItemTableView";
import { StockItemEditor } from "@/components/calc/inheritance/stock/StockItemEditor";
import {
  STOCK_CATEGORY_LABELS,
  newStockId,
  type StockCategory,
} from "@/components/calc/inheritance/stock/stock-category-meta";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ============================================================
// 총 주식 평가액 합산
// ============================================================

interface StockTotal {
  items: EstateItem[];
}

function TotalStockValue({ items }: StockTotal) {
  let total = 0;
  for (const item of items) {
    if (item.category === "listed_stock") {
      // ★ C-B/D-8 재배선: computeStockValuation(item) — §63②3호 배당차액 차감 반영 (dual-truth 차단)
      total += computeStockValuation(item);
    } else if (item.category === "unlisted_stock") {
      // 모드 판정 — 단일 진실 헬퍼 (D-4)
      const activeMode = resolveUnlistedDisplayMode(item);
      if (activeMode === "formal" && item.unlistedStockValuationV2) {
        try {
          const result = evaluateUnlistedStockV2(item.unlistedStockValuationV2);
          if (result.totalValuation > 0) total += result.totalValuation;
        } catch {
          // 입력 미완성 — 무시
        }
      } else if (item.unlistedStockData) {
        try {
          const preview = calcUnlistedStockPerShareValue(
            item.unlistedStockData,
            item.unlistedStockData.isRealEstateHeavy ?? false,
          );
          total += preview.perShareFinalValue * item.unlistedStockData.ownedShares;
        } catch {
          // 입력 미완성 — 무시
        }
      }
    }
  }

  if (total === 0 || items.length === 0) return null;

  return (
    <div className="flex-1 rounded-md border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 flex justify-between items-center">
      <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
        주식 합계 (예상)
      </span>
      <span className="text-base font-bold text-indigo-800 dark:text-indigo-200">
        {formatKRW(total)}
      </span>
    </div>
  );
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export interface StockValuationFormProps {
  /** 주식 자산 목록 (listed_stock | unlisted_stock 만) */
  items: EstateItem[];
  onChange: (items: EstateItem[]) => void;
  /** "상속" 또는 "증여" */
  mode?: "inheritance" | "gift";
  /** 평가기준일 (상속개시일 또는 증여일) — F-01 키움 자동조회 트리거 */
  valuationDate?: string;
  /** 협의분할 분배 후보 — inheritance 모드에서 필수 */
  heirs?: Heir[];
  /** 헤더(제목·설명·개수 배지) 숨김 — 외부 접기 래퍼가 헤더를 담당할 때 사용 */
  hideHeader?: boolean;
  /**
   * 추가 패널 열림 상태 (controlled). onAddPanelOpenChange와 함께 전달 시 외부 헤더
   * 버튼이 추가를 트리거 → 하단 기본 "+추가" 버튼 미렌더(중복 방지). 미전달 시 내부 상태 사용.
   */
  addPanelOpen?: boolean;
  onAddPanelOpenChange?: (open: boolean) => void;
}

export function StockValuationForm({
  items,
  onChange,
  mode = "inheritance",
  valuationDate,
  heirs,
  hideHeader = false,
  addPanelOpen,
  onAddPanelOpenChange,
}: StockValuationFormProps) {
  // 부동산과다보유법인 여부는 unlistedStockData.isRealEstateHeavy(store)에 저장 — heavyMap local state 폐지.
  const [internalAddPanel, setInternalAddPanel] = useState(false);
  const isAddControlled = onAddPanelOpenChange !== undefined;
  const showAddPanel = addPanelOpen ?? internalAddPanel;
  const setShowAddPanel = onAddPanelOpenChange ?? setInternalAddPanel;

  // 편집 모달 대상 (UI ephemeral — zustand store 금지)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const selectedIndex = items.findIndex((it) => it.id === selectedItemId);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  /** 테이블 행 선택 → 모달 오픈 (추가 패널 강제 종료) */
  const handleSelect = (id: string) => {
    setSelectedItemId(id);
    setShowAddPanel(false);
  };

  /** 주식 추가 — 추가 직후 자동 선택(E-1) → Dialog 자동 오픈 */
  const handleAdd = (category: "listed_stock" | "unlisted_stock") => {
    const newItem: EstateItem = {
      id: newStockId(),
      category,
      name: "",
      ...(category === "unlisted_stock"
        ? {
            unlistedValuationMode: "simple" as const,
            unlistedStockData: {
              totalShares: 0,
              ownedShares: 0,
              weightedNetIncome: 0,
              netAssetValue: 0,
              capitalizationRate: 0.1,
            },
          }
        : {}),
    };
    onChange([...items, newItem]);
    setSelectedItemId(newItem.id);
    setShowAddPanel(false);
  };

  const handleUpdate = (index: number, updated: EstateItem) => {
    const next = [...items];
    next[index] = updated;
    onChange(next);
  };

  /** 삭제 — 삭제 행이 선택 중이면 모달 자동 닫힘(E-2) */
  const handleRemove = (index: number) => {
    const removedId = items[index]?.id;
    onChange(items.filter((_, i) => i !== index));
    if (selectedItemId === removedId) setSelectedItemId(null);
  };

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              주식·지분 목록
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              상장주식과 비상장주식을 구분하여 입력하세요
            </p>
          </div>
          {items.length > 0 && (
            <span className="text-xs text-gray-400">{items.length}개 입력됨</span>
          )}
        </div>
      )}

      {/* 요약 테이블 (행 클릭 → 편집 모달) */}
      <StockItemTableView
        items={items}
        selectedItemId={selectedItemId}
        onSelect={handleSelect}
        mode={mode}
        heirsCount={heirs?.length ?? 0}
        valuationDate={valuationDate}
        ariaLabel="주식·지분 목록"
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
                ? `${STOCK_CATEGORY_LABELS[selectedItem.category as StockCategory] ?? "주식"} 편집`
                : "주식 편집"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[85vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="stock-edit-dialog"
          >
            {selectedItem && (
              <StockItemEditor
                item={selectedItem}
                index={selectedIndex}
                mode={mode}
                heirs={heirs}
                valuationDate={valuationDate}
                onUpdate={(updated) => handleUpdate(selectedIndex, updated)}
                onRemove={() => handleRemove(selectedIndex)}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-between">
            <button
              type="button"
              onClick={() => handleRemove(selectedIndex)}
              className="px-4 py-2 rounded-md text-sm border border-rose-300 dark:border-rose-700 text-rose-600 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              🗑 삭제
            </button>
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

      {/* 추가 패널 */}
      {showAddPanel ? (
        <div className="border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg p-4 space-y-3">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
            추가할 주식 종류 선택
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleAdd("listed_stock")}
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <span className="text-2xl">📈</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                상장주식
              </span>
              <span className="text-xs text-gray-400 text-center">
                코스피·코스닥 등 거래소 상장
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleAdd("unlisted_stock")}
              className="flex flex-col items-center gap-1 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
            >
              <span className="text-2xl">📋</span>
              <span className="text-xs font-medium text-gray-700 dark:text-gray-200">
                비상장주식
              </span>
              <span className="text-xs text-gray-400 text-center">
                장외 거래 법인 주식·지분
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={() => setShowAddPanel(false)}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            취소
          </button>
        </div>
      ) : null}

      {/* 추가 버튼 + 합계 — 한 행(좌: 추가, 우: 주식 합계 예상). 추가 버튼/합계 어느 한쪽만 있으면 전체폭. */}
      <div className="flex items-center gap-3">
        <TotalStockValue items={items} />
        {/* 하단 추가 버튼 — uncontrolled(증여세 등)는 항상, controlled(상속 헤더 버튼)는
            목록이 있을 때만(빈 목록은 헤더 버튼 단독 → 추가 트리거 중복·E2E strict 위반 회피).
            컴팩트 알약 · 우측 끝 정렬(ml-auto). */}
        {!showAddPanel && (!isAddControlled || items.length > 0) && (
          <button
            type="button"
            onClick={() => setShowAddPanel(true)}
            data-testid="stock-add-bottom"
            className="shrink-0 ml-auto inline-flex items-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-700 px-3 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-300 hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
          >
            <span className="text-sm">+</span>
            주식·지분 추가
          </button>
        )}
      </div>
    </div>
  );
}
