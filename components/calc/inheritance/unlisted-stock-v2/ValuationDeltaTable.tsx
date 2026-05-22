"use client";

/**
 * ValuationDeltaTable — 별지 부표3 4쪽 5.평가차액 (자산·부채 평가액 vs 재무상태표 금액)
 *
 * 법령: 상증령 §55 ① — "법인의 자산을 법 §60 내지 §66의 규정에 의하여 평가한 가액에서
 *                       부채를 차감한 가액"
 *
 * 본 컴포넌트는 별지 4쪽의 자산·부채 계정과목별 평가액 명세 입력 보조.
 * 결과는 NetAssetCalculation.assetValuationDelta 단일 값으로 흡수됨.
 *
 * Phase 5-C: 선택적 보조 입력 컴포넌트.
 * 본 PR에서는 표 표시 + 합계 자동 산정만 제공. 입력 행 동적 추가는 F-3 후속.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md
 */

import { useState } from "react";
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";

export interface ValuationDeltaRow {
  accountName: string;
  evaluatedValue: number;  // 상증법 §60·§66 평가액
  bookValue: number;       // 재무상태표상 금액
}

export interface ValuationDeltaTableProps {
  /** 자산총액 평가차액 — 자산 행 합계 (상증법 평가 − 장부) */
  assetDelta: number;
  /** 부채총액 평가차액 — 부채 행 합계 (상증법 평가 − 장부) */
  liabilityDelta: number;
  /** 합계 차액 (자산 − 부채) — NetAssetCalculation.assetValuationDelta로 흡수 */
  onTotalDeltaChange?: (totalDelta: number) => void;
}

export function ValuationDeltaTable({
  assetDelta,
  liabilityDelta,
}: ValuationDeltaTableProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-200 text-[10px] font-bold text-emerald-800 select-none">8</span>
          <p className="text-xs font-semibold text-emerald-700">평가차액 (별지 4쪽 — 보조)</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="text-[10px] text-emerald-600 hover:text-emerald-800 underline"
        >
          {showDetail ? "접기" : "상세 보기"}
        </button>
      </div>
      <p className="text-[11px] text-emerald-700/80">
        상증법 §60·§66 평가액과 재무상태표상 금액의 차액. NetAssetCalculation의 ②(자산 평가차액) 입력 산정 보조.
      </p>

      {showDetail && (
        <div className="space-y-2">
          <p className="text-[11px] text-emerald-700">
            ※ 본 PR에서는 자산·부채 행 합계만 표시. 계정과목별 동적 입력은 F-3 후속 PR.
          </p>
          <div className="grid grid-cols-3 gap-2 text-[11px]">
            <div className="font-semibold text-emerald-800">구분</div>
            <div className="font-semibold text-emerald-800 text-right">평가차액 (원)</div>
            <div></div>
            <div>자산 평가차액 합계</div>
            <div className="text-right font-mono">{assetDelta.toLocaleString()}</div>
            <div></div>
            <div>부채 평가차액 합계</div>
            <div className="text-right font-mono">{liabilityDelta.toLocaleString()}</div>
            <div></div>
            <div className="font-bold border-t border-emerald-300 pt-1">총 평가차액 (자산 − 부채)</div>
            <div className="text-right font-mono font-bold border-t border-emerald-300 pt-1">
              {(assetDelta - liabilityDelta).toLocaleString()}
            </div>
            <div className="border-t border-emerald-300 pt-1 text-[10px] text-emerald-700">
              → NetAssetCalculation.assetValuationDelta
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
