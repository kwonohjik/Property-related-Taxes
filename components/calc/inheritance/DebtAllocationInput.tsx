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
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { HeirAllocationInput } from "./HeirAllocationInput";

interface DebtAllocationInputProps {
  items: DebtItem[];
  heirs: Heir[];
  onChange: (items: DebtItem[]) => void;
}

/**
 * 카테고리별 정적 스타일 매핑 — Tailwind dynamic class purge 차단 (디자인 §4.1).
 * `bg-${tone}-50/60` 같은 dynamic class는 JIT가 인식 못해 production에서 누락 위험.
 */
const CATEGORY_STYLES: Record<
  DebtCategory,
  {
    label: string;
    buttonClass: string;
    cardBorderClass: string;
    chipClass: string;
  }
> = {
  financial: {
    label: "금융채무",
    buttonClass:
      "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40",
    cardBorderClass: "border-rose-200 dark:border-rose-900",
    chipClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  tax: {
    label: "공과금",
    buttonClass:
      "border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40",
    cardBorderClass: "border-amber-200 dark:border-amber-900",
    chipClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  personal: {
    label: "사적채무",
    buttonClass:
      "border-violet-300 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40",
    cardBorderClass: "border-violet-200 dark:border-violet-900",
    chipClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  funeral: {
    label: "장례비",
    buttonClass:
      "border-emerald-300 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40",
    cardBorderClass: "border-emerald-200 dark:border-emerald-900",
    chipClass:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
};

const CATEGORY_ORDER: DebtCategory[] = ["financial", "tax", "personal", "funeral"];

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
      {/* 안내 카드 — 혼합 시나리오 옵션 1 강제 (디자인 §4.3, sky tone) */}
      <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:bg-sky-950/20 p-3">
        <p className="text-xs text-sky-800 dark:text-sky-300">
          협의분할 모드에서는 <strong>모든 채무·공과·장례비</strong>를 항목으로 입력해야 합니다.
          단일 합계 금액만 있으면 위 토글을 끄세요.
        </p>
      </div>

      {/* 카테고리별 추가 버튼 (정적 색조 매핑 — Tailwind purge 차단) */}
      <div className="flex flex-wrap gap-2">
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

      {/* 항목 목록 */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">
          채무·공과금·장례비를 입력하세요. 협의분할 시 상속인별 변제 분담도 입력 가능합니다.
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((it, idx) => {
            const style = CATEGORY_STYLES[it.category];
            return (
              <div
                key={it.id}
                className={`rounded-md border p-3 space-y-2 ${style.cardBorderClass}`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-semibold ${style.chipClass}`}
                  >
                    {style.label}
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

                {/* 장례비 봉안 토글 — native checkbox 금지, ToggleCard 강제 */}
                {it.category === "funeral" && (
                  <ToggleCard
                    tone="emerald"
                    size="sm"
                    title="봉안시설 사용료"
                    description="ON 시 한도 500만 / OFF 시 식대 한도 1,000만"
                    checked={!!it.isBongan}
                    onCheckedChange={(v) => update(idx, { isBongan: v })}
                  />
                )}

                {/* §22 순금융재산 차감 채무 — financial 카테고리만 활성 (상증령 §19④) */}
                <ToggleCard
                  tone="rose"
                  size="sm"
                  title="§22 순금융재산 차감 채무"
                  description={
                    it.category === "financial"
                      ? "§10① 1호 입증된 금융회사등 채무 (상증령 §19④)"
                      : "§19④ — 금융회사등 채무만 §22 차감 대상. 사적채무·공과금·장례비는 제외"
                  }
                  checked={
                    it.category === "financial" &&
                    (it.isFinancialDebtForDeduction ?? true)
                  }
                  onCheckedChange={(v) =>
                    update(idx, { isFinancialDebtForDeduction: v })
                  }
                  disabled={it.category !== "financial"}
                />

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
