"use client";

/**
 * useKiwoomValuationFetch — F-01 §63①1가목 키움 자동조회 hook.
 *
 * `KiwoomValuationAutoFetchButton` 의 fetch state(loading·error·info·showDetail)를
 * 컴포넌트 외부로 끌어올려 버튼과 결과 카드가 같은 state를 공유할 수 있게 한다.
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step B-4
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (onClick 핸들러 직접)
 *   - 자동 fallback 채움 0건
 *   - 비상장·거래정지 종목 활성화 차단 (서버 응답 status code)
 *   - onResponse 가 있으면 onFill 호출 skip (stale closure 덮어쓰기 방지)
 *     [[listed-stock-besshi-page2-empty-bug-fix]]
 */

import { useCallback, useState } from "react";
import type { KiwoomValuation2MonthResponse } from "@/lib/calc/listed-stock-besshi";

export interface KiwoomValuationInfo {
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
}

export interface UseKiwoomValuationFetchArgs {
  stockCode: string;
  valuationDate: string;
  onFill?: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
  onResponse?: (response: KiwoomValuation2MonthResponse) => void;
  startOverrideDate?: string;
  endOverrideDate?: string;
  syncName?: boolean;
}

export interface UseKiwoomValuationFetchResult {
  loading: boolean;
  error: string | null;
  info: KiwoomValuationInfo | null;
  showDetail: boolean;
  canFetch: boolean;
  disabledReason: string | null;
  fetch: () => Promise<void>;
  setShowDetail: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function useKiwoomValuationFetch({
  stockCode,
  valuationDate,
  onFill,
  onResponse,
  startOverrideDate,
  endOverrideDate,
  syncName = false,
}: UseKiwoomValuationFetchArgs): UseKiwoomValuationFetchResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<KiwoomValuationInfo | null>(null);
  const [showDetail, setShowDetail] = useState(false);

  const codeValid = /^[0-9A-Z]{6}$/.test(stockCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(valuationDate);
  const canFetch = codeValid && dateValid && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요"
    : !dateValid
      ? "평가기준일 입력 필요 (상속개시일 또는 증여일)"
      : null;

  const fetchData = useCallback(async () => {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.fetch("/api/kiwoom/valuation-2month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode,
          valuationDate,
          ...(startOverrideDate ? { startOverrideDate } : {}),
          ...(endOverrideDate ? { endOverrideDate } : {}),
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
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
  }, [canFetch, stockCode, valuationDate, startOverrideDate, endOverrideDate, syncName, onResponse, onFill]);

  return {
    loading,
    error,
    info,
    showDetail,
    canFetch,
    disabledReason,
    fetch: fetchData,
    setShowDetail,
  };
}
