"use client";

/**
 * 증권거래세 정보성 카드
 *
 * 양도소득세와 별도로 납부해야 하는 증권거래세를 정보성으로 표시.
 * 양 variant 모두 stx prop 수신 — 자체 엔진 호출 없음.
 * 표시 게이트는 부모에서 `stx.totalTax > 0 || stx.warning` 판정 후 렌더.
 *
 * 법령: 증권거래세법 시행령 §5 (현행 = 영 제36001호, 2026.1.1 시행) + 농특세법 §5①5호
 *       연도별 세율·인용은 엔진 echo(rateReference) 파생 — 카드는 표시 전용.
 *
 * variant:
 *   "result"  — 결과 화면 서버 echo 표시 (sky-50 full 카드, 산식 행 포함)
 *   "inline"  — Step3 inline 미리보기 (소형 카드, 실가 경비 안내 선택)
 *
 * Phase 2: 코스피 2025 영세율 구간(appliedRateNum=0·농특세만) 분기 — 양 variant 공통.
 */

import React from "react";
import type {
  SecuritiesTransactionTaxResult,
} from "@/lib/tax-engine/stock-transfer/securities-transaction-tax";

// ============================================================
// Props
// ============================================================

interface SecuritiesTransactionTaxCardResultProps {
  /** result variant: 서버 echo 수신 (결과 화면 전용) */
  variant: "result";
  /** 서버 echo된 결과 객체 */
  stx: SecuritiesTransactionTaxResult;
  /** result variant — 산식 행 양도가액 표시용 (result.transferPrice) */
  transferPrice?: number;
}

interface SecuritiesTransactionTaxCardInlineProps {
  /** inline variant: Step3 필요경비 섹션 하단 미리보기 */
  variant: "inline";
  /** 클라이언트에서 직접 산출된 결과 객체 */
  stx: SecuritiesTransactionTaxResult;
  /** 양도가액 (원) — 산식 행 표시용 */
  transferPrice: number;
  /**
   * 실가 경비 모드일 때만 "필요경비에 포함하여 직접 입력" 안내 표시.
   * expenseLocked(개산공제) === false 시 true 전달.
   */
  showExpenseInclusionHint?: boolean;
}

export type SecuritiesTransactionTaxCardProps =
  | SecuritiesTransactionTaxCardResultProps
  | SecuritiesTransactionTaxCardInlineProps;

// ============================================================
// 포맷
// ============================================================

function fmt(v: number): string {
  return v.toLocaleString("ko-KR");
}

/** UI 표시용 세율 문자열: (num/den*100).toFixed(2) + "%" */
function fmtRate(num: number, den: number): string {
  return (num / den * 100).toFixed(2) + "%";
}

// ============================================================
// 컴포넌트
// ============================================================

export function SecuritiesTransactionTaxCard(props: SecuritiesTransactionTaxCardProps) {
  const { stx } = props;

  // 표시 게이트는 부모에서 판정 후 렌더 — 카드 내부 게이트 제거
  // (기타자산 C-06 경고 표시 위해 totalTax===0 && warning 케이스도 렌더)

  // 코스피 2025 영세율 구간 (Phase 2) — 증권거래세 0 + 농특세만.
  // "× 0.00%" 산식 표기 대신 영세율 안내 행 (양 variant 공통).
  // 기타자산(num=0·농특세 0)은 totalTax=0이라 미충돌.
  const isZeroRate = stx.appliedRateNum === 0 && stx.agriculturalTax > 0;

  if (props.variant === "inline") {
    const { transferPrice, showExpenseInclusionHint } = props;
    return (
      <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-xs space-y-1">
        <p className="font-semibold text-sky-700">증권거래세 참고 (정보용)</p>
        {stx.totalTax > 0 && isZeroRate && (
          <>
            <p className="text-slate-600">
              증권거래세 영세율 적용 — 농어촌특별세만 부과
            </p>
            <p className="text-slate-600">
              양도가액 {fmt(transferPrice)} × {fmtRate(stx.appliedAgriRateNum, stx.appliedRateDen)} (농특세)
              = <span className="font-medium text-slate-800">{fmt(stx.agriculturalTax)}</span>
            </p>
            <p className="text-sky-600 font-medium">합계 {fmt(stx.totalTax)}</p>
          </>
        )}
        {stx.totalTax > 0 && !isZeroRate && (
          <>
            <p className="text-slate-600">
              양도가액 {fmt(transferPrice)} × {fmtRate(stx.appliedRateNum, stx.appliedRateDen)}
              = <span className="font-medium text-slate-800">{fmt(stx.securitiesTransactionTax)}</span>
              {stx.agriculturalTax > 0 && (
                <span className="text-slate-500">
                  {" "}+ 농특세 {fmt(stx.agriculturalTax)}
                </span>
              )}
            </p>
            {stx.agriculturalTax > 0 && (
              <p className="text-sky-600 font-medium">합계 {fmt(stx.totalTax)}</p>
            )}
          </>
        )}
        {stx.warning && (
          <p className="text-amber-600 text-[10px]">{stx.warning}</p>
        )}
        <p className="text-[10px] text-slate-400">{stx.rateReference}</p>
        {showExpenseInclusionHint ? (
          <p className="text-[10px] text-sky-600">
            ※ 이 금액을 필요경비에 포함하여 직접 입력하세요 (자동 합산 안 됨).
          </p>
        ) : (
          <p className="text-[10px] text-rose-400">
            증권거래세는 양도소득세와 별도 납부 의무입니다.
          </p>
        )}
      </div>
    );
  }

  // result variant — full 카드 (sky-50 톤, 산식 행, warning 슬롯, disclaimer 4행)
  const transferPrice = props.transferPrice;
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
        {/* 산식 행 — 양도가액 × 세율 (영세율 구간은 안내 행으로 대체) */}
        {stx.totalTax > 0 && !isZeroRate && transferPrice !== undefined && transferPrice > 0 && (
          <p className="text-xs text-slate-500">
            양도가액 {fmt(transferPrice)} × {fmtRate(stx.appliedRateNum, stx.appliedRateDen)}
          </p>
        )}
        {stx.totalTax > 0 && isZeroRate && (
          <div className="flex justify-between items-center">
            <span className="text-slate-600">증권거래세 — 영세율 적용</span>
            <span className="font-medium text-right font-mono tabular-nums whitespace-nowrap">0</span>
          </div>
        )}
        {stx.totalTax > 0 && (
          <>
            {!isZeroRate && (
              <div className="flex justify-between items-center">
                <span className="text-slate-600">
                  증권거래세 ({fmtRate(stx.appliedRateNum, stx.appliedRateDen)})
                </span>
                <span className="font-medium text-right font-mono tabular-nums whitespace-nowrap">
                  {fmt(stx.securitiesTransactionTax)}
                </span>
              </div>
            )}
            {stx.agriculturalTax > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-slate-600">
                  농어촌특별세 ({fmtRate(stx.appliedAgriRateNum, 10000)})
                </span>
                <span className="font-medium text-right font-mono tabular-nums whitespace-nowrap">
                  {fmt(stx.agriculturalTax)}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-sky-200">
              <span className="font-semibold text-sky-800">합계</span>
              <span className="font-bold text-sky-800 text-right font-mono tabular-nums whitespace-nowrap">
                {fmt(stx.totalTax)}
              </span>
            </div>
          </>
        )}
        {stx.warning && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
            {stx.warning}
          </div>
        )}
      </div>
      <div className="px-4 pb-3 text-[11px] text-slate-400 space-y-0.5">
        <p>증권거래세는 원칙적으로 증권회사 등이 원천징수합니다.</p>
        <p>장외거래·비상장주식 직접양도의 경우 양도자가 자진신고·납부합니다.</p>
        <p>본 산출액은 참고용입니다. 실제 납부세액은 거래 방식에 따라 다릅니다.</p>
        <p>특수관계인 저가양도 등은 시가 기준 과세될 수 있습니다(증권거래세법 §7).</p>
      </div>
    </div>
  );
}
