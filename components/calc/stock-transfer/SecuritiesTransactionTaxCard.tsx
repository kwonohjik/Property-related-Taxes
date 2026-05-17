"use client";

/**
 * 증권거래세 정보성 카드
 *
 * 양도소득세와 별도로 납부해야 하는 증권거래세를 정보성으로 표시.
 * 양도가액·시장 유형을 기반으로 자동 산정.
 *
 * 법령: 증권거래세법 §3·§8 (2025년 기준 세율)
 *
 * PR-3: 결과 화면 + Step 3 필요경비 블록 내 참고 표시
 */

import React from "react";
import type { StockTransferInput } from "@/lib/tax-engine/stock-transfer/types/stock-transfer.types";
import {
  calcSecuritiesTransactionTax,
} from "@/lib/tax-engine/stock-transfer/securities-transaction-tax";

// ============================================================
// Props
// ============================================================

interface SecuritiesTransactionTaxCardProps {
  /** 계산에 필요한 입력 (marketType·isKOTCTrading·transferPrice) */
  marketType: StockTransferInput["marketType"];
  isKOTCTrading: boolean;
  transferPrice: number;
  /** 카드 표시 위치 (결과 / 입력 단계 inline) */
  variant?: "result" | "inline";
}

// ============================================================
// 포맷
// ============================================================

function fmt(v: number): string {
  return v.toLocaleString("ko-KR");
}

// ============================================================
// 컴포넌트
// ============================================================

export function SecuritiesTransactionTaxCard({
  marketType,
  isKOTCTrading,
  transferPrice,
  variant = "result",
}: SecuritiesTransactionTaxCardProps) {
  // 더미 input (calcSecuritiesTransactionTax에 필요한 최소 필드)
  const pseudoInput = {
    marketType,
    isKOTCTrading,
  } as StockTransferInput;

  const stx = calcSecuritiesTransactionTax(pseudoInput, transferPrice);

  // 기타자산 또는 해당 없음은 카드 미표시
  if (stx.appliedRate === 0) return null;

  if (variant === "inline") {
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-sky-700">증권거래세 참고 (정보용)</p>
        <p className="text-slate-600">
          양도가액 {fmt(transferPrice)}원 × {(stx.appliedRate * 100).toFixed(2)}%
          = <span className="font-medium text-slate-800">{fmt(stx.securitiesTransactionTax)}원</span>
          {stx.agriculturalTax > 0 && (
            <span className="text-slate-500">
              {" "}+ 농특세 {fmt(stx.agriculturalTax)}원
            </span>
          )}
        </p>
        {stx.agriculturalTax > 0 && (
          <p className="text-sky-600 font-medium">합계 {fmt(stx.totalTax)}원</p>
        )}
        <p className="text-[10px] text-slate-400">{stx.rateReference}</p>
        <p className="text-[10px] text-rose-400">
          * 증권거래세는 양도소득세와 별도 납부 의무입니다.
        </p>
      </div>
    );
  }

  // result variant
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-900/20 dark:border-sky-700 overflow-hidden">
      <div className="px-4 py-3 border-b border-sky-200 dark:border-sky-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-sky-800 dark:text-sky-200">
            증권거래세 (정보용)
          </h3>
          <span className="text-[10px] bg-sky-100 text-sky-600 px-2 py-0.5 rounded-full">
            양도소득세와 별도 납부
          </span>
        </div>
        <p className="text-xs text-sky-600 mt-0.5">
          {stx.rateReference}
        </p>
      </div>
      <div className="px-4 py-3 space-y-2 text-sm">
        <div className="flex justify-between items-center">
          <span className="text-slate-600">
            증권거래세 ({(stx.appliedRate * 100).toFixed(2)}%)
          </span>
          <span className="font-medium tabular-nums">{fmt(stx.securitiesTransactionTax)}</span>
        </div>
        {stx.agriculturalTax > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-slate-600">농어촌특별세 (0.15%)</span>
            <span className="font-medium tabular-nums">{fmt(stx.agriculturalTax)}</span>
          </div>
        )}
        <div className="flex justify-between items-center pt-1 border-t border-sky-200">
          <span className="font-semibold text-sky-800">합계</span>
          <span className="font-bold text-sky-800 tabular-nums">{fmt(stx.totalTax)}</span>
        </div>
      </div>
      <div className="px-4 pb-3 text-[11px] text-slate-400 space-y-0.5">
        <p>* 증권거래세는 원칙적으로 증권회사 등이 원천징수합니다.</p>
        <p>* 장외거래·비상장주식 직접양도의 경우 양도자가 자진신고·납부합니다.</p>
        <p>* 본 산출액은 참고용입니다. 실제 납부세액은 거래 방식에 따라 다릅니다.</p>
      </div>
    </div>
  );
}
