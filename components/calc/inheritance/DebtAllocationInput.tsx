"use client";

/**
 * DebtAllocationInput — 채무·공과금·장례비 배열 입력 (요약 테이블 + 편집 모달)
 *
 * debt-item-table-view.plan.md.
 * 항목 카드 나열 → 요약 테이블(DebtItemTableView) + 행 클릭 시 Dialog 모달(DebtItemEditor).
 * 추가 직후 자동 모달 오픈(E-1). public props 동일 → steps.tsx 무변경.
 *
 * 종합사례 PDF 책 1858 (3) 채무 협의분할 표 재현:
 *   - K은행 400M → 장남 전액
 *   - S저축 745M → 배우자 500M + 차남 245M
 *   - 종합소득세 55M → 차남
 *   - 장례비 18M (한도 10M) + 봉안 15M (한도 5M)
 *
 * 정책:
 *   - debtItems 입력 시 legacy debts·funeralExpense 무시 (orchestrator STEP 3 우선)
 *   - 장례비 한도 자동 표시 (식대 1천만 / 봉안 5백만)
 */

import { useState } from "react";
import type {
  DebtItem,
  Heir,
  DebtCategory,
  DerivedCollateralDebt,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { heirShortLabel } from "./HeirAllocationInput";
import { DebtItemTableView } from "./DebtItemTableView";
import { DebtItemEditor } from "./DebtItemEditor";
import {
  CATEGORY_STYLES,
  CATEGORY_ORDER,
  newDebtId,
} from "./debt-category-meta";

interface DebtAllocationInputProps {
  items: DebtItem[];
  heirs: Heir[];
  onChange: (items: DebtItem[]) => void;
  /**
   * 재산평가에서 파생된 담보채무 목록 (B5 §3-2).
   * derive only — 이 prop은 표시만. onChange(debtItems)로 store에 쓰지 않음 (mirror-pattern).
   */
  derivedCollateralDebts?: DerivedCollateralDebt[];
}

/** 정적 slate tone 클래스 매핑 — Tailwind JIT purge 차단 (feedback_tailwind_static_tone_mapping) */
const SLATE_CARD = {
  border: "border-slate-300 dark:border-slate-700",
  bg: "bg-slate-50/60 dark:bg-slate-900/20",
  text: "text-slate-700 dark:text-slate-300",
  badge: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
} as const;

export function DebtAllocationInput({
  items,
  heirs,
  onChange,
  derivedCollateralDebts = [],
}: DebtAllocationInputProps) {
  // 편집 모달 대상 (UI ephemeral — zustand store 금지)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  const selectedIndex = items.findIndex((it) => it.id === selectedItemId);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  /** 항목 추가 — 추가 직후 자동 선택(E-1) → Dialog 자동 오픈 */
  const add = (category: DebtCategory) => {
    const newItem: DebtItem = {
      id: newDebtId(),
      category,
      name: "",
      amount: 0,
      isBongan: category === "funeral" ? false : undefined,
    };
    onChange([...items, newItem]);
    setSelectedItemId(newItem.id);
  };

  const update = (idx: number, patch: Partial<DebtItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  /** 삭제 — 삭제 행이 선택 중이면 모달 자동 닫힘(E-2) */
  const remove = (idx: number) => {
    const removedId = items[idx].id;
    onChange(items.filter((_, i) => i !== idx));
    if (selectedItemId === removedId) setSelectedItemId(null);
  };

  // 카테고리별 합계
  const totals: Record<DebtCategory, number> = {
    financial: 0,
    tax: 0,
    personal: 0,
    funeral: 0,
  };
  let funeralMeal = 0;
  let funeralBongan = 0;
  for (const it of items) {
    totals[it.category] += it.amount;
    if (it.category === "funeral") {
      if (it.isBongan) funeralBongan += it.amount;
      else funeralMeal += it.amount;
    }
  }
  const funeralAppliedMeal = Math.min(funeralMeal, 10_000_000);
  const funeralAppliedBongan = Math.min(funeralBongan, 5_000_000);
  const funeralApplied = funeralAppliedMeal + funeralAppliedBongan;

  return (
    <div className="space-y-3">
      {/* 담보채무 §14 자동공제 자동노출 카드 (설계 §3-2 B5) — derive only, store 쓰기 금지 */}
      {derivedCollateralDebts.length > 0 && (
        <div
          className={`rounded-md border p-3 space-y-2 ${SLATE_CARD.border} ${SLATE_CARD.bg}`}
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm select-none">🔒</span>
            <p className={`text-xs font-semibold ${SLATE_CARD.text}`}>
              자산 평가에서 반영된 담보채무 (§14 자동 공제)
            </p>
          </div>
          <div className="space-y-1.5">
            {derivedCollateralDebts.map((d) => {
              // 상속인별 분배 표시 텍스트
              const allocationText =
                d.heirAllocations && d.heirAllocations.length > 0
                  ? d.heirAllocations
                      .map((a) => {
                        const h = heirs.find((h) => h.id === a.heirId);
                        // feedback_no_internal_id_in_result: id 대신 관계 라벨 fallback
                        const label = h ? heirShortLabel(h) : "상속인";
                        return `${label} ${formatKRW(a.amount)}`;
                      })
                      .join(" · ")
                  : "법정상속분";
              return (
                <div
                  key={d.estateItemId}
                  className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-700 dark:text-gray-300"
                >
                  <span className="font-medium">{d.creditorName}</span>
                  <span className="font-mono">{formatKRW(d.amount)}</span>
                  {d.financialDebtAmount > 0 && (
                    <span
                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${SLATE_CARD.badge}`}
                    >
                      금융채무 {formatKRW(d.financialDebtAmount)}
                    </span>
                  )}
                  <span className="text-gray-400 dark:text-gray-500">
                    분배: {allocationText}
                  </span>
                </div>
              );
            })}
          </div>
          <p className={`text-[10px] ${SLATE_CARD.text}`}>
            이 채무는 재산평가에서 자동 §14 공제됩니다. 수정은 재산평가 화면에서.
            아래에 중복 입력하지 마세요 (이중 공제 위험).
          </p>
        </div>
      )}

      {/* 안내 카드 — 혼합 시나리오 옵션 1 강제 (디자인 §4.3, sky tone) */}
      <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 p-3">
        <p className="text-xs text-sky-800 dark:text-sky-300">
          협의분할 모드에서는 <strong>모든 채무·공과·장례비</strong>를 항목으로 입력해야 합니다.
          단일 합계 금액만 있으면 위 토글을 끄세요.
        </p>
      </div>

      {/* 요약 테이블 (행 클릭 → 편집 모달) */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">
          채무·공과금·장례비를 입력하세요. 아래 + 버튼으로 카테고리별 추가 가능합니다.
          협의분할 시 상속인별 변제 분담도 입력 가능합니다.
        </p>
      ) : (
        <DebtItemTableView
          items={items}
          selectedItemId={selectedItemId}
          onSelect={(id) => setSelectedItemId(id)}
          heirs={heirs}
        />
      )}

      {/* 편집 모달 — 행 클릭 또는 추가 직후 자동 오픈 */}
      <Dialog
        open={selectedItemId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedItemId(null);
        }}
      >
        <DialogContent className="sm:max-w-lg w-full p-0" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>
              {selectedItem
                ? `${CATEGORY_STYLES[selectedItem.category].label} 편집`
                : "항목 편집"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="debt-edit-dialog"
          >
            {selectedItem && (
              <DebtItemEditor
                item={selectedItem}
                heirs={heirs}
                onUpdate={(patch) => update(selectedIndex, patch)}
              />
            )}
          </div>
          <div className="border-t px-4 py-3 flex justify-between">
            <button
              type="button"
              onClick={() => remove(selectedIndex)}
              className="px-4 py-2 rounded-md text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
            >
              삭제
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

      {/* 카테고리별 추가 버튼 — 테이블 하단 배치 (다건 추가 시 한 방향 down-scroll) */}
      <div className="flex flex-wrap gap-2" data-testid="debt-add-buttons">
        {CATEGORY_ORDER.map((cat) => {
          const style = CATEGORY_STYLES[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => add(cat)}
              className={`text-xs px-2.5 py-1.5 rounded border ${style.buttonClass}`}
            >
              + {style.label} 추가
            </button>
          );
        })}
      </div>

      {/* 합계 요약 */}
      {items.length > 0 && (
        <div className="text-xs text-muted-foreground space-y-0.5 px-2 border-t border-border pt-2">
          <div>
            금융채무 {formatKRW(totals.financial)} · 공과금 {formatKRW(totals.tax)}
            {totals.personal > 0 && ` · 사적채무 ${formatKRW(totals.personal)}`}
          </div>
          {(funeralMeal > 0 || funeralBongan > 0) && (
            <div>
              장례비 식대 {formatKRW(funeralMeal)} → 한도 {formatKRW(funeralAppliedMeal)} ·
              봉안 {formatKRW(funeralBongan)} → 한도 {formatKRW(funeralAppliedBongan)}
              {" "}
              <span className="font-semibold">합계 {formatKRW(funeralApplied)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
