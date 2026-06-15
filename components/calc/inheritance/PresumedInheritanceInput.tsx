"use client";

/**
 * PresumedInheritanceInput — 추정상속재산 §15 4종 카테고리 (요약 테이블 + 편집 모달)
 *
 * estate-asset-table-view.plan.md §4.2·§7 · ui.design.md §7.
 * 카드 나열 → 요약 테이블(종류·임계·가산액·분할) + 행 클릭 시 Dialog 모달.
 * 카테고리당 1건(추가 버튼, 이미 있으면 disabled). 추가 직후 모달 자동 오픈.
 *
 * 종합사례 PDF 책 1857 재현:
 *   - 부동산처분: 1년 385M + 2년 500M, 확인 600M → 108M 가산
 *   - 예금인출: 2년 1,500M, 확인 1,200M → 100M 가산
 *   - 기타재산: 1년 180M (200M 미만 → 임계 미발동, 0)
 *   - 금융기관채무: 2년 1,000M, 확인 658M → 142M 가산
 *
 * 임계 자동 판정: 1년 ≥ 2억 OR 2년 ≥ 5억 → 발동. Min(처분금액 × 20%, 2억) 차감.
 *   추정상속재산 가산 = max(0, 미소명 − 기준차감)
 */

import { useState } from "react";
import type {
  PresumedInheritanceItem,
  Heir,
  PresumedCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluatePresumedItem } from "@/lib/tax-engine/presumed-inheritance";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { HeirAllocationInput } from "./HeirAllocationInput";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PresumedInheritanceInputProps {
  items: PresumedInheritanceItem[];
  heirs: Heir[];
  onChange: (items: PresumedInheritanceItem[]) => void;
}

/**
 * 카테고리별 정적 스타일 매핑 — Tailwind dynamic class purge 차단 (feedback_tailwind_static_tone_mapping).
 */
const CATEGORY_META: Record<
  PresumedCategory,
  { label: string; hint: string; buttonClass: string; chipClass: string }
> = {
  real_estate: {
    label: "부동산 및 부동산권리 처분",
    hint: "토지·건물·아파트 등 부동산 및 권리의 처분금액",
    buttonClass:
      "border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40",
    chipClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  deposit: {
    label: "예금 인출액",
    hint: "예금·적금 등의 인출금액 (사용처 미입증 부분)",
    buttonClass:
      "border-sky-300 bg-sky-50/60 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-900/40",
    chipClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  other_asset: {
    label: "기타재산 처분",
    hint: "영업권·유가증권·회원권 등 기타재산의 처분금액",
    buttonClass:
      "border-violet-300 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40",
    chipClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  financial_debt: {
    label: "금융기관 채무 부담",
    hint: "은행·금융기관에서 부담한 채무액 (사용처 미입증 부분)",
    buttonClass:
      "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40",
    chipClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

let nextId = 0;
const newId = () => `presumed_${Date.now()}_${++nextId}`;

// ============================================================
// 요약 테이블
// ============================================================

interface PresumedTableProps {
  items: PresumedInheritanceItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function PresumedTable({ items, selectedId, onSelect }: PresumedTableProps) {
  if (items.length === 0) return null;
  return (
    <div className="overflow-x-auto" role="group" aria-label="추정상속재산 목록">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-gray-200 dark:border-gray-700">
            <th className="py-2 text-left pl-3 text-gray-500 font-medium">종류</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">임계</th>
            <th className="py-2 text-right pr-2 text-gray-500 font-medium">가산액</th>
            <th className="py-2 text-left pl-2 text-gray-500 font-medium">분할</th>
            <th className="w-8 py-2 text-right pr-3 text-gray-400 font-medium text-[10px]">편집</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => {
            const meta = CATEGORY_META[it.category];
            const result = evaluatePresumedItem(it);
            const hasAllocation = (it.heirAllocations?.length ?? 0) > 0;
            const handleKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(it.id);
              }
            };
            return (
              <tr
                key={it.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(it.id)}
                onKeyDown={handleKeyDown}
                aria-label={`${meta.label} 편집`}
                className={
                  "cursor-pointer border-b border-gray-100 dark:border-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 " +
                  (it.id === selectedId
                    ? "bg-violet-50/70 dark:bg-violet-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/30")
                }
                data-testid={`presumed-table-row-${it.id}`}
              >
                <td className="pl-3 py-1.5 text-xs">
                  <span className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full ${meta.chipClass}`}>
                    {meta.label}
                  </span>
                </td>
                <td className="pl-2 py-1.5 text-xs">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      result.thresholdTriggered
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    }`}
                  >
                    {result.thresholdTriggered ? "임계 발동" : "미발동"}
                  </span>
                </td>
                <td className="pr-2 py-1.5 text-xs text-right font-mono tabular-nums whitespace-nowrap">
                  {result.addedAmount > 0 ? (
                    result.addedAmount.toLocaleString()
                  ) : (
                    <span className="text-gray-400">0</span>
                  )}
                </td>
                <td className="pl-2 py-1.5 text-xs">
                  {hasAllocation ? (
                    <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                      협의
                    </span>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </td>
                <td className="pr-3 py-1.5 text-right text-gray-300 dark:text-gray-600 text-xs select-none">
                  ✎
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================
// 편집 모달 내용 (3입력 + 결과 미리보기 + 협의분할)
// ============================================================

interface PresumedItemEditorProps {
  item: PresumedInheritanceItem;
  heirs: Heir[];
  onUpdate: (patch: Partial<PresumedInheritanceItem>) => void;
}

function PresumedItemEditor({ item, heirs, onUpdate }: PresumedItemEditorProps) {
  const meta = CATEGORY_META[item.category];
  const result = evaluatePresumedItem(item);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{meta.hint}</p>

      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="text-xs text-muted-foreground">1년 이내</label>
          <CurrencyInput
            label=""
            value={item.amountWithin1Y > 0 ? String(item.amountWithin1Y) : ""}
            onChange={(v) => onUpdate({ amountWithin1Y: parseAmount(v) })}
            placeholder="0"
            hideUnit
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">1년 초과~2년 이내</label>
          <CurrencyInput
            label=""
            value={item.amountWithin2Y > 0 ? String(item.amountWithin2Y) : ""}
            onChange={(v) => onUpdate({ amountWithin2Y: parseAmount(v) })}
            placeholder="0"
            hideUnit
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">사용처 확인 금액</label>
          <CurrencyInput
            label=""
            value={item.verifiedUseAmount > 0 ? String(item.verifiedUseAmount) : ""}
            onChange={(v) => onUpdate({ verifiedUseAmount: parseAmount(v) })}
            placeholder="0"
            hideUnit
          />
        </div>
      </div>

      {result.thresholdTriggered && (
        <div className="text-xs px-2 py-1.5 rounded bg-white dark:bg-slate-900 border border-border space-y-0.5">
          <div>소명대상 {formatKRW(result.scrutinyAmount)} − 확인 {formatKRW(item.verifiedUseAmount)} = 미소명 {formatKRW(result.unverifiedAmount)}</div>
          <div>− 기준차감 {formatKRW(result.baseDeduction)} (Min(처분×20%, 2억))</div>
          <div className="font-semibold pt-0.5 border-t border-border">
            추정상속재산 가산 = {formatKRW(result.addedAmount)}
          </div>
        </div>
      )}

      {result.addedAmount > 0 && (
        <HeirAllocationInput
          allocations={item.heirAllocations}
          expectedTotal={result.addedAmount}
          heirs={heirs}
          onChange={(allocs) => onUpdate({ heirAllocations: allocs })}
        />
      )}
    </div>
  );
}

// ============================================================
// 메인
// ============================================================

export function PresumedInheritanceInput({
  items,
  heirs,
  onChange,
}: PresumedInheritanceInputProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedIndex = items.findIndex((it) => it.id === selectedId);
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  const add = (category: PresumedCategory) => {
    // 카테고리당 1건
    if (items.find((it) => it.category === category)) return;
    const item: PresumedInheritanceItem = {
      id: newId(),
      category,
      amountWithin1Y: 0,
      amountWithin2Y: 0,
      verifiedUseAmount: 0,
    };
    onChange([...items, item]);
    setSelectedId(item.id); // 추가 직후 모달 자동 오픈
  };

  const update = (idx: number, patch: Partial<PresumedInheritanceItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const remove = (idx: number) => {
    const removedId = items[idx].id;
    onChange(items.filter((_, i) => i !== idx));
    if (selectedId === removedId) setSelectedId(null);
  };

  const total = items.reduce((s, it) => s + evaluatePresumedItem(it).addedAmount, 0);

  return (
    <div className="space-y-3">
      {/* 카테고리별 추가 버튼 (카테고리당 1건 — 이미 있으면 disabled) */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(CATEGORY_META) as PresumedCategory[]).map((cat) => {
          const exists = !!items.find((it) => it.category === cat);
          const meta = CATEGORY_META[cat];
          return (
            <button
              key={cat}
              type="button"
              onClick={() => add(cat)}
              disabled={exists}
              className={`text-xs px-2.5 py-1.5 rounded border ${
                exists
                  ? "opacity-40 cursor-not-allowed border-border text-muted-foreground"
                  : meta.buttonClass
              }`}
            >
              {exists ? "✓ " : "+ "}
              {meta.label}
            </button>
          );
        })}
      </div>

      {/* 요약 테이블 또는 빈 안내 */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">
          해당하는 항목이 있으면 위 버튼으로 추가하세요.
        </p>
      ) : (
        <PresumedTable items={items} selectedId={selectedId} onSelect={setSelectedId} />
      )}

      {/* 편집 모달 */}
      <Dialog
        open={selectedId !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent className="sm:max-w-[min(50.4rem,calc(100%-2rem))] w-full p-0" showCloseButton={false}>
          <DialogHeader className="px-4 pt-4 pb-0">
            <DialogTitle>
              {selectedItem ? `${CATEGORY_META[selectedItem.category].label} 편집` : "추정상속재산 편집"}
            </DialogTitle>
          </DialogHeader>
          <div
            className="max-h-[80vh] overflow-y-auto px-4 pb-4 pt-3"
            data-testid="presumed-edit-dialog"
          >
            {selectedItem && (
              <PresumedItemEditor
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
              className="px-3 py-2 rounded-md text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors"
            >
              삭제
            </button>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="px-4 py-2 rounded-md text-sm border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              닫기
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 합계 */}
      {items.length > 0 && (
        <div className="text-xs text-muted-foreground px-2 border-t border-border pt-2">
          추정상속재산 합계 가산액 = <span className="font-semibold">{formatKRW(total)}</span>
        </div>
      )}
    </div>
  );
}
