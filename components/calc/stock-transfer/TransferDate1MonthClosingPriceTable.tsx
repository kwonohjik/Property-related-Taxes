"use client";

/**
 * TransferDate1MonthClosingPriceTable — 양도일 이전 1개월 종가 표
 *
 * 소득세법 §99①3(법률) → 상증법 §63①1가목 준용 → 상증령 §52의2
 *   ※ §99는 **법률**이다. 종전 주석·화면 문구의 「소령 §99①3」은 오기였다.
 *   - 분모: 거래일 종가 평균 (상증령 §52의2④ 공휴일·토요일 제외)
 *   - 거래정지·관리종목 제외 (상증령 §52의2③)
 *   - 본 평균은 환산취득가 산식의 분모로 사용 (산식 본칙은 별도 — 시령 §176의2 등).
 *
 * 기간 정의: [양도일 소급 1개월, **양도일**] — **양쪽 경계일 모두 포함**.
 *   (「이전·이후」= 당일 포함 / 「전·후」= 당일 미포함 — 사용자 검증 2026-05-19)
 *   예: 2023-02-24(금) → [2023-01-24 ~ 2023-02-24]
 *       2023-03-31(금) → [2023-02-28 ~ 2023-03-31] (민법 §160② 말일 클램프)
 *   양도일이 비거래일이면 직전 거래일로 기준을 옮긴다(상증법 §63①1가목 괄호).
 *
 *   ⚠️ **2026-09-01 정정** — 종전에는 시작을 `소급 1개월 + 1일`로 잡아 경계일을 뺐다.
 *      상증령 §52의2②2호 「평가기준일 **이전 2월이 되는 날부터**」(같은 항 1·3호는 뺄 때
 *      「다음날부터」라고 명시)에 따라 포함으로 정정했다. 산식은 `lib/kiwoom/calendar.ts`의
 *      `buildOneMonthBeforeSlots`가 **단일 소스**다 — 여기서 다시 구현하지 말 것.
 *   ⚠️ 「1개월 = 31일」이 아니다 — 말일 클램프 때문에 달마다 29~32일이다.
 *
 * UI: PostListingClosingPriceTable 패턴 차용 — 2-col grid + 주말 자동 표시 + Enter 네비.
 * 색조: amber (양도일 영역, 상장일 emerald와 구분).
 *
 * Mirror 패턴: 거래일별 입력 시마다 자동 평균 산정 → `transferDatePriceAvg1Month`에 mirror.
 * (onChange 단일 호출 — useEffect 미러링 금지 정책 준수)
 *
 * 🔴 **저장값은 셀 편집·키움 자동조회 때만 갱신된다.** 아래 미리보기(`preview`)는 매 렌더
 *    재계산되므로, 셀 편집 없이 `displayDates`만 바뀌면 둘이 갈린다(제보 2026-09-01 —
 *    16,560 vs 16,559). 그 잔재는 **Step1의 양도일 변경 리셋**이 막는다. 리셋 조건을 좁히면
 *    이 결함이 되살아난다 — anchor `one-month-avg-stale-mirror.anchor.test.tsx` 참조.
 *    화면 요약줄은 **여기 하나만** 둔다(실시간 재계산 쪽 — stale이 구조적으로 불가능).
 */

import { useMemo } from "react";
import { CurrencyInput, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { calcMonthlyClosingAverage } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { dayOfWeek, preTransferAutoFillDates, resolvePreTransferAnchor } from "./PostListingClosingPriceTable";
import { isKrxHolidayInFixture, nonTradingLabel } from "@/lib/kiwoom/calendar";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface TransferDate1MonthClosingPriceTableProps {
  form: Pick<
    StockTransferFormData,
    "transferDate" | "transferPriceDates" | "transferPriceClosing" | "transferDatePriceAvg1Month"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
}

export function TransferDate1MonthClosingPriceTable({ form, onChange }: TransferDate1MonthClosingPriceTableProps) {
  // 양도일 기반 일자 자동 채움 (UTC + 윤년 처리)
  const displayDates = useMemo(() => preTransferAutoFillDates(form.transferDate), [form.transferDate]);

  const anchor = useMemo(() => resolvePreTransferAnchor(form.transferDate), [form.transferDate]);
  const anchorShifted = anchor !== "" && anchor !== form.transferDate;
  const total = displayDates.length;
  const leftCount = Math.ceil(total / 2);

  // 미리보기 — 자동 평균 산정 (주말 + KRX 휴장일 + 빈문자 자동 제외)
  const preview = useMemo(() => {
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      if (isKrxHolidayInFixture(d)) return 0; // KRX 평일 휴장일 제외 (대선·현충일 등)
      return parseAmount(form.transferPriceClosing[i] || "0");
    });
    return calcMonthlyClosingAverage(displayDates, closes);
  }, [displayDates, form.transferPriceClosing]);

  // Enter 키 → 다음 거래일 셀로 포커스 이동
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
      const nextInput = e.currentTarget.querySelector<HTMLInputElement>(`[data-slot-idx="${next}"] input`);
      if (nextInput) { nextInput.focus(); return; }
    }
  };

  const handleCloseChange = (idx: number, value: string) => {
    const next = [...form.transferPriceClosing];
    while (next.length < total) next.push("");
    next.length = total;
    // 비거래일 셀 zero-out (transferDate 변경 시 인덱스 misalign 차단)
    for (let i = 0; i < total; i++) {
      const dow = dayOfWeek(displayDates[i]);
      if (dow === 0 || dow === 6) next[i] = "";
      else if (isKrxHolidayInFixture(displayDates[i])) next[i] = ""; // KRX 평일 휴장일
    }
    next[idx] = value;

    // ★ 자동 평균 산정 → transferDatePriceAvg1Month mirror (onChange 단일 호출)
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      if (isKrxHolidayInFixture(d)) return 0;
      return parseAmount(next[i] || "0");
    });
    const { avg } = calcMonthlyClosingAverage(displayDates, closes);

    onChange({
      transferPriceClosing: next,
      transferPriceDates: displayDates,
      transferDatePriceAvg1Month: avg > 0 ? String(avg) : "",
    });
  };

  if (!form.transferDate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-1">양도일을 먼저 입력하세요 (Step 1).</p>
        <p className="text-xs">양도일을 포함한 이전 1개월 일자가 자동 채워집니다.</p>
      </div>
    );
  }

  return (
    <ToneCard
      tone="amber"
      bodyClassName="space-y-3"
      noDark
      title={
        <>
          양도일 이전 1개월 종가 (소득세법 §99①3 분모 — {displayDates[0]} ~ {displayDates[total - 1]} · 총 {total}일, 휴일·주말은 빈칸으로 두면 자동 제외)
        </>
      }
    >
      {anchorShifted && (
        <p className="text-caption text-amber-700/90 leading-relaxed">
          양도일 <strong>{form.transferDate}</strong>이(가) 휴장일이므로 직전 거래일{" "}
          <strong>{anchor}</strong>을(를) 기산점으로 1개월 범위를 산정했습니다.
        </p>
      )}

      {/* 2-col grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs" onKeyDown={handleGridKeyDown} data-enter-nav="off">
        {[0, 1].map((col) => {
          const start = col === 0 ? 0 : leftCount;
          const end = col === 0 ? leftCount : total;
          return (
            <div key={col} className="space-y-1">
              {Array.from({ length: end - start }, (_, i) => {
                const idx = start + i;
                const iso = displayDates[idx] ?? "";
                const dow = dayOfWeek(iso);
                const isWeekend = dow === 0 || dow === 6;
                const isHoliday = !isWeekend && isKrxHolidayInFixture(iso);
                const nonTrading = isWeekend || isHoliday;
                const label = isWeekend
                  ? (dow === 6 ? "토요일 · 거래일 제외" : "일요일 · 거래일 제외")
                  : isHoliday
                    ? nonTradingLabel(iso) || "휴장일 · 거래일 제외"
                    : "";
                return (
                  <div key={idx} data-slot-idx={idx} className="grid grid-cols-[110px_1fr] gap-2 items-center">
                    <span className="text-muted-foreground tabular-nums">
                      {idx + 1}. {displayDates[idx] || "-"}
                    </span>
                    {nonTrading ? (
                      <div className="rounded-md border border-amber-200/60 bg-amber-100/40 px-3 py-2 text-caption text-amber-700 select-none">
                        {label}
                      </div>
                    ) : (
                      <CurrencyInput
                        label=""
                        hideUnit
                        value={form.transferPriceClosing[idx] ?? ""}
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
        <div className="rounded border border-amber-300 bg-amber-100/60 px-3 py-2 text-xs text-amber-800">
          거래일 <strong>{preview.tradingDays}</strong>일 · 종가합계{" "}
          <strong>{preview.sum.toLocaleString()}</strong> · 1개월 종가평균{" "}
          <strong className="text-amber-900">{preview.avg.toLocaleString()}</strong>
          {" "}→ 「양도시 1주당 기준시가」로 자동 입력됩니다 (§99①3 환산 분모)
        </div>
      )}
    </ToneCard>
  );
}
