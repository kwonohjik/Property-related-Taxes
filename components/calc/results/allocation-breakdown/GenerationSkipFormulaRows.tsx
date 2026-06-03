"use client";

/**
 * GenerationSkipFormulaRows — ⑧ 세대생략 가산액 펼침 내부 §27 수유자별 할증 산식 (상속세 전용)
 *
 * 독립 카드(InheritanceGenerationSkipDetailCard) 폐지 → ComputedTaxDetailCard ⑧ 행 펼침에 통합.
 * DetailTable(divide-y) 컨텍스트 안에서 렌더되므로 행(Fragment)만 반환.
 * 증여세 GenerationSkipSurchargeBreakdownCard(§57)와 도메인이 다르므로 직접 재사용 금지.
 */

import { Fragment } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import type { InheritanceGenerationSkipDetail } from "@/lib/tax-engine/types/inheritance-gift.types";
import { DetailRow } from "../deduction-breakdown/shared";

// 관계 라벨 fallback — 내부 id 노출 금지 (feedback_no_internal_id_in_result)
const LEGATEE_LABEL = "수유자";

export function GenerationSkipFormulaRows({
  detail,
}: {
  detail: InheritanceGenerationSkipDetail;
}) {
  const multi = detail.rows.length > 1;

  return (
    <div data-testid="generation-skip-formula-rows">
      {/* §27 공통 산식 설명 — prorationActive 분기 */}
      <div className="px-3 py-2 text-[11px] text-rose-700/80 dark:text-rose-300/80 bg-rose-50/60 dark:bg-rose-950/20 border-b border-border">
        <span className="font-semibold">§27 산식 </span>
        {detail.prorationActive
          ? "할증 = 산출세액 × (유증·상속분 + §13 내 사전증여) ÷ 과세가액 × 할증율(30% / 미성년+20억초과 40%)"
          : "할증 = 산출세액 × 할증율(30% / 미성년+20억초과 40%) — 전부 할증 경로"}
      </div>

      <div className="divide-y divide-border">
        {detail.rows.map((row, i) => {
          const name = row.heirName?.trim() || LEGATEE_LABEL;
          const ratePct = (row.rate * 100).toFixed(0);
          const higher = row.rate === 0.4;
          const tag = higher
            ? `${ratePct}%, 미성년+20억 초과`
            : row.isMinor
              ? `${ratePct}%, 미성년`
              : `${ratePct}%`;
          const prefix = multi ? `${i + 1}. ` : "";
          return (
            <Fragment key={row.heirId}>
              <DetailRow
                label={`${prefix}${name} 유증분 할증 (${tag})`}
                value={formatKRW(row.surcharge)}
              />
              {detail.prorationActive ? (
                /* 안분 경로: numerator ÷ denominator 적용 */
                <DetailRow
                  label={`= 산출세액 ${formatKRW(detail.computedTax)} × (${formatKRW(row.numerator)} ÷ ${formatKRW(detail.denominator)}) × ${ratePct}%`}
                  value=""
                  indent
                  muted
                />
              ) : (
                /* 레거시 경로: 전액 할증(안분 미적용) — 분모 미표시로 역검증 불일치 방지 */
                <DetailRow
                  label={`= 산출세액 ${formatKRW(detail.computedTax)} × ${ratePct}% (전부 할증, 안분 미적용)`}
                  value=""
                  indent
                  muted
                />
              )}
            </Fragment>
          );
        })}

        {/* 복수 수유자 합계 */}
        {multi && (
          <DetailRow label="합계 세대생략 할증세액" value={formatKRW(detail.total)} />
        )}
      </div>
    </div>
  );
}
