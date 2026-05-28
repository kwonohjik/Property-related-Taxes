"use client";

/**
 * Page2DailyClosingTable — 상장주식 평가조서(을) 4그룹 일자별 종가 표.
 *
 * 좌측 5열(NO·이전1월 월일·종가·이전2월 월일·종가) × 31행
 * 우측 5열(NO·이후1월 월일·종가·이후2월 월일·종가) × 31행
 * 마지막 4행: 소계·일수·종가합계·종가평균
 *
 * Single source: result.besshiData.page2 ([[ui_engine_dual_truth_avoidance]])
 *
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §2-1
 */

import React from "react";
import { fmt } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/BesshiSharedAtoms";
import { LS_P2_HEADERS, stripTradingExclusionSuffix } from "./listed-besshi-constants";
import type {
  ListedStockDailyRow,
  ListedStockMonthGroups,
} from "@/lib/tax-engine/types/listed-stock-valuation.types";

interface Props {
  page2: ListedStockMonthGroups;
}

function ClosingCell({
  row,
  testId,
}: {
  row: ListedStockDailyRow | undefined;
  testId: string;
}) {
  if (!row) {
    return (
      <td
        className="border border-slate-400 px-1 py-0.5 text-right text-xs tabular-nums"
        data-testid={testId}
      />
    );
  }
  return (
    <td
      className="border border-slate-400 px-1 py-0.5 text-right text-xs tabular-nums"
      data-testid={testId}
    >
      {row.closing != null ? fmt(row.closing) : stripTradingExclusionSuffix(row.label)}
    </td>
  );
}

function DateCell({
  row,
  testId,
}: {
  row: ListedStockDailyRow | undefined;
  testId: string;
}) {
  return (
    <td
      className="border border-slate-400 px-1 py-0.5 text-center text-xs"
      data-testid={testId}
    >
      {row?.monthDay ?? ""}
    </td>
  );
}

function NoCell({ no }: { no: number }) {
  return (
    <td className="border border-slate-400 px-1 py-0.5 text-center text-xs bg-slate-50">
      {no}
    </td>
  );
}

export function Page2DailyClosingTable({ page2 }: Props) {
  const rowsCount = Math.max(
    page2.beforeM1.length,
    page2.beforeM2.length,
    page2.afterM1.length,
    page2.afterM2.length,
  );

  return (
    <section
      className="bg-white text-slate-900 p-4 border border-slate-300 rounded-md print:p-2"
      data-testid="ls-besshi-p2-section"
    >
      <h2 className="text-center text-lg font-bold mb-3">
        {LS_P2_HEADERS.formTitle}
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th
                colSpan={5}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.leftGroupHeader}
              </th>
              <th
                colSpan={5}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.rightGroupHeader}
              </th>
            </tr>
            <tr>
              {LS_P2_HEADERS.columns.map((c, i) => (
                <th
                  key={`left-${i}`}
                  className="border border-slate-400 bg-slate-50 px-1 py-0.5 text-center"
                >
                  {c}
                </th>
              ))}
              {LS_P2_HEADERS.columns.map((c, i) => (
                <th
                  key={`right-${i}`}
                  className="border border-slate-400 bg-slate-50 px-1 py-0.5 text-center"
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rowsCount }).map((_, idx) => {
              const no = idx + 1;
              const bM1 = page2.beforeM1[idx];
              const bM2 = page2.beforeM2[idx];
              const aM1 = page2.afterM1[idx];
              const aM2 = page2.afterM2[idx];
              return (
                <tr key={no}>
                  <NoCell no={no} />
                  <DateCell row={bM1} testId={`ls-besshi-p2-before-m1-row-${no}-date`} />
                  <ClosingCell row={bM1} testId={`ls-besshi-p2-before-m1-row-${no}-closing`} />
                  <DateCell row={bM2} testId={`ls-besshi-p2-before-m2-row-${no}-date`} />
                  <ClosingCell row={bM2} testId={`ls-besshi-p2-before-m2-row-${no}-closing`} />
                  <NoCell no={no} />
                  <DateCell row={aM1} testId={`ls-besshi-p2-after-m1-row-${no}-date`} />
                  <ClosingCell row={aM1} testId={`ls-besshi-p2-after-m1-row-${no}-closing`} />
                  <DateCell row={aM2} testId={`ls-besshi-p2-after-m2-row-${no}-date`} />
                  <ClosingCell row={aM2} testId={`ls-besshi-p2-after-m2-row-${no}-closing`} />
                </tr>
              );
            })}
            {/* 소계 행 */}
            <tr>
              <td
                colSpan={3}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.subtotalLabel}
              </td>
              <td
                colSpan={2}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-right tabular-nums"
                data-testid="ls-besshi-p2-subtotal-before"
              >
                {fmt(page2.beforeSubtotal)}
              </td>
              <td
                colSpan={3}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.subtotalLabel}
              </td>
              <td
                colSpan={2}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-right tabular-nums"
                data-testid="ls-besshi-p2-subtotal-after"
              >
                {fmt(page2.afterSubtotal)}
              </td>
            </tr>
            {/* 일수 행 */}
            <tr>
              <td
                colSpan={2}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.tradingDaysLabel}
              </td>
              <td
                colSpan={8}
                className="border border-slate-500 px-2 py-1 text-center tabular-nums"
                data-testid="ls-besshi-p2-tradingDays"
              >
                {page2.tradingDays}
              </td>
            </tr>
            {/* 종가합계 행 */}
            <tr>
              <td
                colSpan={2}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.closingSumLabel}
              </td>
              <td
                colSpan={8}
                className="border border-slate-500 px-2 py-1 text-right tabular-nums"
                data-testid="ls-besshi-p2-sum"
              >
                {fmt(page2.closingSum)}
              </td>
            </tr>
            {/* 종가평균 행 */}
            <tr>
              <td
                colSpan={2}
                className="border border-slate-500 bg-slate-100 px-2 py-1 text-center font-semibold"
              >
                {LS_P2_HEADERS.closingAverageLabel}
              </td>
              <td
                colSpan={8}
                className="border border-slate-500 px-2 py-1 text-right tabular-nums font-semibold"
                data-testid="ls-besshi-p2-avg"
              >
                {fmt(page2.closingAverage)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
