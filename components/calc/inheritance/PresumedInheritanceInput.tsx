"use client";

/**
 * PresumedInheritanceInput — 추정상속재산 §15 4종 카테고리 입력 (Phase G ⑤ + Phase A)
 *
 * 종합사례 PDF 책 1857 재현:
 *   - 부동산처분: 1년 385M + 2년 500M, 확인 600M → 108M 가산
 *   - 예금인출: 2년 1,500M, 확인 1,200M → 100M 가산
 *   - 기타재산: 1년 180M (200M 미만 → 임계 미발동, 0)
 *   - 금융기관채무: 2년 1,000M, 확인 658M → 142M 가산
 *
 * 임계 자동 판정 안내:
 *   - 1년 ≥ 2억 OR 2년 ≥ 5억 → 발동
 *   - Min(처분금액 × 20%, 2억) 차감
 *   - 추정상속재산 가산 = max(0, 미소명 − 기준차감)
 */

import type {
  PresumedInheritanceItem,
  Heir,
  PresumedCategory,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { evaluatePresumedItem } from "@/lib/tax-engine/presumed-inheritance";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { HeirAllocationInput } from "./HeirAllocationInput";

interface PresumedInheritanceInputProps {
  items: PresumedInheritanceItem[];
  heirs: Heir[];
  onChange: (items: PresumedInheritanceItem[]) => void;
}

/**
 * 카테고리별 정적 스타일 매핑 — Tailwind dynamic class purge 차단 (feedback_tailwind_static_tone_mapping).
 * `border-${meta.tone}-300` 같은 동적 보간은 JIT가 인식 못해 production에서 색상 누락 위험.
 * DebtAllocationInput.CATEGORY_STYLES 패턴 동일 적용.
 */
const CATEGORY_META: Record<
  PresumedCategory,
  {
    label: string;
    hint: string;
    /** 버튼 활성 상태 클래스 (disabled 아닐 때) */
    buttonClass: string;
    /** 카드 border + 배경 클래스 */
    cardClass: string;
    /** 칩(레이블 badge) 클래스 */
    chipClass: string;
  }
> = {
  real_estate: {
    label: "부동산 및 부동산권리 처분",
    hint: "토지·건물·아파트 등 부동산 및 권리의 처분금액",
    buttonClass:
      "border-amber-300 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-900/40",
    cardClass:
      "border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20",
    chipClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  deposit: {
    label: "예금 인출액",
    hint: "예금·적금 등의 인출금액 (사용처 미입증 부분)",
    buttonClass:
      "border-sky-300 bg-sky-50/60 text-sky-700 hover:bg-sky-100 dark:bg-sky-950/30 dark:text-sky-300 dark:hover:bg-sky-900/40",
    cardClass:
      "border-sky-200 dark:border-sky-900 bg-sky-50/30 dark:bg-sky-950/20",
    chipClass:
      "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  },
  other_asset: {
    label: "기타재산 처분",
    hint: "영업권·유가증권·회원권 등 기타재산의 처분금액",
    buttonClass:
      "border-violet-300 bg-violet-50/60 text-violet-700 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-900/40",
    cardClass:
      "border-violet-200 dark:border-violet-900 bg-violet-50/30 dark:bg-violet-950/20",
    chipClass:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  financial_debt: {
    label: "금융기관 채무 부담",
    hint: "은행·금융기관에서 부담한 채무액 (사용처 미입증 부분)",
    buttonClass:
      "border-rose-300 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/40",
    cardClass:
      "border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20",
    chipClass:
      "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
};

let nextId = 0;
const newId = () => `presumed_${Date.now()}_${++nextId}`;

export function PresumedInheritanceInput({
  items,
  heirs,
  onChange,
}: PresumedInheritanceInputProps) {

  const add = (category: PresumedCategory) => {
    // 이미 있으면 추가하지 않음 (카테고리당 1건)
    if (items.find((it) => it.category === category)) return;
    onChange([
      ...items,
      {
        id: newId(),
        category,
        amountWithin1Y: 0,
        amountWithin2Y: 0,
        verifiedUseAmount: 0,
      },
    ]);
  };

  const update = (idx: number, patch: Partial<PresumedInheritanceItem>) => {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const remove = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const total = items.reduce((s, it) => {
    const r = evaluatePresumedItem(it);
    return s + r.addedAmount;
  }, 0);

  return (
    <div className="space-y-3">
      {/* 카테고리별 추가 버튼 */}
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

      {/* 카드 */}
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground italic px-2">
          상속개시 전 2년 이내 처분·인출·차입 중 사용처가 불명한 금액이 있으면 입력하세요.
          1년 이내 2억원 OR 2년 이내 5억원 임계 발동.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((it, idx) => {
            const meta = CATEGORY_META[it.category];
            const result = evaluatePresumedItem(it);
            return (
              <div
                key={it.id}
                className={`rounded-md border p-3 space-y-2 ${meta.cardClass}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.chipClass}`}
                    >
                      {meta.label}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        result.thresholdTriggered
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {result.thresholdTriggered ? "임계 발동" : "미발동"}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(idx)}
                    className="text-xs text-muted-foreground hover:text-rose-600 px-1"
                  >
                    ✕
                  </button>
                </div>

                <p className="text-xs text-muted-foreground">{meta.hint}</p>

                {/* 3 입력 그리드 */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground">1년 이내</label>
                    <CurrencyInput
                      label=""
                      value={it.amountWithin1Y > 0 ? String(it.amountWithin1Y) : ""}
                      onChange={(v) => update(idx, { amountWithin1Y: parseAmount(v) })}
                      placeholder="0"
                      hideUnit
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">1년 초과~2년 이내</label>
                    <CurrencyInput
                      label=""
                      value={it.amountWithin2Y > 0 ? String(it.amountWithin2Y) : ""}
                      onChange={(v) => update(idx, { amountWithin2Y: parseAmount(v) })}
                      placeholder="0"
                      hideUnit
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">사용처 확인 금액</label>
                    <CurrencyInput
                      label=""
                      value={it.verifiedUseAmount > 0 ? String(it.verifiedUseAmount) : ""}
                      onChange={(v) => update(idx, { verifiedUseAmount: parseAmount(v) })}
                      placeholder="0"
                      hideUnit
                    />
                  </div>
                </div>

                {/* 결과 미리보기 */}
                {result.thresholdTriggered && (
                  <div className="text-xs px-2 py-1.5 rounded bg-white dark:bg-slate-900 border border-border space-y-0.5">
                    <div>소명대상 {formatKRW(result.scrutinyAmount)} − 확인 {formatKRW(it.verifiedUseAmount)} = 미소명 {formatKRW(result.unverifiedAmount)}</div>
                    <div>− 기준차감 {formatKRW(result.baseDeduction)} (Min(처분×20%, 2억))</div>
                    <div className="font-semibold pt-0.5 border-t border-border">
                      추정상속재산 가산 = {formatKRW(result.addedAmount)}
                    </div>
                  </div>
                )}

                {/* 협의분할 */}
                {result.addedAmount > 0 && (
                  <HeirAllocationInput
                    allocations={it.heirAllocations}
                    expectedTotal={result.addedAmount}
                    heirs={heirs}
                    onChange={(allocs) => update(idx, { heirAllocations: allocs })}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 합계 */}
      {items.length > 0 && (
        <div className="text-xs text-muted-foreground px-2 border-t border-border pt-2">
          추정상속재산 합계 가산액 = <span className="font-semibold">{formatKRW(total)}</span>
        </div>
      )}
    </div>
  );
}
