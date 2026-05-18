"use client";

/**
 * PostListingClosingPriceTable — 상장일 이후 1개월 종가 표 (Phase D)
 *
 * 소령 §165⑤ — 상장일 이후 1개월간 거래일 종가의 평균.
 * Phase A 결론 (2026-05-18): "상장일 이후 1개월" (상장일 ≥ 평가기준일 + 1개월 종가).
 *
 * 기간 정의: [상장일, 상장일 + 1개월 − 1일] (예: 2009-08-21 → 2009-09-20, 31일).
 * 슬롯 수는 28~31 가변. 휴일·주말은 종가 빈문자 (거래일 자동 제외).
 * listingDate 입력/수정 시 일자 자동 채움 (cross-field — useEffect 금지).
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcMonthlyClosingAverage } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface PostListingClosingPriceTableProps {
  form: Pick<
    StockTransferFormData,
    | "listingDate"
    | "listingPriceDates"
    | "listingPriceClosing"
    | "listingPriceBasisDate"
    | "listingPriceHasIncrease"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

/** YYYY-MM-DD → 요일 (0=일 ~ 6=토). 빈/잘못된 문자열은 -1 */
export function dayOfWeek(yyyy_mm_dd: string): number {
  if (!yyyy_mm_dd || !/^\d{4}-\d{2}-\d{2}$/.test(yyyy_mm_dd)) return -1;
  const [y, m, d] = yyyy_mm_dd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Date(UTC) → "YYYY-MM-DD" */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 상장일부터 "다음달 같은 날 전일"까지 (1개월간) 일자 배열.
 * 예: 2009-08-21 → 2009-08-21 ~ 2009-09-20 (31일)
 *     2009-02-01 → 2009-02-01 ~ 2009-02-28 (28일)
 */
export function autoFillDates(listingDate: string): string[] {
  if (!listingDate || !/^\d{4}-\d{2}-\d{2}$/.test(listingDate)) return [];
  const [y, m, d] = listingDate.split("-").map(Number);
  // 다음달 같은 일자(UTC) — 일 overflow 시 JS가 자동 보정 (예: 1-31 + 1mo → 3-3)
  const endExclusive = new Date(Date.UTC(y, m, d)); // m은 0-based의 다음달
  endExclusive.setUTCDate(endExclusive.getUTCDate() - 1);
  const start = new Date(Date.UTC(y, m - 1, d));
  const out: string[] = [];
  for (let cur = new Date(start); cur <= endExclusive; cur.setUTCDate(cur.getUTCDate() + 1)) {
    out.push(fmtDate(cur));
  }
  return out;
}

export function PostListingClosingPriceTable({ form, onChange }: PostListingClosingPriceTableProps) {
  // 항상 listingDate에서 도출 (single source of truth) — store dates는 엔진 전달용 mirror
  const displayDates = useMemo(() => autoFillDates(form.listingDate), [form.listingDate]);
  const total = displayDates.length;
  const leftCount = Math.ceil(total / 2);

  // 미리보기 — H-01 import (이중 진실 차단)
  // 거래일 = (주말 제외) AND (실제 종가 입력 > 0) 인 셀
  const preview = useMemo(() => {
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      return parseAmount(form.listingPriceClosing[i] || "0");
    });
    return calcMonthlyClosingAverage(displayDates, closes);
  }, [displayDates, form.listingPriceClosing]);

  // Enter 키 → 다음 거래일(주말 제외) 슬롯으로 포커스 이동
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    const slot = target.closest("[data-slot-idx]") as HTMLElement | null;
    if (!slot) return;
    const currentIdx = Number(slot.getAttribute("data-slot-idx"));
    if (Number.isNaN(currentIdx)) return;
    e.preventDefault();
    for (let next = currentIdx + 1; next < total; next++) {
      const dow = dayOfWeek(displayDates[next] ?? "");
      if (dow === 0 || dow === 6) continue;
      const nextInput = e.currentTarget.querySelector<HTMLInputElement>(
        `[data-slot-idx="${next}"] input`
      );
      if (nextInput) {
        nextInput.focus();
        return;
      }
    }
  };

  const handleCloseChange = (idx: number, value: string) => {
    const next = [...form.listingPriceClosing];
    while (next.length < total) next.push("");
    next.length = total; // 가변 길이 강제 (이전 상장일 32셀 잔여 제거)
    // 주말 슬롯 잔여 데이터 제거 (listingDate 변경으로 슬롯 ↔ 요일 매핑이 바뀌었을 때 거래일 카운트 보호)
    for (let i = 0; i < total; i++) {
      const dow = dayOfWeek(displayDates[i]);
      if (dow === 0 || dow === 6) next[i] = "";
    }
    next[idx] = value;
    onChange({ listingPriceClosing: next, listingPriceDates: displayDates });
  };

  if (!form.listingDate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-1">상장일을 먼저 입력하세요</p>
        <p className="text-xs">상장일부터 다음달 전일까지 1개월간 일자가 자동 채워집니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">
          1
        </span>
        <p className="text-xs font-semibold text-emerald-700">
          상장일 이후 1개월 종가 (소령 §165⑤ — {displayDates[0]} ~ {displayDates[total - 1]} · 총 {total}일,
          휴일·주말은 빈칸으로 두면 자동 제외)
        </p>
      </div>

      {/* 2-col grid — 좌(앞 절반) / 우(뒤 절반) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs" onKeyDown={handleGridKeyDown}>
        {[0, 1].map((col) => {
          const start = col === 0 ? 0 : leftCount;
          const end = col === 0 ? leftCount : total;
          return (
            <div key={col} className="space-y-1">
              {Array.from({ length: end - start }, (_, i) => {
                const idx = start + i;
                const dow = dayOfWeek(displayDates[idx] ?? "");
                const isWeekend = dow === 0 || dow === 6;
                const weekendLabel = dow === 6 ? "토요일" : dow === 0 ? "일요일" : "";
                return (
                  <div key={idx} data-slot-idx={idx} className="grid grid-cols-[110px_1fr] gap-2 items-center">
                    <span className="text-muted-foreground tabular-nums">
                      {idx + 1}. {displayDates[idx] || "-"}
                    </span>
                    {isWeekend ? (
                      <div className="rounded-md border border-emerald-200/60 bg-emerald-100/40 px-3 py-2 text-[11px] text-emerald-700 select-none">
                        {weekendLabel} · 거래일 제외
                      </div>
                    ) : (
                      <CurrencyInput
                        label=""
                        hideUnit
                        value={form.listingPriceClosing[idx] ?? ""}
                        onChange={(v) => handleCloseChange(idx, v)}
                        placeholder="종가"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* 평균 미리보기 */}
      {preview.tradingDays > 0 && (
        <div className="rounded border border-emerald-300 bg-emerald-100/60 px-3 py-2 text-xs text-emerald-800">
          거래일 <strong>{preview.tradingDays}</strong>일 · 종가합계{" "}
          <strong>{preview.sum.toLocaleString()}</strong> · 1개월 종가평균{" "}
          <strong className="text-emerald-900">{preview.avg.toLocaleString()}</strong>
        </div>
      )}
    </div>
  );
}
