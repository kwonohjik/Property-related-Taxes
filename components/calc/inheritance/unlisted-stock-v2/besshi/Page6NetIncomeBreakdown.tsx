"use client";

/**
 * Page6NetIncomeBreakdown — 별지 부표3 제6쪽 7.순손익액 (3년치)
 *
 * PDF: ~/Downloads/비상장주식 평가 사례.pdf page=7 우측 (사례 6)
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md §3
 */

import type { UnlistedStockValuationResult } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, BreakdownRow, SectionTitle } from "./BesshiSharedAtoms";

export interface Page6NetIncomeBreakdownProps {
  result: UnlistedStockValuationResult;
}

export function Page6NetIncomeBreakdown({ result }: Page6NetIncomeBreakdownProps) {
  return (
    <section aria-label="제6쪽 순손익액 명세">
      <SectionTitle>7. 순손익액 (3년치 — 별지 제6쪽)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1">구분</th>
            {result.fiscalYearBreakdowns.map((fy, i) => (
              <th key={i} className="border border-black p-1">
                {fy.label}
                <br />
                가중치 ×{i === 0 ? 3 : i === 1 ? 2 : 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <BreakdownRow label="① 각 사업연도 소득금액" values={result.fiscalYearBreakdowns.map((fy) => fy.taxableIncome)} />
          <BreakdownRow label="가산 합계 (②~⑦)" values={result.fiscalYearBreakdowns.map((fy) => fy.addTotal)} />
          <BreakdownRow label="차감 합계 (⑧~㉒)" values={result.fiscalYearBreakdowns.map((fy) => fy.subTotal)} />
          <BreakdownRow label="다. 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.adjustedNetIncome)} emphasized />
          <BreakdownRow label="라. 유상증자·감자 반영액 (§56⑤)" values={result.fiscalYearBreakdowns.map((fy) => fy.capitalIncreaseAdjustment)} />
          <BreakdownRow label="마. 최종 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.finalNetIncome)} emphasized />
          <BreakdownRow label="바. 환산주식수" values={result.fiscalYearBreakdowns.map((fy) => fy.convertedShares)} unit="주" />
          <BreakdownRow label="사. 1주당 순손익액" values={result.fiscalYearBreakdowns.map((fy) => fy.perShareNetIncome)} />
        </tbody>
      </table>
      <p className="mb-2">
        <strong>아. 1주당 가중평균 순손익액</strong> = {fmt(result.weightedNetIncomePerShare)}원
      </p>
      <p className="mb-2">
        <strong>자. 환원율</strong> = {(result.capitalizationRate * 100).toFixed(0)}% (상증규 §17)
      </p>
      <p className="mb-3" data-besshi-cell="p6-차" data-testid="p6-차">
        <strong>차. 1주당 가액</strong> = 아 ÷ 자 = {fmt(result.netIncomePerShare)}원 (제1쪽 ⑤)
      </p>
    </section>
  );
}
