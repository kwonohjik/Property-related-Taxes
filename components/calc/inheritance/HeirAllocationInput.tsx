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

import type { ReactNode } from "react";
import type {
  Heir,
  HeirAllocation,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { CurrencyInput, parseAmount, formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { isForProfitCorporate } from "@/lib/tax-engine/inheritance-gift-common";

/** 협의분할 토글 활성 가능 여부 — 영리법인 제외 분배대상(자연인·수유자·비영리법인) 1명 이상 */
export function hasDistributableHeir(heirs: Heir[]): boolean {
  return heirs.some((h) => !isForProfitCorporate(h));
}

/**
 * 협의분할 ON 전환 시 초기 배분 — **빈 배열**(아무도 미선택).
 * 이슈2: 종전 첫 자연인 전액 자동배정 제거. 사용자가 칩 선택 시 toggleHeir가 잔여(=전액) 자동입력.
 * 인자(heirs·effectiveValuation)는 호출처 호환 위해 시그니처만 유지(미사용 — void 표시).
 * HeirAllocationToggleSection·handleChipClick(칩 클릭 자동 ON)에서 공용.
 */
export function buildInitialHeirAllocations(
  heirs: Heir[],
  effectiveValuation?: number,
): HeirAllocation[] {
  void heirs;
  void effectiveValuation;
  return [];
}

interface HeirAllocationInputProps {
  allocations?: HeirAllocation[];
  /** 평가액 — 합계 검증 기준 (자산 평가액 또는 채무 금액) */
  expectedTotal: number;
  heirs: Heir[];
  onChange: (next: HeirAllocation[] | undefined) => void;
  /** 분배 면적 입력 표시 여부 (자산-수준에서만 의미) */
  showAreaInput?: boolean;
  /**
   * 내부 헤더 텍스트. 기본 "협의분할 (상속인별 분배)".
   * null이면 헤더 미표시 — 인라인 패널·ToggleCard 제목이 이미 맥락을 제공하는 경우.
   */
  heading?: ReactNode | null;
  /** true면 sky 카드 테두리·배경·패딩 제거(평탄화) — 외곽 컨테이너가 이미 카드인 경우. */
  flush?: boolean;
}

export function heirShortLabel(h: Heir): string {
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
  heading = "협의분할 (상속인별 분배)",
  flush = false,
}: HeirAllocationInputProps) {
  const allocs = allocations ?? [];
  const sum = allocs.reduce((s, a) => s + a.amount, 0);
  const matched = expectedTotal === 0 || sum === expectedTotal;
  const hasInput = allocs.length > 0;

  // 영리법인(§3의2② 면제·별도 배부)만 분배 후보에서 제외 — 비영리법인은 수유자로 포함
  const distributableHeirs = heirs.filter((h) => !isForProfitCorporate(h));

  const toggleHeir = (heir: Heir) => {
    if (allocs.find((a) => a.heirId === heir.id)) {
      // 제거
      const next = allocs.filter((a) => a.heirId !== heir.id);
      onChange(next.length > 0 ? next : undefined);
    } else {
      // [UX3-AC5..7] 추가 시 잔여 금액 자동 채움 — 사용자 명시 액션(칩 클릭)에 한정한
      // 단발 동작이므로 [[feedback_no_silent_apportion_fallback]] 자동 안분 fallback 정책
      // 위반이 아님. 음수 가드(Math.max)로 첫 행 과대 입력 케이스 보호.
      const currentSum = allocs.reduce((s, a) => s + a.amount, 0);
      const remaining = Math.max(0, expectedTotal - currentSum);
      onChange([...allocs, { heirId: heir.id, amount: remaining }]);
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
    <div
      data-testid="heir-allocation-input"
      className={
        flush
          ? "space-y-2"
          : "rounded-md border border-sky-200 bg-sky-50/40 dark:border-sky-900 dark:bg-sky-950/30 p-3 space-y-2"
      }
    >
      {/* 상단: (선택)헤더 + 합계 chip + 단독 자동입력 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {heading && (
            <span className="text-xs font-semibold text-sky-700 dark:text-sky-300">
              {heading}
            </span>
          )}
          {hasInput && expectedTotal === 0 && (
            // [UX3-AC1] 평가액 미입력 — rose/emerald 평가 보류, 회색 안내
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              합계 {formatKRW(sum)} (평가액 미입력 — 카드 본체에서 시가·감정가·기준시가 입력)
            </span>
          )}
          {hasInput && expectedTotal > 0 && (
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
            className="text-xs text-sky-700 dark:text-sky-300 underline shrink-0"
          >
            단독 상속 자동 입력
          </button>
        )}
      </div>

      {/* 미입력 시 법정상속분 자동 배분 안내 */}
      {!hasInput && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          미입력 시 <strong>법정상속분</strong>(배우자 1.5 : 직계비속·직계존속 1)으로 자동 배분됩니다.
        </p>
      )}

      {/* 2열 그리드 — 셀당 1명(이름 1회). 선택 시 금액·면적 입력칸을 칩 아래 수직 스택. */}
      <div
        className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-start"
        data-testid="heir-allocation-rows"
      >
        {distributableHeirs.map((heir) => {
          const alloc = allocs.find((a) => a.heirId === heir.id);
          const selected = !!alloc;
          return (
            <div key={heir.id} className="flex flex-col gap-1.5">
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => toggleHeir(heir)}
                className={`text-xs px-2 py-1 rounded-full border transition-colors shrink-0 self-start ${
                  selected
                    ? "bg-sky-200 dark:bg-sky-800 border-sky-400 text-sky-900 dark:text-sky-100"
                    : "bg-white dark:bg-slate-800 border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {selected ? "✓ " : "+ "}
                {heirShortLabel(heir)}
              </button>
              {selected && (
                <div className="w-full min-w-[140px]">
                  <CurrencyInput
                    label=""
                    value={alloc.amount > 0 ? String(alloc.amount) : ""}
                    onChange={(v) => updateAmount(heir.id, parseAmount(v))}
                    placeholder="분배 금액"
                    hideUnit
                  />
                </div>
              )}
              {selected && showAreaInput && (
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="면적(㎡)"
                  value={alloc.areaM2 ?? ""}
                  onChange={(e) =>
                    updateArea(
                      heir.id,
                      e.target.value === ""
                        ? undefined
                        : parseFloat(e.target.value),
                    )
                  }
                  className="w-full px-2 py-1 text-xs rounded border border-border bg-background"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
