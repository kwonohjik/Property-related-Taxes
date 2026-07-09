"use client";

/**
 * InstallmentReceiptsMatrix — §178의5② 장기할부 분할 수령 입력 매트릭스 (FS-09)
 *
 * 법령: 소득세법 시행령 §178의5② (2026.4.21. 시행)
 *   "장기할부조건의 경우에는 양도일을 수령한 날로 본다"
 *   → 각 수령일의 기준환율로 개별 원화 환산 후 합산
 *
 * 정책:
 * - 자동 안분 fallback 금지 (feedback_no_silent_apportion_fallback): 행 미입력 → validate 차단
 * - DateInput 필수 (type="date" 금지 — feedback_date_input)
 * - DecimalInput: 환율(소수점 2자리)·외화금액(소수점 4자리)
 * - SelectOnFocusProvider 전역 적용 — 개별 onFocus 불필요
 * - "원" 단위 표기 금지 (feedback_no_won_suffix)
 * - useEffect → store 미러링 금지 (onChange 직접 사용)
 */

import { DateInput } from "@/components/ui/date-input";
import { DecimalInput, parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";

export type InstallmentReceiptRow = {
  receiptDate: string;
  amountForeign: string;
  exchangeRate: string;
};

interface InstallmentReceiptsMatrixProps {
  /** 수령 배열 */
  rows: InstallmentReceiptRow[];
  /** 통화코드 (표시용) */
  currencyCode: string;
  /** 변경 콜백 — onChange로 직접 store 갱신 (useEffect 금지) */
  onChange: (rows: InstallmentReceiptRow[]) => void;
}

/** 빈 행 팩토리 */
export function createEmptyInstallmentRow(): InstallmentReceiptRow {
  return { receiptDate: "", amountForeign: "", exchangeRate: "" };
}

/** 원화 환산 미리보기 계산 (UI 전용 — 엔진 비의존) */
function calcRowKrw(row: InstallmentReceiptRow): number | null {
  const amount = parseDecimal(row.amountForeign);
  const rate = parseDecimal(row.exchangeRate);
  if (amount <= 0 || rate <= 0) return null;
  return Math.floor(amount * rate);
}

export function InstallmentReceiptsMatrix({
  rows,
  currencyCode,
  onChange,
}: InstallmentReceiptsMatrixProps) {
  const currency = currencyCode || "USD";

  function updateRow(idx: number, patch: Partial<InstallmentReceiptRow>) {
    const next = rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    onChange(next);
  }

  function addRow() {
    onChange([...rows, createEmptyInstallmentRow()]);
  }

  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx));
  }

  // 원화 합계 미리보기
  const totalKrw = rows.reduce((sum, r) => {
    const v = calcRowKrw(r);
    return v !== null ? sum + v : sum;
  }, 0);

  const hasAllKrw = rows.length >= 2 && rows.every((r) => calcRowKrw(r) !== null);

  return (
    <div className="space-y-3">
      {/* 법령 안내 */}
      <div className="rounded-lg border border-fuchsia-200/70 bg-fuchsia-50/60 px-3 py-2 text-xs text-fuchsia-700 leading-relaxed">
        <LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" /> 장기할부조건 양도: 각 수령일의 기준환율(외국환거래법)을
        수령액에 적용하여 원화 환산 후 합산합니다. 수령 건수는 2건 이상이어야 합니다.
      </div>

      {/* 행 헤더 */}
      <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-1 text-xs font-semibold text-slate-500">
        <span className="w-6 text-center">#</span>
        <span>수령일 (<LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" />)</span>
        <span>수령액 ({currency})</span>
        <span>기준환율 (KRW/{currency})</span>
        <span className="w-20 text-right">원화 환산</span>
      </div>

      {/* 수령 행 목록 */}
      <div className="space-y-2">
        {rows.map((row, idx) => {
          const krw = calcRowKrw(row);
          return (
            <div
              key={idx}
              className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-start rounded-lg border border-fuchsia-100 bg-white px-2 py-2"
            >
              {/* 행 번호 */}
              <span className="w-6 mt-2 text-center text-xs text-slate-400 font-medium select-none">
                {idx + 1}
              </span>

              {/* 수령일 */}
              <DateInput
                value={row.receiptDate}
                onChange={(v) => updateRow(idx, { receiptDate: v })}
              />

              {/* 수령액 (외화) */}
              <DecimalInput
                value={row.amountForeign}
                onChange={(v) => updateRow(idx, { amountForeign: v })}
                placeholder={`수령액 (${currency})`}
              />

              {/* 기준환율 */}
              <DecimalInput
                value={row.exchangeRate}
                onChange={(v) => updateRow(idx, { exchangeRate: v })}
                placeholder="환율 (예: 1350.00)"
              />

              {/* 원화 환산 미리보기 + 삭제 */}
              <div className="w-20 flex flex-col items-end gap-1">
                {krw !== null ? (
                  <span className="text-xs tabular-nums text-fuchsia-700 font-medium">
                    {krw.toLocaleString()}
                  </span>
                ) : (
                  <span className="text-xs text-slate-300">—</span>
                )}
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  className="text-micro text-rose-400 hover:text-rose-600 underline"
                  aria-label={`${idx + 1}번째 수령 삭제`}
                >
                  삭제
                </button>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-lg border border-dashed border-fuchsia-200 bg-fuchsia-50/30 px-4 py-3 text-xs text-fuchsia-500 text-center">
            수령 내역을 추가하세요 (2건 이상 필수)
          </div>
        )}
      </div>

      {/* 합계 미리보기 */}
      {hasAllKrw && (
        <div className="rounded bg-fuchsia-100/60 border border-fuchsia-200 px-3 py-2 flex items-center justify-between text-xs">
          <span className="text-fuchsia-700 font-medium flex items-center gap-1">
            <LawArticleModal legalBasis="소득세법 시행령 §178의5 ②" label="§178의5②" /> 원화 환산 합계 ({rows.length}건)
          </span>
          <span className="text-fuchsia-800 font-bold tabular-nums">
            {totalKrw.toLocaleString()}
          </span>
        </div>
      )}

      {/* 행 추가 버튼 */}
      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-lg border border-dashed border-fuchsia-300 bg-fuchsia-50/40 py-2 text-xs text-fuchsia-600 hover:bg-fuchsia-100/50 transition-colors"
      >
        + 수령 내역 추가
      </button>

      {/* 건수 경고 */}
      {rows.length === 1 && (
        <p className="text-xs text-amber-600">
          1건만 입력된 경우 단일 수령(single 모드) 사용을 권장합니다. §178의5② 분할 수령은 2건 이상이어야 합니다.
        </p>
      )}
    </div>
  );
}
