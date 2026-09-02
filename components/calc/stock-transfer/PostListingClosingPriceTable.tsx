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
import { calcClosingAvgWithEvent } from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import {
  buildOneMonthBeforeSlots,
  buildOneMonthAfterListingSlots,
  resolveValuationAnchor,
} from "@/lib/kiwoom/calendar";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

interface PostListingClosingPriceTableProps {
  form: Pick<
    StockTransferFormData,
    | "listingDate"
    | "listingPriceDates"
    | "listingPriceClosing"
    | "listingPriceBasisDate"
    | "listingPriceHasIncrease"
    | "listingPriceIncreaseDate"
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
 * 양도일 기산 anchor — 양도일이 **매매가 없는 날**이면 직전 거래일까지 시프트.
 *
 * 근거: 상증법 §63①1가목 괄호(「평가기준일이 공휴일 등 매매가 없는 날이면 **그 전일**을 기준」)
 *       + 상증령 §52의2④(공휴일·대체공휴일·토요일). 소득세법 §99①3이 이 가목을 준용한다.
 *
 * ⚠️ 판정은 `lib/kiwoom/calendar.ts`의 `resolveValuationAnchor`가 **단일 소스**다.
 *    종전에는 이 파일이 「토·일만」 보는 자체 구현을 갖고 있어 삼일절·현충일 같은 평일 공휴일과
 *    납회기간(12/29~31)에서 시프트가 일어나지 않았다.
 *
 * 예: 2023-02-26(일) → 2023-02-24(금)
 *     2024-03-01(금·삼일절) → 2024-02-29(목)
 *     2023-12-29(금·납회) → 2023-12-28(목)
 *     ※ 휴장일 픽스처(2020~2026) 범위 밖 평일은 판정 불가라 그대로 둔다.
 */
export function resolvePreTransferAnchor(transferDate: string): string {
  if (!transferDate || !/^\d{4}-\d{2}-\d{2}$/.test(transferDate)) return "";
  return resolveValuationAnchor(transferDate);
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
 * 상장일 이후 1개월 일자 배열 — **엔진 정본에 위임**한다.
 *
 * 예: 2009-08-21 → 2009-08-21 ~ 2009-09-20 (31일)
 *     2009-02-01 → 2009-02-01 ~ 2009-02-28 (28일)
 *     2023-01-31 → 2023-01-31 ~ 2023-02-28 (민법 §160③ 말일 클램프)
 *
 * 🔑 종전에는 같은 산식이 **여기에도 복제**돼 있었고, 그 주석이 오버플로를
 *    「JS가 자동 보정 (예: 1-31 + 1mo → 3-3)」이라며 **결함을 정상 동작으로 문서화**했다.
 *    형제 `preTransferAutoFillDates`(양도일 직전 1개월)는 이미 위임으로 통합됐는데
 *    상장일 축만 남아 있었다 — 한쪽만 고치면 자동조회는 옳은 기간을 쓰는데
 *    **수동 입력 표는 계속 31칸을 렌더**해 법정 기간 밖 종가가 §165⑤ 분자에 섞인다.
 *    export 이름은 그대로 둔다(소비처 무변경).
 */
export function autoFillDates(listingDate: string): string[] {
  return buildOneMonthAfterListingSlots(listingDate);
}

export function PostListingClosingPriceTable({ form, onChange }: PostListingClosingPriceTableProps) {
  // 항상 listingDate에서 도출 (single source of truth) — store dates는 엔진 전달용 mirror
  const displayDates = useMemo(() => autoFillDates(form.listingDate), [form.listingDate]);
  const total = displayDates.length;
  const leftCount = Math.ceil(total / 2);

  // 미리보기 — H-01 import (이중 진실 차단)
  // 거래일 = (주말 제외) AND (실제 종가 입력 > 0) 인 셀
  //
  // 🔑 **`calcClosingAvgWithEvent`를 쓴다** — 종전에는 절단 없는 `calcMonthlyClosingAverage`라
  //    증자·합병이 켜진 사례에서 **화면 평균 ≠ 엔진 평균**이었다(엔진·adapter는 절단본을 쓴다).
  //    simple+daily에서는 이 값이 곧 §165⑤ 계산식 첫 항이므로 갈리면 그대로 오답으로 읽힌다.
  const preview = useMemo(() => {
    const closes = displayDates.map((d, i) => {
      const dow = dayOfWeek(d);
      if (dow === 0 || dow === 6) return 0;
      return parseAmount(form.listingPriceClosing[i] || "0");
    });
    return calcClosingAvgWithEvent({
      dates: displayDates,
      closes,
      basisDate: form.listingPriceBasisDate ?? "",
      hasIncrease: form.listingPriceHasIncrease === true,
      increaseDate: form.listingPriceIncreaseDate,
    });
  }, [
    displayDates,
    form.listingPriceClosing,
    form.listingPriceBasisDate,
    form.listingPriceHasIncrease,
    form.listingPriceIncreaseDate,
  ]);

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
