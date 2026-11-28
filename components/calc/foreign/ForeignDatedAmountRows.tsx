"use client";

/**
 * ForeignDatedAmountRows — 일자별 외화 금액 행 입력 (날짜 · 외화 금액 · 기준환율 · 원화 환산 미리보기)
 *
 * 주식 장기할부 수령 행(`InstallmentReceiptsMatrix`)에서 일반화한 공용 leaf —
 * 국외자산 부동산의 자본적지출·양도비 행도 같은 구조를 쓴다(계획서 §4.3 · §11 U0).
 * 이 컴포넌트는 **문구를 들고 있지 않다** — 헤더·안내·빈 상태 문구는 호출부가 `labels`로 넘긴다.
 *
 * 정책:
 * - 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback): 행 미입력 → validate 차단
 * - DateInput 필수 (type="date" 금지 — feedback_date_input)
 * - DecimalInput: 환율(소수점 2자리)·외화금액(소수점 4자리)
 * - SelectOnFocusProvider 전역 적용 — 개별 onFocus 불필요
 * - "원" 단위 표기 금지 (feedback_no_won_suffix)
 * - useEffect → store 미러링 금지 (onChange 직접 사용)
 */

import type { ReactNode } from "react";
import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";

export type ForeignDatedAmountRow = {
  date: string;
  amountForeign: string;
  exchangeRate: string;
};

export interface ForeignDatedAmountRowsLabels {
  /** 상단 법령 안내 상자 내용 (없으면 상자 없음) */
  intro?: ReactNode;
  /** 날짜 열 머리글 */
  dateHeader: ReactNode;
  /** 외화 금액 열 머리글·입력 placeholder의 앞부분 — 뒤에 ` (통화코드)`가 붙는다 */
  amountHeader: string;
  /** 행 삭제 aria-label용 명사 — 「N번째 {rowNoun} 삭제」 */
  rowNoun: string;
  /** 행이 없을 때 안내 */
  emptyText: string;
  /** 행 추가 버튼 문구 */
  addText: string;
  /** 지정하면 2건 이상이 모두 환산될 때 원화 환산 합계 상자를 보인다 — 머리 문구 */
  totalLabel?: ReactNode;
  /** 지정하면 정확히 1행일 때 경고 문구를 보인다 */
  singleRowNotice?: string;
}

interface ForeignDatedAmountRowsProps {
  rows: ForeignDatedAmountRow[];
  /** 통화코드 (표시용) */
  currencyCode: string;
  /** 변경 콜백 — onChange로 직접 store 갱신 (useEffect 금지) */
  onChange: (rows: ForeignDatedAmountRow[]) => void;
  labels: ForeignDatedAmountRowsLabels;
  /**
   * 원화 환산 미리보기 함수 — **필수**. 호출부가 빠뜨려 부동소수 `Math.floor(외화 × 환율)`로 떨어지는 일(1원 과소)을
   * 컴파일 에러로 막는다. 주식·부동산 모두 엔진 환산 leaf를 쓰는 `krwOfExact`(`krw-of.ts`)를 넘긴다.
   */
  krwOf: (amountForeign: number, exchangeRate: number) => number | null;
  /**
   * 검증 오류 → 입력칸 이동 앵커 접두 — 각 칸에 `data-field="{접두}.{행}.date|amount|rate"`를 단다.
   * 지정하지 않으면 앵커 없음(기존 DOM 그대로).
   */
  fieldPrefix?: string;
  /**
   * 「양도일 환율과 같음」 보조 버튼 — 눌렀을 때 그 행의 기준환율에 `rate`를 **한 번 써 넣는다**(onClick 안 쓰기 — effect 미러링 아님,
   * 이후 사용자가 고치면 그대로 둔다). `rate`가 비어 있으면 버튼을 숨긴다. 환율 fallback이 **아니다** — 빈 칸은 그대로 검증이 막는다.
   */
  rateShortcut?: { rate: string; label: string };
}

/** 빈 행 팩토리 */
export function createEmptyForeignDatedAmountRow(): ForeignDatedAmountRow {
  return { date: "", amountForeign: "", exchangeRate: "" };
}

export function ForeignDatedAmountRows({
  rows,
  currencyCode,
  onChange,
  labels,
  krwOf,
  fieldPrefix,
  rateShortcut,
}: ForeignDatedAmountRowsProps) {
  const currency = currencyCode || "USD";

  function updateRow(idx: number, patch: Partial<ForeignDatedAmountRow>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, createEmptyForeignDatedAmountRow()]);
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  const rowKrw = (r: ForeignDatedAmountRow): number | null => {
    const amount = parseDecimal(r.amountForeign);
    const rate = parseDecimal(r.exchangeRate);
    return amount <= 0 || rate <= 0 ? null : krwOf(amount, rate);
  };
  const anchor = (idx: number, cell: "date" | "amount" | "rate") =>
    fieldPrefix ? { "data-field": `${fieldPrefix}.${idx}.${cell}` } : {};

  // 원화 합계 미리보기
  const totalKrw = rows.reduce((sum, r) => {
    const v = rowKrw(r);
    return v !== null ? sum + v : sum;
  }, 0);

  const hasAllKrw = rows.length >= 2 && rows.every((r) => rowKrw(r) !== null);

  return (
    <div className="space-y-3">
      {/* 법령 안내 */}
      {labels.intro && (
        <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-3 py-2 text-xs text-fuchsia-700 leading-relaxed dark:text-fuchsia-300 dark:bg-fuchsia-950/40">
          {labels.intro}
        </div>
      )}

      {/* 행 헤더 */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span className="w-6 text-center">#</span>
        <span>{labels.dateHeader}</span>
        <span>{labels.amountHeader} ({currency})</span>
        <span>기준환율 (KRW/{currency})</span>
        <span className="w-20 text-right">원화 환산</span>
      </div>

      {/* 행 목록 */}
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const krw = rowKrw(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-start rounded-lg border border-fuchsia-100 bg-white dark:bg-gray-900 px-2 py-2"
            >
              {/* 행 번호 */}
              <span className="w-6 mt-2 text-center text-xs text-slate-600 dark:text-slate-400 font-medium select-none">
                {idx + 1}
              </span>

              {/* 날짜 */}
              <DateInput
                value={row.date}
                onChange={(v) => updateRow(idx, { date: v })}
                {...anchor(idx, "date")}
              />

              {/* 금액 (외화) */}
              <DecimalInput
                value={row.amountForeign}
                onChange={(v) => updateRow(idx, { amountForeign: v })}
                placeholder={`${labels.amountHeader} (${currency})`}
                {...anchor(idx, "amount")}
              />

              {/* 기준환율 */}
              <div className="space-y-1">
                <DecimalInput
                  value={row.exchangeRate}
                  onChange={(v) => updateRow(idx, { exchangeRate: v })}
                  placeholder="기준환율"
                  {...anchor(idx, "rate")}
                />
                {rateShortcut && rateShortcut.rate.trim() !== "" && row.exchangeRate !== rateShortcut.rate && (
                  <button
                    type="button"
                    onClick={() => updateRow(idx, { exchangeRate: rateShortcut.rate })}
                    className="text-micro text-fuchsia-700 hover:text-fuchsia-800 underline dark:text-fuchsia-300"
                  >
                    {rateShortcut.label}
                  </button>
                )}
              </div>

              {/* 원화 환산 미리보기 + 삭제 */}
              <div className="w-20 flex flex-col items-end gap-1">
                {krw !== null ? (
                  <span className="text-xs tabular-nums text-fuchsia-700 font-medium dark:text-fuchsia-300">
                    {krw.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-slate-600 dark:text-slate-300">—</span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-micro text-rose-700 hover:text-rose-800 underline dark:text-rose-300"
                  aria-label={`${idx + 1}번째 ${labels.rowNoun} 삭제`}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-fuchsia-200 bg-fuchsia-50/30 px-4 py-3 text-xs text-fuchsia-700 text-center dark:text-fuchsia-400 dark:bg-fuchsia-950/40">
            {labels.emptyText}
          </div>
        )}
      </div>

      {/* 합계 미리보기 */}
      {labels.totalLabel && hasAllKrw && (
        <div className="rounded bg-fuchsia-100/60 border border-fuchsia-200 px-3 py-2 flex items-center justify-between text-xs dark:bg-fuchsia-900/40">
          <span className="text-fuchsia-700 font-medium flex items-center gap-1 dark:text-fuchsia-300">
            {labels.totalLabel} ({rows.length}건)
          </span>
          <span className="text-fuchsia-800 font-bold tabular-nums dark:text-fuchsia-200">
            {totalKrw.toLocaleString()}
          </span>
        </div>
      )}

      {/* 행 추가 버튼 */}
      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50/40 py-2 text-xs text-fuchsia-700 hover:bg-fuchsia-100/50 transition-colors dark:text-fuchsia-400 dark:bg-fuchsia-950/40"
      >
        {labels.addText}
      </button>

      {/* 건수 경고 */}
      {labels.singleRowNotice && rows.length === 1 && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {labels.singleRowNotice}
        </p>
      )}
    </div>
  );
}
