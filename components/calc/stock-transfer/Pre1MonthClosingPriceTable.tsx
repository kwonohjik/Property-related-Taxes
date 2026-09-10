"use client";

/**
 * Pre1MonthClosingPriceTable — 「기준일 이전 1개월」 종가 표 (**양도일·취득일 두 축 공용**)
 *
 * 📌 **구 이름 `TransferDate1MonthClosingPriceTable`** — 양도일 축만 있던 시기의 것이다.
 *    취득일 축이 붙으면서 축 중립 이름으로 바꿨다(2026-09-11). `docs/`의 계획서·리뷰는
 *    **그 시점의 기록**이라 구 이름 그대로 두었으니, 이력을 찾을 때는 구 이름으로 검색할 것.
 *    형제는 `PostListingClosingPriceTable`(상장일 **이후** 1개월) — Pre/Post로 대칭이다.
 *
 * ⚠️ `axis="acquisition"`이면 §99①3 환산비율의 **분자**(취득 당시 기준시가)를 담당한다 —
 *    기간 산식(`buildOneMonthBeforeSlots`)·평균 산식·비거래일 처리가 두 축에서 **완전히 동일**하므로
 *    복제하지 않는다. 이 저장소는 「같은 산식이 두 벌」로 반복해서 데었다(아래 단일 소스 주석 참조).
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

interface Pre1MonthClosingPriceTableProps {
  form: Pick<
    StockTransferFormData,
    | "transferDate"
    | "transferPriceDates"
    | "transferPriceClosing"
    | "transferDatePriceAvg1Month"
    | "acquisitionDate"
    | "acquisitionPriceDates"
    | "acquisitionPriceClosing"
    | "acquisitionDatePriceAvg1Month"
  >;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /** 기본은 양도일 축 = §99①3 **분모** (기존 호출부 무변경) */
  axis?: "transfer" | "acquisition";
}

export function Pre1MonthClosingPriceTable({
  form,
  onChange,
  axis = "transfer",
}: Pre1MonthClosingPriceTableProps) {
  const isAcq = axis === "acquisition";
  const dateLabel = isAcq ? "취득일" : "양도일";
  /** 환산비율에서 이 축이 앉는 자리 — 취득일 = 분자 / 양도일 = 분모 */
  const roleLabel = isAcq ? "분자" : "분모";
  const targetLabel = isAcq ? "취득시 1주당 기준시가" : "양도시 1주당 기준시가";
  const baseDate = isAcq ? form.acquisitionDate : form.transferDate;
  const closingCells = isAcq ? form.acquisitionPriceClosing : form.transferPriceClosing;

  // 기준일 기반 일자 자동 채움 (UTC + 윤년 처리)
  const displayDates = useMemo(() => preTransferAutoFillDates(baseDate), [baseDate]);

  const anchor = useMemo(() => resolvePreTransferAnchor(baseDate), [baseDate]);
  const anchorShifted = anchor !== "" && anchor !== baseDate;
  const total = displayDates.length;
  const leftCount = Math.ceil(total / 2);

  // 표시 순서 — **기준일(양도일)이 왼쪽 맨 위**에 오도록 최신 → 과거 «역순»으로 렌더한다.
  // 데이터 인덱스(`displayDates[idx]` ↔ `transferPriceClosing[idx]`)는 **오름차순 그대로**다 —
  // 키움 자동조회(`KiwoomAutoFetchButton`)·엔진 전달 배열이 그 순서에 묶여 있으므로
  // 여기서 뒤집는 것은 화면 배치뿐이다. 화면 번호는 표시 위치(pos+1)를 따른다.
  const renderOrder = useMemo(() => Array.from({ length: total }, (_, pos) => total - 1 - pos), [total]);

  // 미리보기 — 자동 평균 산정 (주말 + KRX 휴장일 + 빈문자 자동 제외)
  const preview = useMemo(() => {
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      if (isKrxHolidayInFixture(d)) return 0; // KRX 평일 휴장일 제외 (대선·현충일 등)
      return parseAmount(closingCells[i] || "0");
    });
    return calcMonthlyClosingAverage(displayDates, closes);
  }, [displayDates, closingCells]);

  // Enter 키 → 다음 거래일 셀로 포커스 이동
  const handleGridKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Enter") return;
    const target = e.target as HTMLElement;
    const slot = target.closest("[data-slot-idx]") as HTMLElement | null;
    if (!slot) return;
    const currentIdx = Number(slot.getAttribute("data-slot-idx"));
    if (Number.isNaN(currentIdx)) return;
    e.preventDefault();
    // 표시가 역순이므로 «화면상 아래 칸»은 데이터 인덱스가 하나 **작은** 쪽이다.
    for (let next = currentIdx - 1; next >= 0; next--) {
      const dow = dayOfWeek(displayDates[next] ?? "");
      if (dow === 0 || dow === 6) continue;
      const nextInput = e.currentTarget.querySelector<HTMLInputElement>(`[data-slot-idx="${next}"] input`);
      if (nextInput) { nextInput.focus(); return; }
    }
  };

  const handleCloseChange = (idx: number, value: string) => {
    const next = [...closingCells];
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
    const avgText = avg > 0 ? String(avg) : "";

    // ★ 자동 평균 산정 → 축의 저장 필드에 mirror (onChange 단일 호출)
    onChange(
      isAcq
        ? {
            acquisitionPriceClosing: next,
            acquisitionPriceDates: displayDates,
            acquisitionDatePriceAvg1Month: avgText,
          }
        : {
            transferPriceClosing: next,
            transferPriceDates: displayDates,
            transferDatePriceAvg1Month: avgText,
          },
    );
  };

  if (!baseDate) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-3 text-sm text-amber-800">
        <p className="font-semibold mb-1">{dateLabel}을 먼저 입력하세요 (Step 1).</p>
        <p className="text-xs">{dateLabel}을 포함한 이전 1개월 일자가 자동 채워집니다.</p>
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
          {dateLabel} 이전 1개월 종가 (소득세법 §99①3 {roleLabel} — {displayDates[0]} ~ {displayDates[total - 1]} · 총 {total}일, 휴일·주말은 빈칸으로 두면 자동 제외)
        </>
      }
    >
      {anchorShifted && (
        <p className="text-caption text-amber-700/90 leading-relaxed">
          {dateLabel} <strong>{baseDate}</strong>이(가) 휴장일이므로 직전 거래일{" "}
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
                const pos = start + i;
                const idx = renderOrder[pos];
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
                      {pos + 1}. {displayDates[idx] || "-"}
                    </span>
                    {nonTrading ? (
                      <div className="rounded-md border border-amber-200/60 bg-amber-100/40 px-3 py-2 text-caption text-amber-700 select-none">
                        {label}
                      </div>
                    ) : (
                      <CurrencyInput
                        label=""
                        hideUnit
                        value={closingCells[idx] ?? ""}
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
          {" "}→ 「{targetLabel}」로 자동 입력됩니다 (§99①3 환산 {roleLabel})
        </div>
      )}
    </ToneCard>
  );
}
