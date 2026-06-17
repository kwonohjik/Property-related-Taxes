"use client";

/**
 * PropertyListInput — 종부세 보유 주택 목록 (요약 테이블 + 편집 모달)
 *
 * 카드 나열 → 요약 테이블(PropertyListTableView) + 행 클릭 시 Dialog 모달(PropertyCardEditor).
 * 상속재산 PropertyValuationForm과 동일한 패턴:
 *   - 추가 직후 자동 모달 오픈 (E-1) — 새 주택 id는 onAdd 후 길이 증가로 감지
 *   - 삭제 시 선택 중이면 모달 자동 닫힘 (E-2)
 * public props(onAdd/onRemove/onUpdate) 동일 → store/validation/API 무변경.
 */

import { useState } from "react";
import { parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PropertyListTableView } from "@/components/calc/PropertyListTableView";
import { PropertyCardEditor } from "@/components/calc/PropertyCardEditor";
import type { PropertyEntry } from "@/lib/stores/comprehensive-wizard-store";

// ============================================================
// Props
// ============================================================

interface Props {
  properties: PropertyEntry[];
  /** 법인 여부 — 법인은 §8④ 의제 비노출 (Step1 매트릭스와 동일 정책) */
  isCorporate?: boolean;
  /** 과세기준일(`${과세연도}-06-01`) — 공시가격 조회 연도 자동 매핑용 */
  referenceDate?: string;
  /** 세부담상한 모드 — "auto"일 때만 모달에 직전연도 공시가격 섹션 노출 */
  capMode: "none" | "auto";
  /** 새 주택 추가 후 그 id 반환 — 추가 직후 자동 모달 오픈에 사용 */
  onAdd: () => string;
  onRemove: (id: string) => void;
  onUpdate: (id: string, data: Partial<PropertyEntry>) => void;
}

// ============================================================
// 메인 컴포넌트 (오케스트레이터)
// ============================================================

export function PropertyListInput({
  properties,
  isCorporate = false,
  referenceDate,
  capMode,
  onAdd,
  onRemove,
  onUpdate,
}: Props) {
  // 편집 모달 대상 (UI ephemeral — zustand store 금지)
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const selectedIndex = properties.findIndex((p) => p.id === selectedPropertyId);
  const selectedProperty = selectedIndex >= 0 ? properties[selectedIndex] : null;
  const totalAssessedValue = properties.reduce((sum, p) => sum + parseAmount(p.assessedValue), 0);
  const canRemove = properties.length > 1;

  // 추가 직후 자동 모달 오픈 (E-1) — addProperty가 새 주택 id를 반환 → 즉시 선택
  const handleAdd = () => {
    const newId = onAdd();
    setSelectedPropertyId(newId);
  };

  /** 삭제 — 삭제 후 모달 자동 닫힘 (E-2) */
  const handleRemove = () => {
    if (!selectedPropertyId) return;
    onRemove(selectedPropertyId);
    setSelectedPropertyId(null);
  };

  return (
    <div className="space-y-4">
      {/* 요약 테이블 (행 클릭 → 편집 모달) */}
      <PropertyListTableView
        properties={properties}
        selectedPropertyId={selectedPropertyId}
        onSelect={setSelectedPropertyId}
      />

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
      <Dialog
        open={selectedPropertyId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedPropertyId(null);
        }}
      >
        <DialogContent
          className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0"
          showCloseButton={false}
        >
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>
              주택 {selectedIndex >= 0 ? selectedIndex + 1 : ""} 편집
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="property-edit-dialog"
          >
            {selectedProperty && (
              <PropertyCardEditor
                key={selectedProperty.id}
                property={selectedProperty}
                isCorporate={isCorporate}
                referenceDate={referenceDate}
                capMode={capMode}
                onUpdate={(data) => onUpdate(selectedProperty.id, data)}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-between items-center">
            {canRemove ? (
              <button
                type="button"
                onClick={handleRemove}
                data-testid={`property-remove-${selectedPropertyId}`}
                className="px-4 py-2 rounded-md text-sm border border-rose-300 text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/30 transition-colors"
              >
                삭제
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setSelectedPropertyId(null)}
              className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 추가 버튼 */}
      <button
        type="button"
        onClick={handleAdd}
        className="w-full rounded-md border border-dashed border-muted-foreground/50 px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-primary transition-colors"
      >
        + 주택 추가
      </button>

      {/* 합산 공시가격 */}
      {properties.length > 1 && totalAssessedValue > 0 && (
        <div className="rounded-md bg-muted/50 border px-4 py-3 flex justify-between items-center text-sm">
          <span className="text-muted-foreground">
            전체 공시가격 합산 ({properties.length}건)
          </span>
          <span className="font-semibold">{formatKRW(totalAssessedValue)}</span>
        </div>
      )}
    </div>
  );
}
