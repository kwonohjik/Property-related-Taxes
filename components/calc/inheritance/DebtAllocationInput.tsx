"use client";

/**
 * DebtAllocationInput — 채무·공과금·장례비 배열 입력 (Phase G ⑤ + Phase A0)
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
 *   - 협의분할 합계 = 금액 검증 (HeirAllocationInput 재사용)
 */

import type {
  DebtItem,
  Heir,
  DebtCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { HeirAllocationInput } from "./HeirAllocationInput";

interface DebtAllocationInputProps {
  items: DebtItem[];
  heirs: Heir[];
  onChange: (items: DebtItem[]) => void;
}

const CATEGORY_OPTIONS: { value: DebtCategory; label: string; tone: string }[] = [
  { value: "financial", label: "금융채무", tone: "rose" },
  { value: "tax", label: "공과금", tone: "amber" },
  { value: "personal", label: "사적채무", tone: "violet" },
  { value: "funeral", label: "장례비", tone: "emerald" },
];

let nextId = 0;
const newId = () => `debt_${Date.now()}_${++nextId}`;

export function DebtAllocationInput({
  items,
  heirs,
  onChange,
}: DebtAllocationInputProps) {

  const add = (category: DebtCategory) => {
    onChange([
      ...items,
      {
        id: newId(),
        category,
        name: "",
        amount: 0,
        isBongan: category === "funeral" ? false : undefined,
      },
    ]);
  };

  const update = (idx: number, patch: Partial<DebtItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
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
      {/* 카테고리별 추가 버튼 */}
      <div className="flex flex-wrap gap-2">
        {CATEGORY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => add(opt.value)}
            className={`text-xs px-2.5 py-1.5 rounded border border-${opt.tone}-300 bg-${opt.tone}-50/60 dark:bg-${opt.tone}-950/30 text-${opt.tone}-700 dark:text-${opt.tone}-300 hover:bg-${opt.tone}-100 dark:hover:bg-${opt.tone}-900/40`}
          >
            + {opt.label} 추가
          </button>
        ))}
      </div>

      {/* 항목 목록 */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">
          채무·공과금·장례비를 입력하세요. 협의분할 시 상속인별 변제 분담도 입력 가능합니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => {
            const opt = CATEGORY_OPTIONS.find((o) => o.value === it.category)!;
            return (
              <div
                key={it.id}
                className={`rounded-md border border-${opt.tone}-200 dark:border-${opt.tone}-900 p-3 space-y-2`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full bg-${opt.tone}-100 dark:bg-${opt.tone}-900/40 text-${opt.tone}-700 dark:text-${opt.tone}-300 font-semibold`}
                  >
                    {opt.label}
                  </span>
                  <input
                    type="text"
                    placeholder="채권자·내용"
                    value={it.name}
                    onChange={(e) => update(idx, { name: e.target.value })}
                    className="flex-1 px-2 py-1 text-sm rounded border border-border bg-background"
                  />
                  <div className="w-36">
                    <CurrencyInput
                      label=""
                      value={it.amount > 0 ? String(it.amount) : ""}
                      onChange={(v) => update(idx, { amount: parseAmount(v) })}
                      placeholder="금액"
                      hideUnit
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-xs text-muted-foreground hover:text-rose-600 px-1"
                    aria-label="삭제"
                  >
                    ✕
                  </button>
                </div>

                {/* 장례비 봉안 토글 */}
                {it.category === "funeral" && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={!!it.isBongan}
                      onChange={(e) =>
                        update(idx, { isBongan: e.target.checked })
                      }
                    />
                    <span>
                      봉안시설 사용료 (체크 시 한도 500만, 미체크 시 식대 한도 1,000만)
                    </span>
                  </label>
                )}

                {/* 협의분할 */}
                <HeirAllocationInput
                  allocations={it.heirAllocations}
                  expectedTotal={it.amount}
                  heirs={heirs}
                  onChange={(allocs) =>
                    update(idx, { heirAllocations: allocs })
                  }
                />
              </div>
            );
          })}
        </div>
      )}

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
