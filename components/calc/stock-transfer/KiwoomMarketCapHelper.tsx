"use client";

/**
 * KiwoomMarketCapHelper — F-04 대주주 임계 시가총액 자동 산정.
 *
 * 종목코드 + 직전 사업연도말 일자 입력 후 클릭 시:
 *   1. /api/kiwoom/daily-close 호출 → 직전 사업연도말 종가
 *   2. 시총 = 종가 × 보유 주식수 (본인 단독 + 본인+특수관계인 합산)
 *   3. selfMarketCap·combinedMarketCap 자동 채움
 *
 * 법령: 소득세법 시행령 §157①. 2024.1.1.~ 임계 50억.
 *
 * 정책:
 *   - useEffect → store 미러링 0건 (onClick 핸들러 직접 onChange)
 *   - 자동 fallback 채움 0건 (네트워크 실패·종가 미반환 시 사용자 안내)
 */

import { useState } from "react";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";
import { isKiwoomFetchable, type StoreMarketType } from "@/lib/kiwoom/market-mapping";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { fetchKiwoomWithTimeout } from "@/lib/kiwoom/fetch-with-timeout";

interface Props {
  securityCode: string;
  priorYearEndDate: string;
  marketType: StockTransferFormData["marketType"];
  tradingHalt: boolean;
  selfOwnedShares: string;
  combinedOwnedShares: string;
  isLargestShareholderGroup: boolean;
  onFill: (patch: Partial<StockTransferFormData>) => void;
}

export function KiwoomMarketCapHelper({
  securityCode,
  priorYearEndDate,
  marketType,
  tradingHalt,
  selfOwnedShares,
  combinedOwnedShares,
  isLargestShareholderGroup,
  onFill,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<{
    close: number;
    date: string;
    priorTradingDate?: string;
    selfCap: number;
    combinedCap: number;
  } | null>(null);

  const codeValid = /^[0-9A-Z]{6}$/.test(securityCode);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(priorYearEndDate);
  const marketValid = isKiwoomFetchable(marketType as StoreMarketType);
  const selfShares = parseDecimal(selfOwnedShares);
  const combinedShares = isLargestShareholderGroup ? parseDecimal(combinedOwnedShares) : 0;
  const hasShares = selfShares > 0 || combinedShares > 0;

  const canFetch =
    codeValid && dateValid && marketValid && !tradingHalt && hasShares && !loading;

  const disabledReason = !codeValid
    ? "종목코드 6자리 입력 필요 (Step1)"
    : !dateValid
      ? "직전 사업연도말 일자 입력 필요"
      : !marketValid
        ? marketType === "unlisted"
          ? "비상장 — 시총 기준 판정 자동조회 미지원"
          : "지원 시장 아님 (KOSPI · KOSDAQ · KONEX)"
        : tradingHalt
          ? "거래정지 종목 — 수동 입력 필요"
          : !hasShares
            ? "본인 단독 또는 합산 보유 주식수 입력 필요"
            : null;

  async function handleClick() {
    if (!canFetch) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchKiwoomWithTimeout("/api/kiwoom/daily-close", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode: securityCode, date: priorYearEndDate }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        setError(body.message ?? `자동조회 실패 (${res.status})`);
        return;
      }
      const data = (await res.json()) as {
        close: number;
        date: string;
        isTradingDay: boolean;
        priorTradingDate?: string;
      };

      const close = data.close;
      const selfCap = Math.floor(close * selfShares);
      const combinedCap = isLargestShareholderGroup ? Math.floor(close * combinedShares) : 0;

      const patch: Partial<StockTransferFormData> = {
        selfMarketCap: selfCap > 0 ? String(selfCap) : "",
        kiwoomLastFetchedAt: new Date().toISOString(),
      };
      if (isLargestShareholderGroup) {
        patch.combinedMarketCap = combinedCap > 0 ? String(combinedCap) : "";
      }
      onFill(patch);

      setInfo({
        close,
        date: data.date,
        priorTradingDate: data.priorTradingDate,
        selfCap,
        combinedCap,
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
          <p className="font-semibold">키움증권 시가총액 자동 산정 (§157①)</p>
          <p className="text-xs text-sky-700 mt-0.5">
            종목코드 + 직전 사업연도말 일자 + 보유 주식수 입력 후 클릭 시 시가총액이 자동 계산됩니다.
          </p>
        </div>
        <button
          type="button"
          disabled={!canFetch}
          onClick={handleClick}
          className="rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-sky-700 disabled:bg-sky-200 disabled:text-sky-500 disabled:cursor-not-allowed"
          title={disabledReason ?? "시총 자동 계산"}
        >
          {loading ? "🔄 조회 중..." : "🔍 시총 자동 계산"}
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
              ✓ 직전 사업연도말 종가:{" "}
              <strong>{info.close.toLocaleString()}</strong>원{" "}
              <span className="text-emerald-700">
                ({info.priorTradingDate && info.priorTradingDate !== info.date
                  ? `${info.date} 비거래일 → 직전 거래일 ${info.priorTradingDate}`
                  : info.date})
              </span>
            </p>
          </div>
          <div className="rounded border border-emerald-300 bg-white p-2 space-y-1.5">
            <p className="text-micro text-emerald-700 border-b border-emerald-100 pb-1">
              시총 산식 검증 (시행령 §157①)
            </p>
            <div className="space-y-0.5 font-mono text-caption">
              <div className="flex justify-between">
                <span>종가 × 본인 단독 보유 주식수</span>
                <span className="tabular-nums">
                  {info.close.toLocaleString()} × {selfShares.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-t border-emerald-100 pt-0.5">
                <span className="font-semibold">= 본인 단독 시가총액</span>
                <strong className="tabular-nums">{info.selfCap.toLocaleString()}원</strong>
              </div>
              {info.selfCap >= 5_000_000_000 ? (
                <p className="text-rose-700 font-semibold text-right">
                  → 50억 이상 → 대주주 임계 충족
                </p>
              ) : (
                <p className="text-emerald-700 text-right">→ 50억 미만 → 임계 미달</p>
              )}
            </div>
            {isLargestShareholderGroup && (
              <div className="space-y-0.5 font-mono text-caption pt-1 border-t border-emerald-100">
                <div className="flex justify-between">
                  <span>종가 × 합산 보유 주식수</span>
                  <span className="tabular-nums">
                    {info.close.toLocaleString()} × {combinedShares.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between border-t border-emerald-100 pt-0.5">
                  <span className="font-semibold">= 합산 시가총액</span>
                  <strong className="tabular-nums">{info.combinedCap.toLocaleString()}원</strong>
                </div>
                {info.combinedCap >= 5_000_000_000 ? (
                  <p className="text-rose-700 font-semibold text-right">
                    → 50억 이상 → 대주주 임계 충족
                  </p>
                ) : (
                  <p className="text-emerald-700 text-right">→ 50억 미만 → 임계 미달</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
