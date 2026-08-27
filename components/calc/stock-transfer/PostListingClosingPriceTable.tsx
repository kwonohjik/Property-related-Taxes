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
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { calcMonthlyClosingAverage } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { buildOneMonthBeforeSlots } from "@/lib/kiwoom/calendar";
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
export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * 양도일 기산 anchor — 양도일이 주말이면 직전 평일(금요일)까지 시프트.
 * (거래소 휴장일 캘린더는 미반영 — 토·일만 보정)
 *
 * 예: 2023-02-26 (일) → 2023-02-24 (금)
 *     2023-02-25 (토) → 2023-02-24 (금)
 *     2023-02-24 (금) → 2023-02-24 (그대로)
 */
export function resolvePreTransferAnchor(transferDate: string): string {
  if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return "";
  const [y, m, d] = transferDate.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d));
  while (anchor.getUTCDay() === 0 || anchor.getUTCDay() === 6) {
    anchor.setUTCDate(anchor.getUTCDate() - 1);
  }
  return fmtDate(anchor);
}

/**
 * 양도일 **이전** 1개월 일자 배열 (UTC, 가변 일수) — 소득세법 §99①3.
 *
 * 「이전」은 양도일을 **포함**한다(「전」이면 미포함). 상증법 §63①1가목을 준용하면서
 * "평가기준일 이전ㆍ이후 각 2개월"을 "양도일ㆍ취득일 이전 1개월"로 치환한 구조다.
 *
 * ⚠️ 산식은 `lib/kiwoom/calendar.ts`의 `buildOneMonthBeforeSlots`가 **단일 소스**다.
 *    종전에는 이 파일이 같은 산식을 복제해 갖고 있었고, 두 벌 모두 월말에서 기간이
 *    잘리는 같은 결함을 안고 있었다(2023-03-31 → 28일). 키움 자동조회
 *    (`app/api/kiwoom/transfer-1month/route.ts`)는 calendar 쪽을, 이 표는 복제본을 쓰고 있어
 *    **같은 화면의 두 입력 경로가 서로 다른 기간을 쓸 수 있었다**.
 *
 * 예: 2023-02-24(금) → [2023-01-25 ~ 2023-02-24] (31일)
 *     2024-03-01(금) → [2024-02-02 ~ 2024-03-01] (29일)
 *     2023-03-31(금) → [2023-03-01 ~ 2023-03-31] (31일)  ※ 민법 §160② 말일 클램프
 */
export function preTransferAutoFillDates(transferDate: string): string[] {
  return buildOneMonthBeforeSlots(transferDate);
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
    <ToneCard
      tone="emerald"
      sectionNum={1}
      bodyClassName="space-y-3"
      noDark
      title={
        <>
          상장일 이후 1개월 종가 (소령 §165⑤ — {displayDates[0]} ~ {displayDates[total - 1]} · 총 {total}일,
          휴일·주말은 빈칸으로 두면 자동 제외)
        </>
      }
    >
      {/* 2-col grid — 좌(앞 절반) / 우(뒤 절반) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs" onKeyDown={handleGridKeyDown} data-enter-nav="off">
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
                      <div className="rounded-md border border-emerald-200/60 bg-emerald-100/40 px-3 py-2 text-caption text-emerald-700 select-none">
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
    </ToneCard>
  );
}
