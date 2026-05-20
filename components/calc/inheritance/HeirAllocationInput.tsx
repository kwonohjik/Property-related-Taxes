"use client";

/**
 * HeirAllocationInput — 자산 1건의 협의분할 입력
 *
 * Phase G ⑤ UI 위젯. 상속세 종합사례 PDF 책 1853 ④ 공장부지 1물건을
 * 배우자 2,500㎡ + 차남 1,500㎡로 분할 같은 케이스 지원.
 *
 * 정책:
 *   - 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback)
 *   - 빈 배열도 허용 (총액 모드)
 *   - 합계 ≠ 평가액 → 실시간 색 변경 (validation은 lib/calc/inheritance-validate.ts)
 *
 * @example
 *   <HeirAllocationInput
 *     allocations={item.heirAllocations}
 *     expectedTotal={item.marketValue ?? item.standardPrice ?? 0}
 *     heirs={form.heirs}
 *     onChange={(allocs) => updateItem(idx, { heirAllocations: allocs })}
 *   />
 */

import type {
  Heir,
  HeirAllocation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";

interface HeirAllocationInputProps {
  allocations?: HeirAllocation[];
  /** 평가액 — 합계 검증 기준 (자산 평가액 또는 채무 금액) */
  expectedTotal: number;
  heirs: Heir[];
  onChange: (next: HeirAllocation[] | undefined) => void;
  /** 분배 면적 입력 표시 여부 (자산-수준에서만 의미) */
  showAreaInput?: boolean;
}

function heirShortLabel(h: Heir): string {
  const relMap: Record<string, string> = {
    spouse: "배우자",
    child: "자녀",
    lineal_ascendant: "직계존속",
    sibling: "형제자매",
    other: "기타",
    legatee: "수유자",
    corporate: "법인",
  };
  const rel = relMap[h.relation] ?? h.relation;
  return h.name ? `${rel} (${h.name})` : rel;
}

export function HeirAllocationInput({
  allocations,
  expectedTotal,
  heirs,
  onChange,
  showAreaInput = false,
}: HeirAllocationInputProps) {
  const allocs = allocations ?? [];
  const sum = allocs.reduce((s, a) => s + a.amount, 0);
  const matched = expectedTotal === 0 || sum === expectedTotal;
  const hasInput = allocs.length > 0;

  // 영리법인은 상속받지 않으므로 분배 후보에서 제외
  const distributableHeirs = heirs.filter((h) => h.relation !== "corporate");

  const toggleHeir = (heir: Heir) => {
    if (allocs.find((a) => a.heirId === heir.id)) {
      // 제거
      const next = allocs.filter((a) => a.heirId !== heir.id);
      onChange(next.length > 0 ? next : undefined);
    } else {
      // 추가
      onChange([...allocs, { heirId: heir.id, amount: 0 }]);
    }
  };

  const updateAmount = (heirId: string, amount: number) => {
    onChange(
      allocs.map((a) => (a.heirId === heirId ? { ...a, amount } : a)),
    );
  };

  const updateArea = (heirId: string, areaM2: number | undefined) => {
    onChange(
      allocs.map((a) =>
        a.heirId === heirId ? { ...a, areaM2 } : a,
      ),
    );
  };

  const handleAutoFillSingle = () => {
    if (distributableHeirs.length === 1 && !hasInput) {
      onChange([{ heirId: distributableHeirs[0].id, amount: expectedTotal }]);
    }
  };

  if (distributableHeirs.length === 0) {
    return (
      <p className="text-xs text-amber-700 dark:text-amber-400 italic">
        상속인·수유자가 1명 이상 입력되어야 협의분할이 가능합니다.
      </p>
    );
  }

  return (
    <div className="rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/30 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
            협의분할 (상속인별 분배)
          </span>
          {hasInput && (
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${
                matched
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
              }`}
            >
              합계 {formatKRW(sum)} {matched ? "✓" : `(평가액 ${formatKRW(expectedTotal)})`}
            </span>
          )}
        </div>
        {!hasInput && distributableHeirs.length === 1 && expectedTotal > 0 && (
          <button
            type="button"
            onClick={handleAutoFillSingle}
            className="text-xs text-sky-700 dark:text-sky-300 underline"
          >
            단독 상속 자동 입력
          </button>
        )}
      </div>

      {/* 상속인 토글 칩 */}
      <div className="flex flex-wrap gap-1.5">
        {distributableHeirs.map((heir) => {
          const selected = !!allocs.find((a) => a.heirId === heir.id);
          return (
            <button
              key={heir.id}
              type="button"
              onClick={() => toggleHeir(heir)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                selected
                  ? "bg-sky-200 dark:bg-sky-800 border-sky-400 text-sky-900 dark:text-sky-100"
                  : "bg-white dark:bg-slate-800 border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {selected ? "✓ " : "+ "}
              {heirShortLabel(heir)}
            </button>
          );
        })}
      </div>

      {/* 금액·면적 입력 */}
      {hasInput && (
        <div className="space-y-1.5">
          {allocs.map((a) => {
            const heir = heirs.find((h) => h.id === a.heirId);
            if (!heir) return null;
            return (
              <div
                key={a.heirId}
                className="grid grid-cols-[1fr_auto_auto] gap-2 items-center"
              >
                <label className="text-xs text-muted-foreground">
                  {heirShortLabel(heir)}
                </label>
                <div className="w-36">
                  <CurrencyInput
                    label=""
                    value={a.amount > 0 ? String(a.amount) : ""}
                    onChange={(v) => updateAmount(a.heirId, parseAmount(v))}
                    placeholder="분배 금액"
                    hideUnit
                  />
                </div>
                {showAreaInput && (
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="면적(㎡)"
                    value={a.areaM2 ?? ""}
                    onChange={(e) =>
                      updateArea(
                        a.heirId,
                        e.target.value === ""
                          ? undefined
                          : parseFloat(e.target.value),
                      )
                    }
                    className="w-24 px-2 py-1 text-xs rounded border border-border bg-background"
                  />
                )}
                {!showAreaInput && <span className="w-24" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
