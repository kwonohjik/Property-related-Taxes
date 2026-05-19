"use client";

/**
 * KiwoomPostListingAutoFetchButton — §165⑤ 상장일 이후 1개월 자동조회 (사례 48).
 *
 * 클릭 시 /api/kiwoom/post-listing-1month 호출 → 상장일~+1개월 슬롯 자동 채움.
 *
 * 활성화 조건:
 *   securityCode 6자리 + listingDate + marketType ∈ {kospi, kosdaq, konex} + !tradingHalt
 *   + acquiredBeforeListing === true (취득 후 상장 분기)
 *
 * 정책 (본 PR과 동일):
 *   - useEffect → store 미러링 0건 (onClick 핸들러 직접 onChange)
 *   - 자동 fallback 채움 0건
 */

import { useState } from "react";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isKiwoomFetchable, type StoreMarketType } from "@/lib/kiwoom/market-mapping";
import { autoFillDates } from "./PostListingClosingPriceTable";

interface Props {
  securityCode: string;
  listingDate: string;
  marketType: StockTransferFormData["marketType"];
  tradingHalt: boolean;
  onFill: (patch: Partial<StockTransferFormData>) => void;
}

export function KiwoomPostListingAutoFetchButton({
  securityCode,
  listingDate,
  marketType,
  tradingHalt,
  onFill,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeValid = /^\d{6}$/.test(securityCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(listingDate);
  const marketValid = isKiwoomFetchable(marketType as StoreMarketType);

  const canFetch = codeValid && dateValid && marketValid && !tradingHalt && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요"
    : !dateValid
      ? "상장일 입력 필요"
      : !marketValid
        ? marketType === "unlisted"
          ? "비상장 — 키움 자동조회 미지원 (수동 입력)"
          : "지원 시장 아님 (KOSPI · KOSDAQ · KONEX)"
        : tradingHalt
          ? "거래정지 종목 — 수동 입력 필요 (상증령 §52의2③)"
          : null;

  async function handleClick() {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kiwoom/post-listing-1month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode: securityCode, listingDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const userMsg =
          res.status === 503
            ? "키움 API 미설정 — 관리자에게 환경변수 등록 요청 필요 (수동 입력 가능)"
            : res.status === 404
              ? `종목을 찾을 수 없습니다 (코드: ${securityCode})`
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
        average: number;
        tradingDays: number;
        tradingHalt: boolean;
      };

      // API slotDates와 UI displayDates(autoFillDates)는 동일 산식 — Map 매핑으로 안전 보장
      const apiCloseByDate = new Map<string, number>();
      data.slotDates.forEach((d, i) => {
        const c = data.closingPrices[i];
        if (typeof c === "number") apiCloseByDate.set(d, c);
      });

      const displayDates = autoFillDates(listingDate);
      const closings = displayDates.map((d) => {
        const c = apiCloseByDate.get(d);
        return typeof c === "number" ? String(c) : "";
      });

      // displayDates 기준 평균 재산정 (안전)
      let sum = 0;
      let n = 0;
      for (const v of closings) {
        if (v) {
          const num = Number(v);
          if (num > 0) {
            sum += num;
            n += 1;
          }
        }
      }
      const avg = n > 0 ? Math.floor(sum / n) : 0;

      onFill({
        listingPriceDates: displayDates,
        listingPriceClosing: closings,
        listingDatePriceAvg1Month: avg > 0 ? String(avg) : "",
        kiwoomTradingHalt: data.tradingHalt,
        kiwoomLastFetchedAt: new Date().toISOString(),
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
          <p className="font-semibold">키움증권 자동조회 (상장일 이후 1개월)</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + 상장일 입력 후 클릭하면 상장일 이후 1개월 종가가 자동으로 채워집니다 (§165⑤).
          </p>
        </div>
        <button
          type="button"
          disabled={!canFetch}
          onClick={handleClick}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed"
          title={disabledReason ?? "키움 자동조회 실행"}
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
    </div>
  );
}
