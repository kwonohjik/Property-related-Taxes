"use client";

/**
 * KiwoomValuationAutoFetchButton — F-01 §63①1가목 상속·증여 평가 자동조회.
 *
 * 평가기준일(상속개시일·증여일) 전후 2개월 종가 평균을 자동 산정 → listedStockAvgPrice mirror.
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (onClick 핸들러 직접)
 *   - 자동 fallback 채움 0건
 *   - 비상장·거래정지 종목 활성화 차단
 */

import { useState } from "react";

import type { KiwoomValuation2MonthResponse } from "@/lib/calc/listed-stock-besshi";

interface Props {
  stockCode: string;
  valuationDate: string; // 상속개시일 또는 증여일
  /**
   * 평균가·종목명 patch 콜백 (선택).
   * onResponse 가 제공된 경우 호출자가 모든 patch를 책임하므로 본 콜백은 호출되지 않음
   * (stale closure 덮어쓰기 방지 — listed-stock-besshi-page2-empty-bug-fix.plan §2).
   */
  onFill?: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
  /**
   * 응답 전체를 받아 4그룹 분할 등 별지부표 echo channel-fill에 사용 (선택).
   * onFill 과 동시 전달 시 onResponse 만 호출.
   */
  onResponse?: (response: KiwoomValuation2MonthResponse) => void;
  /** §52의2② 평가구간 단축 — capitalIncreaseDate || mergerDate ∈ [D−2월, D] 일 때 전달 (선택). */
  startOverrideDate?: string;
  /** 종목명 자동 갱신 여부 (true 시 응답의 stockName으로 덮어쓰기) */
  syncName?: boolean;
}

export function KiwoomValuationAutoFetchButton({
  stockCode,
  valuationDate,
  onFill,
  onResponse,
  startOverrideDate,
  syncName = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    average: number;
    tradingDays: number;
    sum: number;
    stockName: string;
    slotDates: string[];
    closingPrices: (number | null)[];
    weekendLabels: string[];
    resolvedAnchor?: string;
    anchorShifted?: boolean;
    anchorShiftReason?: string;
    valuationPeriodStart?: string;
    valuationPeriodEnd?: string;
  } | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const codeValid = /^[0-9A-Z]{6}$/.test(stockCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(valuationDate);
  const canFetch = codeValid && dateValid && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요"
    : !dateValid
      ? "평가기준일 입력 필요 (상속개시일 또는 증여일)"
      : null;

  async function handleClick() {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kiwoom/valuation-2month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode,
          valuationDate,
          ...(startOverrideDate ? { startOverrideDate } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const userMsg =
          res.status === 503
            ? "키움 API 미설정 — 수동 입력 가능"
            : res.status === 404
              ? `종목을 찾을 수 없습니다 (코드: ${stockCode})`
              : res.status === 409
                ? body.message ?? "거래정지·관리종목 — 수동 입력 필요"
                : body.message ?? "자동조회 실패";
        setError(userMsg);
        return;
      }
      const data = (await res.json()) as {
        average: number;
        tradingDays: number;
        sum: number;
        stockName: string;
        slotDates: string[];
        closingPrices: (number | null)[];
        weekendLabels: string[];
        inputValuationDate?: string;
        resolvedAnchor?: string;
        anchorShifted?: boolean;
        anchorShiftReason?: string;
        valuationPeriodStart?: string;
        valuationPeriodEnd?: string;
      };
      const patch: { listedStockAvgPrice: number; stockName?: string } = {
        listedStockAvgPrice: data.average,
      };
      if (syncName && data.stockName) patch.stockName = data.stockName;
      if (onResponse) {
        onResponse({
          stockCode,
          stockName: data.stockName,
          valuationDate,
          slotDates: data.slotDates,
          closingPrices: data.closingPrices,
          weekendLabels: data.weekendLabels,
          tradingDays: data.tradingDays,
          sum: data.sum,
          average: data.average,
          inputValuationDate: data.inputValuationDate,
          resolvedAnchor: data.resolvedAnchor,
          anchorShifted: data.anchorShifted,
          anchorShiftReason: data.anchorShiftReason,
          valuationPeriodStart: data.valuationPeriodStart,
          valuationPeriodEnd: data.valuationPeriodEnd,
        });
      }
      // onResponse 가 있으면 호출자가 모든 patch를 책임 — stale closure 덮어쓰기 방지
      if (onFill && !onResponse) {
        onFill(patch);
      }
      setInfo({
        average: data.average,
        tradingDays: data.tradingDays,
        sum: data.sum,
        stockName: data.stockName,
        slotDates: data.slotDates,
        closingPrices: data.closingPrices,
        weekendLabels: data.weekendLabels,
        resolvedAnchor: data.resolvedAnchor,
        anchorShifted: data.anchorShifted,
        anchorShiftReason: data.anchorShiftReason,
        valuationPeriodStart: data.valuationPeriodStart,
        valuationPeriodEnd: data.valuationPeriodEnd,
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
          <p className="font-semibold">키움증권 자동조회 (전후 2개월 평균)</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + 평가기준일 입력 후 클릭 시 전후 2개월 종가 단순평균이 자동 계산됩니다 (§63①1가).
          </p>
        </div>
        <button
          type="button"
          disabled={!canFetch}
          onClick={handleClick}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed"
          title={disabledReason ?? "전후 2개월 평균 자동 계산"}
        >
          {loading ? "🔄 조회 중..." : "🔍 키움 자동조회"}
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
          {info.anchorShifted && info.resolvedAnchor && (
            <div
              className="rounded bg-amber-50 border border-amber-200 px-2 py-1.5 text-amber-900"
              data-testid="ls-anchor-shift-notice"
            >
              ℹ️ 평가기준일 <strong>{valuationDate}</strong>
              {info.anchorShiftReason && <span> ({info.anchorShiftReason})</span>}
              이 비거래일이므로 직전 거래일 <strong>{info.resolvedAnchor}</strong>로 보정 (상증령 §52의2).
            </div>
          )}
          <div className="space-y-1">
            <p>
              ✓ <strong>{info.stockName}</strong> · 평가구간{" "}
              <strong>
                {info.valuationPeriodStart ?? info.slotDates[0]} ~{" "}
                {info.valuationPeriodEnd ?? info.slotDates[info.slotDates.length - 1]}
              </strong>{" "}
              ({info.slotDates.length}일)
            </p>
            <p>
              거래일 <strong>{info.tradingDays}</strong>일 · 종가합계{" "}
              <strong>{info.sum.toLocaleString()}</strong>원
            </p>
            <p>
              전후 2개월 종가 단순평균 ={" "}
              <strong>{info.sum.toLocaleString()}</strong> ÷{" "}
              <strong>{info.tradingDays}</strong> ={" "}
              <strong className="text-emerald-900 text-sm">
                {info.average.toLocaleString()}
              </strong>원 (원미만 절사)
            </p>
            <p className="text-emerald-700">→ 아래 &quot;전후 2개월 종가 단순평균&quot;에 자동 mirror됨</p>
          </div>

          {/* 검증용 일자별 종가 상세 토글 */}
          <button
            type="button"
            onClick={() => setShowDetail((v) => !v)}
            className="text-xs text-emerald-800 underline hover:text-emerald-900"
          >
            {showDetail ? "▲ 일자별 종가 숨기기" : "▼ 일자별 종가 상세 보기 (검증용)"}{" "}
          </button>

          {showDetail && (
            <div className="rounded border border-emerald-300 bg-white p-2 space-y-1 max-h-96 overflow-y-auto">
              <p className="text-[10px] text-emerald-700 sticky top-0 bg-white pb-1 border-b border-emerald-100">
                평가기준일 전후 2개월 일자별 종가 — 거래일만 분모 산입 (상증령 §52의2④ 공휴일·토요일 제외)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] font-mono">
                {info.slotDates.map((iso, i) => {
                  const close = info.closingPrices[i];
                  const label = info.weekendLabels[i];
                  const isTrading = typeof close === "number";
                  return (
                    <div
                      key={iso}
                      className={`flex justify-between px-1.5 py-0.5 rounded ${
                        isTrading ? "" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span className="text-gray-500 tabular-nums">
                        {i + 1}. {iso}
                      </span>
                      <span className="tabular-nums">
                        {isTrading
                          ? close.toLocaleString()
                          : label || "—"}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-emerald-700 pt-1 border-t border-emerald-100 sticky bottom-0 bg-white">
                합계 = {info.sum.toLocaleString()} · 거래일 = {info.tradingDays} · 평균 = floor(합계/거래일) = {info.average.toLocaleString()}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
