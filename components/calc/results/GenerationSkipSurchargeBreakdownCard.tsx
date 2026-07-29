"use client";

/**
 * GenerationSkipSurchargeBreakdownCard — §57 세대생략 할증과세 산출근거 카드
 *
 * 표시 위치: GiftTaxResultView 의 TaxCreditBreakdownCard 바로 위
 * 활성 조건: result.generationSkipSurchargeDetail !== null (그룹 B 조부모→손자녀)
 *
 * 6단계 분해:
 *   ⑧ 할증과세 = 산출세액 × (부모 제외 직계존속 재산가액 / 총증여재산가액) × 할증율
 *   ⑨ 누적 기할증과세액 = Σ⑫_prior
 *   ⑩ 할증과세공제 한도액 = 산출세액 × (가산 증여재산 과세표준 / 합산 과세표준) × 할증율
 *   ⑪ 차감 기할증과세액 = Min(⑨, ⑩)
 *   ⑫ 추가 할증세액 = Max(0, ⑧ − ⑪)
 *   ⑬ 산출세액합계 = ⑦ + ⑫
 */

import { useState } from "react";
import type { GenerationSkipSurchargeDetail } from "@/lib/tax-engine/types/inheritance-gift.types";
import { ExpandToggleButton } from "./shared/ExpandToggleButton";
import { Frac } from "./shared/FormulaParts";

function Amt({ val }: { val: number }) {
  return <span className="font-mono">{val.toLocaleString()}</span>;
}

export interface GenerationSkipSurchargeBreakdownCardProps {
  detail: GenerationSkipSurchargeDetail;
  /** ⑦ 산출세액 (할증 전) */
  computedTax: number;
  /** 할증 비율 분자 — 부모 제외 직계존속 재산가액 (참고 표시용, undefined 시 비표시) */
  nonParentLinealAmount?: number;
  /** 할증 비율 분모 — 총증여재산가액 (참고 표시용) */
  totalGiftAmount?: number;
  /** ⑩ 한도 산식 분자 — 가산 증여재산 과세표준 (priorAddedTaxBase) */
  priorAddedTaxBase?: number;
  /** ⑩ 한도 산식 분모 — 합산 후 과세표준 (aggregatedTaxBase) */
  aggregatedTaxBase?: number;
}

export function GenerationSkipSurchargeBreakdownCard({
  detail,
  computedTax,
  nonParentLinealAmount,
  totalGiftAmount,
  priorAddedTaxBase,
  aggregatedTaxBase,
}: GenerationSkipSurchargeBreakdownCardProps) {
  const [expanded, setExpanded] = useState(true);

  const ratePct = (detail.surchargeRate * 100).toFixed(0);
  const ratioPct = (detail.nonParentLinealRatio * 100).toFixed(0);
  const isHigherRate = detail.surchargeRate === 0.4;

  return (
    <div className="border border-rose-200 dark:border-rose-800 rounded-xl overflow-hidden bg-rose-50/40 dark:bg-rose-900/10">
      {/* 헤더 */}
      <div className="bg-rose-50 dark:bg-rose-900/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">
            세대생략 할증과세 산출근거
          </h4>
          <span className="text-xs text-rose-500 dark:text-rose-400">
            상증법 §57·§57②
          </span>
          {isHigherRate && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-micro font-semibold bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-100">
              미성년 + 20억 초과 → 40%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-base font-bold text-rose-700 dark:text-rose-300 font-mono">
            + {detail.additionalSurcharge.toLocaleString()}
          </p>
          <ExpandToggleButton
            open={expanded}
            onClick={() => setExpanded((p) => !p)}
            tone="rose"
          />
        </div>
      </div>

      {/* 6단계 분해 — 접힘 시에도 인쇄 시 펼침 */}
      <div className={`px-4 py-3 space-y-2 ${expanded ? "" : "hidden print:block"}`}>
          {/* ⑧ */}
          <Row
            number="⑧"
            label="할증과세"
            amount={detail.surchargeBase}
            formula={
              <>
                <div>
                  ⑧ 할증과세 = 산출세액 ×{" "}
                  <Frac top="부모 제외 직계존속 재산가액" bottom="총증여재산가액" /> × {ratePct}%
                </div>
                {nonParentLinealAmount !== undefined && totalGiftAmount !== undefined ? (
                  <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
                    = <Amt val={computedTax} /> ×{" "}
                    <Frac top={<Amt val={nonParentLinealAmount} />} bottom={<Amt val={totalGiftAmount} />} /> ×{" "}
                    {ratePct}% ={" "}
                    <span className="font-semibold">
                      <Amt val={detail.surchargeBase} />
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
                    = <Amt val={computedTax} /> × {ratioPct}% × {ratePct}% ={" "}
                    <span className="font-semibold">
                      <Amt val={detail.surchargeBase} />
                    </span>
                  </div>
                )}
              </>
            }
          />

          {/* ⑨ */}
          <Row
            number="⑨"
            label="기할증과세액 (누적)"
            amount={detail.priorAdditionalCumulative}
            muted={detail.priorAdditionalCumulative === 0}
            formula={
              <div>
                ⑨ = 사전증여 회차들의 추가 할증세액 ⑫ 누계 (Σ⑫_prior)
              </div>
            }
          />

          {/* ⑩ */}
          <Row
            number="⑩"
            label="할증과세공제 한도액"
            amount={detail.surchargeCreditLimit}
            muted={detail.surchargeCreditLimit === 0}
            formula={
              <>
                <div>
                  ⑩ 한도액 = 산출세액 ×{" "}
                  <Frac top="가산 증여재산 과세표준" bottom="합산 후 과세표준" /> × {ratePct}%
                </div>
                {priorAddedTaxBase !== undefined && aggregatedTaxBase !== undefined && aggregatedTaxBase > 0 ? (
                  <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
                    = <Amt val={computedTax} /> ×{" "}
                    <Frac top={<Amt val={priorAddedTaxBase} />} bottom={<Amt val={aggregatedTaxBase} />} /> ×{" "}
                    {ratePct}% ={" "}
                    <span className="font-semibold">
                      <Amt val={detail.surchargeCreditLimit} />
                    </span>
                  </div>
                ) : null}
              </>
            }
          />

          {/* ⑪ */}
          <Row
            number="⑪"
            label="차감 기할증과세액"
            amount={detail.priorSurchargeCredit}
            muted={detail.priorSurchargeCredit === 0}
            formula={
              <div className="flex flex-wrap items-baseline gap-x-1">
                ⑪ = Min(⑨, ⑩) = Min(<Amt val={detail.priorAdditionalCumulative} />,{" "}
                <Amt val={detail.surchargeCreditLimit} />) ={" "}
                <span className="font-semibold">
                  <Amt val={detail.priorSurchargeCredit} />
                </span>
              </div>
            }
          />

          {/* ⑫ — 강조 */}
          <Row
            number="⑫"
            label="추가 할증과세액"
            amount={detail.additionalSurcharge}
            highlight
            formula={
              <div className="flex flex-wrap items-baseline gap-x-1">
                ⑫ = Max(0, ⑧ − ⑪) = Max(0, <Amt val={detail.surchargeBase} /> −{" "}
                <Amt val={detail.priorSurchargeCredit} />) ={" "}
                <span className="font-semibold">
                  <Amt val={detail.additionalSurcharge} />
                </span>
              </div>
            }
          />

          {/* ⑬ */}
          <Row
            number="⑬"
            label="산출세액합계"
            amount={detail.totalComputedTaxWithSurcharge}
            formula={
              <div className="flex flex-wrap items-baseline gap-x-1">
                ⑬ = 산출세액 + ⑫ = <Amt val={computedTax} /> +{" "}
                <Amt val={detail.additionalSurcharge} /> ={" "}
                <span className="font-semibold">
                  <Amt val={detail.totalComputedTaxWithSurcharge} />
                </span>
              </div>
            }
          />

          {/* PDF 박스 산식 (참고) */}
          <div className="mt-3 pt-3 border-t border-rose-200/60 dark:border-rose-800/40 text-caption text-rose-700/80 dark:text-rose-300/80">
            <div className="font-semibold mb-1">참고 — 상증법 §57 산식</div>
            <div>
              할증과세액 = 증여세 산출세액 ×{" "}
              <Frac top="수증자 부모 제외 직계존속으로부터 증여받은 재산가액" bottom="총증여재산가액" /> × {ratePct}% −
              기할증과세액
            </div>
          </div>
      </div>
    </div>
  );
}

// ============================================================
// 내부 Row
// ============================================================

interface RowProps {
  number: string;
  label: string;
  amount: number;
  highlight?: boolean;
  muted?: boolean;
  formula?: React.ReactNode;
}

function Row({ number, label, amount, highlight, muted, formula }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="space-y-1">
      <div
        className={`flex items-center justify-between py-2 px-3 rounded-md ${
          highlight
            ? "bg-rose-100 dark:bg-rose-900/30 font-semibold"
            : muted
              ? "bg-gray-50/60 dark:bg-gray-900/30"
              : "bg-white/70 dark:bg-gray-900/40"
        }`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className={`text-xs font-bold ${
              highlight
                ? "text-rose-800 dark:text-rose-200"
                : "text-rose-600/80 dark:text-rose-400/80"
            }`}
          >
            {number}
          </span>
          <span
            className={`text-sm ${
              highlight
                ? "text-rose-900 dark:text-rose-100"
                : muted
                  ? "text-gray-500 dark:text-gray-400"
                  : "text-gray-700 dark:text-gray-300"
            }`}
          >
            {label}
          </span>
          {formula && (
            <button
              type="button"
              onClick={() => setExpanded((p) => !p)}
              className="text-micro text-gray-500 hover:text-rose-700 dark:hover:text-rose-300 transition-colors print:hidden"
              aria-expanded={expanded}
              aria-label={`${label} 산출근거 ${expanded ? "닫기" : "펼치기"}`}
            >
              {expanded ? "▲ 산출근거" : "▼ 산출근거"}
            </button>
          )}
        </div>
        <span
          className={`font-mono text-sm ${
            highlight
              ? "text-rose-700 dark:text-rose-300"
              : muted
                ? "text-gray-500 dark:text-gray-400"
                : "text-gray-800 dark:text-gray-200"
          }`}
        >
          {amount.toLocaleString()}
        </span>
      </div>
      {expanded && formula && (
        <div className="ml-3 px-3 py-2 text-caption text-gray-600 dark:text-gray-400 bg-rose-50/60 dark:bg-rose-900/20 rounded-md space-y-1 print:block">
          {formula}
        </div>
      )}
    </div>
  );
}
