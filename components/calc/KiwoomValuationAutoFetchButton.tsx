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

interface Props {
  stockCode: string;
  valuationDate: string; // 상속개시일 또는 증여일
  onFill: (patch: { listedStockAvgPrice: number; stockName?: string }) => void;
  /** 종목명 자동 갱신 여부 (true 시 응답의 stockName으로 덮어쓰기) */
  syncName?: boolean;
}

export function KiwoomValuationAutoFetchButton({
  stockCode,
  valuationDate,
  onFill,
  syncName = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    average: number;
    tradingDays: number;
    sum: number;
    stockName: string;
  } | null>(null);

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
        body: JSON.stringify({ stockCode, valuationDate }),
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
      };
      const patch: { listedStockAvgPrice: number; stockName?: string } = {
        listedStockAvgPrice: data.average,
      };
      if (syncName && data.stockName) patch.stockName = data.stockName;
      onFill(patch);
      setInfo({
        average: data.average,
        tradingDays: data.tradingDays,
        sum: data.sum,
        stockName: data.stockName,
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
        <div className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900 space-y-1">
          <p>
            ✓ <strong>{info.stockName}</strong> · 거래일{" "}
            <strong>{info.tradingDays}</strong>일 · 종가합계{" "}
            <strong>{info.sum.toLocaleString()}</strong>원
          </p>
          <p>
            전후 2개월 종가 단순평균:{" "}
            <strong className="text-emerald-900">{info.average.toLocaleString()}</strong>원 → listedStockAvgPrice 자동 mirror
          </p>
        </div>
      )}
    </div>
  );
}
