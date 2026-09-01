"use client";

/**
 * KiwoomValuationResultCard — 키움 자동조회 결과 표시 카드 (emerald).
 *
 * `useKiwoomValuationFetch` hook 결과의 `info`·`error`·`showDetail` 를 받아
 * 평가구간·평균 산식·anchor shift 안내·일자별 종가 토글을 렌더.
 *
 * Plan: docs/00-pm/listed-stock-security-info-layout-reorder.plan.md §3 Step B-3
 *
 * 분리 이전: `KiwoomValuationAutoFetchButton.tsx:193-273` 의 결과 표시 영역.
 */

import React from "react";
import type { KiwoomValuationInfo } from "./useKiwoomValuationFetch";
import {
  expandToggleClass,
  expandToggleLabel,
} from "@/components/calc/results/shared/ExpandToggleButton";

interface Props {
  info: KiwoomValuationInfo | null;
  error: string | null;
  valuationDate: string;
  showDetail: boolean;
  onToggleDetail: () => void;
  /** error 메시지 위치 — true 시 본 카드에서 노출, false 시 부모가 책임 (inline variant). */
  showError?: boolean;
}

export function KiwoomValuationResultCard({
  info,
  error,
  valuationDate,
  showDetail,
  onToggleDetail,
  showError = true,
}: Props) {
  if (error && showError) {
    return (
      <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded px-2 py-1">
        ❌ {error}
      </p>
    );
  }
  if (!info || error) return null;

  return (
    <div
      className="rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-900 space-y-2"
      data-testid="ls-valuation-result-card"
    >
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
          </strong>
          원 (원미만 절사)
        </p>
        <p className="text-emerald-700">→ 아래 &quot;전후 2개월 종가 단순평균&quot;에 자동 입력됩니다</p>
      </div>

      {/* 검증용 일자별 종가 상세 토글 */}
      <button
        type="button"
        onClick={onToggleDetail}
        aria-expanded={showDetail}
        className={expandToggleClass("emerald")}
      >
        {expandToggleLabel(showDetail)} · 일자별 종가 (검증용)
      </button>

      {showDetail && (
        <div className="rounded border border-emerald-300 bg-white p-2 space-y-1 max-h-96 overflow-y-auto">
          <p className="text-micro text-emerald-700 sticky top-0 bg-white pb-1 border-b border-emerald-100">
            평가기준일 전후 2개월 일자별 종가 — 거래일만 분모 산입 (상증령 §52의2④ 공휴일·토요일 제외)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5 text-caption font-mono">
            {info.slotDates.map((iso, i) => {
              const close = info.closingPrices[i];
              const label = info.weekendLabels[i];
              const isTrading = typeof close === "number";
              return (
                <div
                  key={iso}
                  className={
                    "flex justify-between gap-2 px-1 " +
                    (isTrading ? "text-emerald-900" : "text-gray-400")
                  }
                >
                  <span>{iso}</span>
                  <span>
                    {isTrading ? `${close.toLocaleString()}원` : label || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
