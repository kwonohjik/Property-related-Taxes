"use client";

/**
 * InheritanceGenerationSkipDetailCard — §27 세대생략 할증과세 수유자별 산식 카드 (상속세 전용)
 *
 * 활성 조건: InheritanceTaxResult.generationSkipDetail !== null
 * 증여세 GenerationSkipSurchargeBreakdownCard(§57)와 도메인이 다르므로 직접 재사용 금지 (R3).
 *
 * 표시 형식 (행별):
 *   이름 유증분에 대한 할증 = 산출세액 × (분자 / 분모) × rate% = surcharge
 */

import { useState } from "react";
import type { InheritanceGenerationSkipDetail } from "@/lib/tax-engine/types/inheritance-gift.types";

// 관계 라벨 fallback — 내부 id 노출 금지 (feedback_no_internal_id_in_result)
const LEGATEE_LABEL = "수유자";

function Amt({ val }: { val: number }) {
  return <span className="font-mono">{val.toLocaleString()}</span>;
}

interface Props {
  detail: InheritanceGenerationSkipDetail;
}

export function InheritanceGenerationSkipDetailCard({ detail }: Props) {
  const [expanded, setExpanded] = useState(true);

  const hasMultipleRows = detail.rows.length > 1;

  return (
    <div
      className="border border-rose-200 dark:border-rose-800 rounded-xl overflow-hidden bg-rose-50/40 dark:bg-rose-900/10"
      data-testid="inheritance-generation-skip-detail-card"
    >
      {/* 헤더 */}
      <div className="bg-rose-50 dark:bg-rose-900/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <h4 className="text-sm font-semibold text-rose-800 dark:text-rose-200">
            세대생략 할증과세 산출근거 (§27)
          </h4>
          <span className="text-xs text-rose-500 dark:text-rose-400">
            상증법 §27①②
          </span>
          {detail.rows.some((r) => r.rate === 0.4) && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-100">
              미성년 + 20억 초과 → 40%
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-base font-bold text-rose-700 dark:text-rose-300 font-mono">
            + <Amt val={detail.total} />
          </p>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="text-xs text-rose-600 dark:text-rose-300 hover:text-rose-800 transition-colors print:hidden"
            aria-expanded={expanded}
            aria-label={`산출근거 ${expanded ? "닫기" : "펼치기"}`}
          >
            {expanded ? "▼ 접기" : "▶ 펼치기"}
          </button>
        </div>
      </div>

      {/* 수유자별 행 */}
      <div className={`px-4 py-3 space-y-3 ${expanded ? "" : "hidden print:block"}`}>

        {/* 공통 산식 설명 */}
        <div className="text-[11px] text-rose-700/80 dark:text-rose-300/80 bg-rose-100/60 dark:bg-rose-900/20 rounded px-3 py-2">
          <div className="font-semibold mb-0.5">§27 산식</div>
          <div>
            할증 = 산출세액 × (유증·상속분 + §13 내 사전증여) ÷ 과세가액 × 할증율(30% / 미성년+20억초과 40%)
          </div>
        </div>

        {detail.rows.map((row, i) => {
          const name = row.heirName?.trim() || LEGATEE_LABEL;
          const ratePct = (row.rate * 100).toFixed(0);
          const isHigher = row.rate === 0.4;
          return (
            <HeirRow
              key={row.heirId}
              index={hasMultipleRows ? i + 1 : undefined}
              name={name}
              numerator={row.numerator}
              denominator={detail.denominator}
              computedTax={detail.computedTax}
              ratePct={ratePct}
              isHigher={isHigher}
              isMinor={row.isMinor}
              surcharge={row.surcharge}
            />
          );
        })}

        {/* 합계 (복수 수유자) */}
        {hasMultipleRows && (
          <div className="flex justify-between items-center py-2 px-3 rounded-md bg-rose-100 dark:bg-rose-900/30 font-semibold border-t border-rose-200 dark:border-rose-700">
            <span className="text-sm text-rose-900 dark:text-rose-100">합계 세대생략 할증세액</span>
            <span className="font-mono text-sm text-rose-700 dark:text-rose-300">
              <Amt val={detail.total} />
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// 수유자 1명 행
// ============================================================

interface HeirRowProps {
  index?: number;
  name: string;
  numerator: number;
  denominator: number;
  computedTax: number;
  ratePct: string;
  isHigher: boolean;
  isMinor: boolean;
  surcharge: number;
}

function HeirRow({
  index,
  name,
  numerator,
  denominator,
  computedTax,
  ratePct,
  isHigher,
  isMinor,
  surcharge,
}: HeirRowProps) {
  const [showFormula, setShowFormula] = useState(false);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between py-2 px-3 rounded-md bg-white/70 dark:bg-gray-900/40">
        <div className="flex items-center gap-2 flex-wrap">
          {index !== undefined && (
            <span className="text-[10px] font-bold text-rose-600/80 dark:text-rose-400/80">
              {index}.
            </span>
          )}
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {name} 유증분 할증
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              isHigher
                ? "bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-100"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
            }`}
          >
            {ratePct}%{isMinor ? " (미성년)" : ""}
          </span>
          <button
            type="button"
            onClick={() => setShowFormula((p) => !p)}
            className="text-[10px] text-gray-500 hover:text-rose-700 dark:hover:text-rose-300 transition-colors print:hidden"
            aria-expanded={showFormula}
            aria-label={`${name} 산출근거 ${showFormula ? "닫기" : "펼치기"}`}
          >
            {showFormula ? "▼ 산출근거" : "▶ 산출근거"}
          </button>
        </div>
        <span className="font-mono text-sm text-gray-800 dark:text-gray-200">
          <Amt val={surcharge} />
        </span>
      </div>

      {showFormula && (
        <div className="ml-3 px-3 py-2 text-[11px] text-gray-600 dark:text-gray-400 bg-rose-50/60 dark:bg-rose-900/20 rounded-md space-y-1 print:block">
          <div>
            할증 = 산출세액 × (유증·상속분 ÷ 과세가액) × {ratePct}%
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1 text-gray-500 dark:text-gray-400">
            = <Amt val={computedTax} /> × (<Amt val={numerator} /> ÷{" "}
            <Amt val={denominator} />) × {ratePct}% ={" "}
            <span className="font-semibold text-rose-700 dark:text-rose-300">
              <Amt val={surcharge} />
            </span>
          </div>
          <div className="text-[10px] text-gray-400 dark:text-gray-500">
            분자: 유증·상속분 + §13 내 사전증여 합계 / 분모: 상속세 과세가액(조정)
          </div>
        </div>
      )}
    </div>
  );
}
