"use client";

/**
 * Page4ValuationDeltaTable — 별지 부표3 제4쪽 5.평가차액
 *
 * PDF: ~/Downloads/비상장주식 평가 사례.pdf page=8 우측 (사례 6)
 * Design: docs/02-design/features/inheritance-unlisted-stock-besshi-form-full-replica.engine.design.md §3
 *
 * 평가차액 행 단위 입력(evaluationDeltaRows)이 없으면 섹션 비표시.
 */

import type { UnlistedNetAssetCalculation } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";
import { fmt, renderDelta, SectionTitle } from "./BesshiSharedAtoms";

export interface Page4ValuationDeltaTableProps {
  raw: UnlistedNetAssetCalculation;
}

export function Page4ValuationDeltaTable({ raw }: Page4ValuationDeltaTableProps) {
  const rows = raw.evaluationDeltaRows ?? [];
  if (rows.length === 0) return null;

  const assetRows = rows.filter((r) => r.category === "asset");
  const liabilityRows = rows.filter((r) => r.category === "liability");
  const assetTotal = assetRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0);
  const liabilityTotal = liabilityRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0);

  return (
    <section aria-label="제4쪽 평가차액">
      <SectionTitle>5. 평가차액 (별지 제4쪽 — 자산·부채 계정과목별)</SectionTitle>
      <table className="w-full border-collapse border border-black mb-3 text-[10px]">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-black p-1 text-left">구분</th>
            <th className="border border-black p-1 text-left">계정과목</th>
            <th className="border border-black p-1 text-right">상증법 평가액</th>
            <th className="border border-black p-1 text-right">재무상태표 금액</th>
            <th className="border border-black p-1 text-right">차액</th>
          </tr>
        </thead>
        <tbody>
          {assetRows.map((row, i) => {
            const delta = row.evaluationAmount - row.bookAmount;
            return (
              <tr key={row.rowId}>
                {i === 0 && (
                  <td rowSpan={assetRows.length} className="border border-black p-1 align-top font-semibold">
                    자산
                  </td>
                )}
                <td className="border border-black p-1">{row.accountName}</td>
                <td className="border border-black p-1 text-right font-mono">{fmt(row.evaluationAmount)}</td>
                <td className="border border-black p-1 text-right font-mono">{fmt(row.bookAmount)}</td>
                <td className="border border-black p-1 text-right font-mono">{renderDelta(delta)}</td>
              </tr>
            );
          })}
          {assetRows.length > 0 && (
            <tr className="bg-gray-50 font-semibold" data-besshi-cell="p4-①" data-testid="p4-①">
              <td colSpan={4} className="border border-black p-1">
                ① 자산 합계
              </td>
              <td className="border border-black p-1 text-right font-mono">{fmt(assetTotal)}</td>
            </tr>
          )}
          {liabilityRows.map((row, i) => {
            const delta = row.evaluationAmount - row.bookAmount;
            return (
              <tr key={row.rowId}>
                {i === 0 && (
                  <td rowSpan={liabilityRows.length} className="border border-black p-1 align-top font-semibold">
                    부채
                  </td>
                )}
                <td className="border border-black p-1">{row.accountName}</td>
                <td className="border border-black p-1 text-right font-mono">{fmt(row.evaluationAmount)}</td>
                <td className="border border-black p-1 text-right font-mono">{fmt(row.bookAmount)}</td>
                <td className="border border-black p-1 text-right font-mono">{renderDelta(delta)}</td>
              </tr>
            );
          })}
          {liabilityRows.length > 0 && (
            <tr className="bg-gray-50 font-semibold" data-besshi-cell="p4-②" data-testid="p4-②">
              <td colSpan={4} className="border border-black p-1">
                ② 부채 합계
              </td>
              <td className="border border-black p-1 text-right font-mono">{fmt(liabilityTotal)}</td>
            </tr>
          )}
          <tr className="bg-emerald-50 font-bold border-t-2 border-black print:bg-emerald-50">
            <td colSpan={4} className="border border-black p-1">
              가. 평가차액 (① − ②) → 제2쪽 4.가.② 기재
            </td>
            <td className="border border-black p-1 text-right font-mono">{renderDelta(assetTotal - liabilityTotal)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
