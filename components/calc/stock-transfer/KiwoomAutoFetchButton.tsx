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
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isKiwoomFetchable, type StoreMarketType } from "@/lib/kiwoom/market-mapping";
import { preTransferAutoFillDates } from "./PostListingClosingPriceTable";

interface Props {
  securityCode: string;
  transferDate: string;
  marketType: StoreMarketType;
  tradingHalt: boolean;
  onFill: (patch: Partial<StockTransferFormData>) => void;
}

export function KiwoomAutoFetchButton({
  securityCode,
  transferDate,
  marketType,
  tradingHalt,
  onFill,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const codeValid = /^\d{6}$/.test(securityCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(transferDate);
  const marketValid = isKiwoomFetchable(marketType);
  const haltBlocked = tradingHalt;

  const canFetch = codeValid && dateValid && marketValid && !haltBlocked && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요"
    : !dateValid
      ? "양도일 입력 필요"
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
      const res = await fetch("/api/kiwoom/transfer-1month", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode: securityCode, transferDate }),
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

      // ★ API slotDates(양도일 미포함)와 UI displayDates(양도일 포함, anchor 시프트) 차이 보정.
      // 종가를 일자 키로 Map 매핑한 후 UI displayDates에 align해서 슬롯 시프트 차단.
      const apiCloseByDate = new Map<string, number>();
      data.slotDates.forEach((d, i) => {
        const c = data.closingPrices[i];
        if (typeof c === "number") apiCloseByDate.set(d, c);
      });

      const displayDates = preTransferAutoFillDates(transferDate);
      const dates = displayDates;
      const closings = displayDates.map((d) => {
        const c = apiCloseByDate.get(d);
        return typeof c === "number" ? String(c) : "";
      });

      // displayDates 기준 평균 재산정 (양도일 포함 알고리즘 — API 기간과 1일 차이 가능)
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
        transferPriceDates: dates,
        transferPriceClosing: closings,
        transferDatePriceAvg1Month: avg > 0 ? String(avg) : "",
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
          <p className="font-semibold">키움증권 자동조회</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + 양도일 입력 후 클릭하면 1개월 종가가 자동으로 채워집니다.
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
