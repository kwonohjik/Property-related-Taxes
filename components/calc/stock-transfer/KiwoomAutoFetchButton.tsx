"use client";

/**
 * KiwoomAutoFetchButton — 키움 자동조회 명시 버튼.
 *
 * 클릭 시 /api/kiwoom/transfer-1month 호출 → 31-슬롯 자동 채움.
 *
 * 정책:
 * - useEffect → store 미러링 금지 (`feedback_useeffect_store_mirror_forbidden`). onClick 핸들러 내 직접 onChange.
 * - 자동 fallback 금지 (`feedback_no_silent_apportion_fallback`). 응답 실패 시 사용자 안내, 자동 채움 금지.
 * - 거래정지 종목은 활성화 조건 자체에서 차단 (상증령 §52의2③).
 *
 * 활성화 조건 (UI design v2 §4.3.4):
 *   securityCode 6자리 + transferDate + marketType ∈ {kospi, kosdaq, konex} + !tradingHalt
 *
 * 비상장(`unlisted`)은 키움 API 미지원 → 자동조회 불가 안내 (F-14 후속).
 */

import { useState } from "react";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isKiwoomFetchable, type StoreMarketType } from "@/lib/kiwoom/market-mapping";
import { fetchKiwoomWithTimeout } from "@/lib/kiwoom/fetch-with-timeout";

/**
 * 축 — 양도일(§163⑨ 분모) / 취득일(분자).
 *
 * 🔑 취득일 축은 **거래정지로 막지 않는다**. 상증령 §52의2③이 문제 삼는 것은
 *    「취득일 이전 1개월 «구간»」의 정지이지 조회 시점의 현재 상태가 아니다.
 *    현재 정지 사실은 route가 `currentTradingHalt`로 실어 보내고 여기서 «안내»만 한다.
 */
export type KiwoomFetchAxis = "transfer" | "acquisition";

interface Props {
  securityCode: string;
  transferDate: string;
  marketType: StockTransferFormData["marketType"];
  tradingHalt: boolean;
  onFill: (patch: Partial<StockTransferFormData>) => void;
  /** 기본은 양도일 축 (기존 호출부 무변경) */
  axis?: KiwoomFetchAxis;
}

export function KiwoomAutoFetchButton({
  securityCode,
  transferDate,
  marketType,
  tradingHalt,
  onFill,
  axis = "transfer",
}: Props) {
  const isAcquisition = axis === "acquisition";
  const dateLabel = isAcquisition ? "취득일" : "양도일";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    average: number;
    tradingDays: number;
    sum: number;
    slotDates: string[];
    closingPrices: (number | null)[];
    weekendLabels: string[];
    anchorShifted: boolean;
    anchorDate: string;
    marketCalendarUnavailable: boolean;
    stockSpecificGapAtAnchor: boolean;
    currentTradingHalt: boolean;
  } | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const codeValid = /^[0-9A-Z]{6}$/.test(securityCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(transferDate);
  // foreign_stock 등 키움 미지원 시장은 본 함수 외부에서 차단
  const marketValid = isKiwoomFetchable(marketType as StoreMarketType);
  // 취득일 축은 «현재» 정지로 막지 않는다 (F-4·F-5 — route도 같은 축으로 분기한다)
  const haltBlocked = tradingHalt && !isAcquisition;

  const canFetch = codeValid && dateValid && marketValid && !haltBlocked && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요"
    : !dateValid
      ? `${dateLabel} 입력 필요`
      : !marketValid
        ? marketType === "unlisted"
          ? "비상장 — 키움 자동조회 미지원 (수동 입력)"
          : "지원 시장 아님 (KOSPI · KOSDAQ · KONEX)"
        : haltBlocked
          ? "거래정지 종목 — 수동 입력 필요 (상증령 §52의2③)"
          : null;

  async function handleClick() {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchKiwoomWithTimeout("/api/kiwoom/transfer-1month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode: securityCode, baseDate: transferDate, axis }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const userMsg =
          res.status === 503
            ? "키움 API 미설정 — 관리자에게 환경변수 등록 요청 필요 (수동 입력 가능)"
            : res.status === 404
              ? `종목을 찾을 수 없습니다 (코드: ${securityCode}) — 상장폐지 종목일 수 있습니다. 수동 입력하세요.`
              : res.status === 409
                ? body.message ?? "거래정지·관리종목 — 수동 입력 필요"
                : res.status === 429
                  ? "키움 API 호출 한도 초과 — 잠시 후 다시 시도"
                  : body.message ?? "자동조회 실패";
        setError(userMsg);
        if (res.status === 409) {
          onFill({ kiwoomTradingHalt: true });
        }
        return;
      }
      const data = (await res.json()) as {
        slotDates: string[];
        closingPrices: (number | null)[];
        weekendLabels: string[];
        average: number;
        tradingDays: number;
        sum: number;
        tradingHalt: boolean;
        currentTradingHalt?: boolean;
        anchorDate?: string;
        anchorShifted?: boolean;
        marketCalendarUnavailable?: boolean;
        stockSpecificGapAtAnchor?: boolean;
      };

      /**
       * route 응답을 **그대로** 쓴다 — 창도 평균도 여기서 다시 만들지 않는다.
       *
       * 🔑 종전에는 응답을 버리고 `preTransferAutoFillDates(transferDate)`로 창을 재구성해
       *    평균을 재산정했고, 그 근거로 「API slotDates는 양도일 미포함」이라 적혀 있었다.
       *    **사실이 아니었다** — route도 같은 `buildOneMonthBeforeSlots`를 쓴다
       *    (`app/api/kiwoom/transfer-1month/route.ts:88`). 두 창은 원래 같았고 재계산은
       *    같은 값을 다시 구하는 일이었다.
       *
       * 🔴 그리고 무해하지도 않다 — route가 anchor를 보정하면(휴장일 fixture 범위 밖)
       *    여기서 창을 다시 만드는 순간 **그 보정이 화면에 도달하지 못한다**.
       *    anchor: `__tests__/components/kiwoom-autofetch-consumes-route-window.anchor.test.tsx`
       */
      const dates = data.slotDates;
      const closings = data.closingPrices.map((c) =>
        typeof c === "number" && c > 0 ? String(c) : "",
      );
      const avg = data.average;

      /**
       * 축마다 «쓰는 필드»가 다르다.
       *
       * · 취득일 축에는 일자별 입력 표가 없다 ⇒ `transferPriceDates/Closing`을 건드리지 않는다.
       * · 🔴 취득일 축은 `kiwoomTradingHalt`도 쓰지 않는다 — 그 값은 폼 전역이라
       *   `Step2.tsx`의 배너가 그것을 보고 「**양도일** 거래정지 토글을 켜라」고 안내한다.
       *   취득일 조회가 그 플래그를 세우면 축이 뒤섞인다(자가검토 F-5).
       *   현재 정지 사실은 아래 결과 카드에서 «안내»한다.
       */
      onFill(
        isAcquisition
          ? {
              acquisitionDatePriceAvg1Month: avg > 0 ? String(avg) : "",
              kiwoomLastFetchedAt: new Date().toISOString(),
            }
          : {
              transferPriceDates: dates,
              transferPriceClosing: closings,
              transferDatePriceAvg1Month: avg > 0 ? String(avg) : "",
              kiwoomTradingHalt: data.tradingHalt,
              kiwoomLastFetchedAt: new Date().toISOString(),
            },
      );

      // 검증용 결과 요약 — 표시값도 route 응답에서 곧장 온다(화면과 폼이 갈리지 않게)
      setInfo({
        average: avg,
        tradingDays: data.tradingDays,
        sum: data.sum,
        slotDates: dates,
        closingPrices: data.closingPrices,
        weekendLabels: data.weekendLabels ?? dates.map(() => ""),
        anchorShifted: data.anchorShifted ?? false,
        anchorDate: data.anchorDate ?? transferDate,
        marketCalendarUnavailable: data.marketCalendarUnavailable ?? false,
        stockSpecificGapAtAnchor: data.stockSpecificGapAtAnchor ?? false,
        currentTradingHalt: data.currentTradingHalt ?? false,
      });
    } catch (e) {
      setError((e as Error).message ?? "네트워크 오류");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-sky-900">
          <p className="font-semibold">키움증권 자동조회 — {dateLabel} 이전 1개월</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + {dateLabel} 입력 후 클릭하면 1개월 종가평균이 자동으로 채워집니다.
          </p>
        </div>
        <button
          type="button"
          disabled={!canFetch}
          onClick={handleClick}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed"
          title={disabledReason ?? "키움 자동조회 실행"}
        >
          {loading ? "🔄 조회 중..." : `🔍 ${dateLabel} 키움 자동조회`}
        </button>
      </div>
      {disabledReason && !loading && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          ⚠️ {disabledReason}
        </p>
      )}
      {error && (
        <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
          ❌ {error}
        </p>
      )}
      {info && !error && (
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900 space-y-2">
          <div className="space-y-1">
            <p>
              ✓ 기간{" "}
              <strong>{info.slotDates[0]} ~ {info.slotDates[info.slotDates.length - 1]}</strong>{" "}
              ({info.slotDates.length}일) · 거래일{" "}
              <strong>{info.tradingDays}</strong>일
            </p>
            <p>
              평균 = <strong>{info.sum.toLocaleString()}</strong> ÷{" "}
              <strong>{info.tradingDays}</strong> ={" "}
              <strong className="text-emerald-900 text-sm">{info.average.toLocaleString()}</strong>원 (원미만 절사)
            </p>
            <p className="text-emerald-700">
              → §99①3 환산 {isAcquisition ? "분자" : "분모"}에 자동 입력됩니다
            </p>

            {/* V-1 — 「거래일 0」은 에러가 아니라 200 응답이다. 원인을 그대로 알린다. */}
            {info.tradingDays === 0 && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                ⚠️ 해당 기간에 거래일이 없습니다 — {dateLabel}이 상장일 이전이거나 조회 범위
                밖입니다. 값을 채우지 않았습니다. 수동으로 입력하세요.
              </p>
            )}

            {/* B′ — anchor 보정이 일어났으면 숨기지 않고 보여준다 */}
            {info.anchorShifted && (
              <p className="rounded border border-sky-300 bg-sky-50 px-2 py-1 text-sky-800">
                ℹ️ {dateLabel}이 매매 없는 날이라 직전 거래일 <strong>{info.anchorDate}</strong>{" "}
                기준으로 계산했습니다 (상증법 §63①1가목 단서 · 소득세법 §99①3 준용).
              </p>
            )}

            {info.marketCalendarUnavailable && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                ⚠️ 시장 거래일 달력을 확인하지 못해 기준일을 <strong>보정하지 않았습니다</strong>.
                {dateLabel}이 휴장일이라면 직전 거래일로 다시 조회하세요.
              </p>
            )}

            {/* V-3 — 시장은 열렸는데 이 종목만 종가가 없다 (§52의2③ 영역) */}
            {info.stockSpecificGapAtAnchor && (
              <p className="rounded border border-rose-300 bg-rose-50 px-2 py-1 text-rose-800">
                ⚠️ {info.anchorDate}에 시장은 열렸으나 이 종목의 종가가 없습니다 — 거래정지·관리종목
                또는 상장 이전일 수 있습니다. 해당하면 §165③ 보충 평가 토글을 사용하세요
                (상증령 §52의2③).
              </p>
            )}

            {/* A-6 — 취득일 축은 «현재» 정지로 막지 않고 안내만 한다 */}
            {isAcquisition && info.currentTradingHalt && (
              <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-amber-800">
                ⚠️ 이 종목은 <strong>현재</strong> 거래정지·관리종목입니다. 위 평균은 취득일
                기준이라 그대로 쓸 수 있으나, <strong>취득일 이전 1개월 구간</strong>에 정지가
                있었다면 §165③ 보충 평가로 가야 합니다 (상증령 §52의2③).
              </p>
            )}

            {/* A-8 — 키움은 수정주가가 아닌 «당시 실제 종가»를 준다 */}
            <p className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-slate-700">
              ℹ️ 조회값은 <strong>당시 실제 종가</strong>입니다(수정주가 아님). 이후 액면분할·병합이
              있었다면 분자·분모의 1주 단위가 달라지므로 <strong>자본조정</strong> 입력으로
              반영하세요 — 자동 보정하지 않습니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            aria-expanded={showDetail}
            className={expandToggleClass("emerald")}
          >
            {expandToggleLabel(showDetail)} · 일자별 종가 (검증용)
          </button>
          {showDetail && (
            <div className="rounded border border-emerald-300 bg-white p-2 space-y-1 max-h-96 overflow-y-auto">
              <p className="text-micro text-emerald-700 sticky top-0 bg-white pb-1 border-b border-emerald-100">
                양도일 이전 1개월 일자별 종가 — 거래일만 분모 산입 (상증령 §52의2④ 공휴일·토요일 제외)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-caption font-mono">
                {info.slotDates.map((iso, i) => {
                  const close = info.closingPrices[i];
                  const label = info.weekendLabels[i];
                  const isTrading = typeof close === "number" && close > 0;
                  return (
                    <div
                      key={iso}
                      className={`flex justify-between px-1.5 py-0.5 rounded ${
                        isTrading ? "" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span className="text-gray-500 tabular-nums">{i + 1}. {iso}</span>
                      <span className="tabular-nums">{isTrading ? close.toLocaleString() : label || "—"}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-micro text-emerald-700 pt-1 border-t border-emerald-100 sticky bottom-0 bg-white">
                합계 = {info.sum.toLocaleString()} · 거래일 = {info.tradingDays} · 평균 = floor(합계/거래일) = {info.average.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
