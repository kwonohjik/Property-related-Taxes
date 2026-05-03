"use client";

/**
 * InstallmentPaymentsSection — 연부취득 회차 입력 섹션
 *
 * 설계 문서: docs/02-design/features/acquisition-tax-installment.sync-points.md
 * 법령 근거: 지방세법 §6 17호, §10의5, §20⑤
 *
 * - amber 섹션 카드 (연부취득 tone)
 * - 회차별 라벨·지급일·지급액 입력
 * - 2년 미만 경고 배너 (Next 차단 없이 경고만)
 * - 회차 합계 표시
 */

import { useEffect, useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { DateInput } from "@/components/ui/date-input";

// ============================================================
// 타입
// ============================================================

export interface InstallmentRow {
  id: string;           // crypto.randomUUID() — React key
  label?: string;       // 사용자 라벨 (선택)
  paymentDate: string;  // YYYY-MM-DD
  amount: string;       // CurrencyInput 문자열 (콤마 포함)
}

interface Props {
  installments: InstallmentRow[];
  contractDate?: string;           // Step0의 installmentContractDate (2년 검증용)
  onChange: (rows: InstallmentRow[]) => void;
}

// ============================================================
// 순수 헬퍼 함수
// ============================================================

function addRow(rows: InstallmentRow[]): InstallmentRow[] {
  return [
    ...rows,
    { id: crypto.randomUUID(), label: "", paymentDate: "", amount: "" },
  ];
}

function removeRow(rows: InstallmentRow[], id: string): InstallmentRow[] {
  if (rows.length <= 1) return rows;
  return rows.filter((r) => r.id !== id);
}

function updateRow(
  rows: InstallmentRow[],
  id: string,
  patch: Partial<InstallmentRow>,
): InstallmentRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}

// ============================================================
// 컴포넌트
// ============================================================

export function InstallmentPaymentsSection({ installments, contractDate, onChange }: Props) {
  // 마운트 시 빈 배열이면 초기 3행(계약금·중도금·잔금) 자동 생성
  useEffect(() => {
    if (installments.length === 0) {
      onChange([
        { id: crypto.randomUUID(), label: "계약금", paymentDate: "", amount: "" },
        { id: crypto.randomUUID(), label: "중도금", paymentDate: "", amount: "" },
        { id: crypto.randomUUID(), label: "잔금",   paymentDate: "", amount: "" },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount 시 1회만

  // 합계 및 기간 계산
  const { total, isUnder2Years, firstDate, lastDate } = useMemo(() => {
    const valid = installments.filter((r) => r.paymentDate && (parseAmount(r.amount) ?? 0) > 0);
    const sumTotal = installments.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0);

    if (valid.length < 2) {
      return { total: sumTotal, isUnder2Years: false, firstDate: null, lastDate: null };
    }

    const sorted = [...valid].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));
    const first = sorted[0].paymentDate;
    const last = sorted[sorted.length - 1].paymentDate;

    // 2년 검증: contractDate 기준 또는 첫 회차 기준
    const refDate = contractDate || first;
    const refMs = new Date(refDate).getTime();
    const lastMs = new Date(last).getTime();
    const diffMonths = (lastMs - refMs) / (1000 * 60 * 60 * 24 * 30.44);

    return {
      total: sumTotal,
      isUnder2Years: diffMonths < 24,
      firstDate: first,
      lastDate: last,
    };
  }, [installments, contractDate]);

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 space-y-3">
      {/* 섹션 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-[10px] font-bold text-amber-800 select-none">
            2
          </span>
          <p className="text-xs font-semibold text-amber-700">연부 회차 정보</p>
          {installments.length > 0 && (
            <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-medium text-amber-800">
              {installments.length}회차
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onChange(addRow(installments))}
          className="rounded-md border border-amber-300 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-800 transition-colors"
        >
          + 회차 추가
        </button>
      </div>

      {/* 2년 미만 경고 배너 */}
      {isUnder2Years && (
        <div className="rounded-md border border-amber-300 bg-amber-100 px-3 py-2 text-xs text-amber-800">
          첫 회차 ~ 마지막 회차 간격이 2년 미만입니다. 연부취득 요건(§6 17호)을 확인하세요.
          2년 미만 시 엔진에서 일반 매매로 처리됩니다.
        </div>
      )}
      {!isUnder2Years && firstDate && lastDate && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
          2년 이상 — 연부취득 요건 충족 ({firstDate} ~ {lastDate})
        </div>
      )}

      {/* 회차 카드 배열 */}
      <div className="space-y-2">
        {installments.map((row, idx) => (
          <div
            key={row.id}
            className="rounded-md border border-amber-100 bg-amber-50/20 p-3 space-y-2"
          >
            {/* 회차 헤더 */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-amber-800">{idx + 1}회차</span>
              <button
                type="button"
                onClick={() => onChange(removeRow(installments, row.id))}
                disabled={installments.length <= 1}
                className="text-xs text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed"
              >
                삭제
              </button>
            </div>

            {/* 라벨 입력 */}
            <div>
              <label className="text-xs font-medium leading-none text-muted-foreground">
                라벨 (선택)
              </label>
              <input
                type="text"
                value={row.label ?? ""}
                onChange={(e) =>
                  onChange(updateRow(installments, row.id, { label: e.target.value }))
                }
                placeholder='예: "계약금", "중도금", "잔금"'
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* 지급일 */}
            <div>
              <label className="text-xs font-medium leading-none text-muted-foreground">
                지급일 <span className="text-destructive">*</span>
              </label>
              <DateInput
                value={row.paymentDate}
                onChange={(v) =>
                  onChange(updateRow(installments, row.id, { paymentDate: v }))
                }
              />
            </div>

            {/* 지급액 */}
            <CurrencyInput
              label="지급액"
              value={row.amount}
              onChange={(v) =>
                onChange(updateRow(installments, row.id, { amount: v }))
              }
              placeholder="해당 회차 지급금액"
            />
          </div>
        ))}
      </div>

      {/* 합계 표시 */}
      {total > 0 && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-sm">
          <div className="flex justify-between items-center">
            <span className="text-emerald-700 font-medium">
              {installments.length}회차 합계
            </span>
            <span className="font-bold text-emerald-800">
              {total.toLocaleString("ko-KR")}
            </span>
          </div>
          {lastDate && (
            <p className="text-xs text-emerald-600 mt-0.5">
              마지막 회차 지급일: {lastDate}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
