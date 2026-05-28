"use client";

/**
 * Page1CoverSection — 상장주식 평가조서(갑) 18칸 표.
 *
 * Single source: result.besshiData.page1 + page1Values.
 * UI 재계산 0건 — engine echo만 직접 표시 ([[ui_engine_dual_truth_avoidance]]).
 *
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §2-1
 */

import React from "react";
import { fmt } from "@/components/calc/inheritance/unlisted-stock-v2/besshi/BesshiSharedAtoms";
import {
  LS_P1_LABELS,
  LS_P1_STOCK_CLASS_LABEL,
} from "./listed-besshi-constants";
import type { ListedStockBesshiData } from "@/lib/tax-engine/types/listed-stock-valuation.types";

interface Props {
  besshi: ListedStockBesshiData;
}

function Cell({
  no,
  label,
  value,
  spanLabel = false,
  testId,
}: {
  no?: keyof typeof LS_P1_LABELS;
  label: string;
  value: React.ReactNode;
  spanLabel?: boolean;
  testId?: string;
}) {
  return (
    <>
      <div className="border border-slate-400 px-2 py-2 text-xs whitespace-pre-line bg-slate-50 font-medium">
        {no && (
          <span className="inline-block min-w-[1.25rem] text-slate-600 mr-1">
            {no}
          </span>
        )}
        {label}
      </div>
      <div
        className={`border border-slate-400 px-2 py-2 text-sm text-right tabular-nums ${spanLabel ? "col-span-3" : ""}`}
        data-testid={testId}
      >
        {value ?? "-"}
      </div>
    </>
  );
}

function fmtDate(iso?: string): string {
  if (!iso) return "-";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : iso;
}

function fmtPct(v?: number): string {
  if (v == null) return "-";
  return `${(v * 100).toFixed(2)}%`;
}

export function Page1CoverSection({ besshi }: Props) {
  const { page1, page1Values } = besshi;
  const isUnlistedSection = page1.isUnlistedShareSection;

  return (
    <section
      className="bg-white text-slate-900 p-4 border border-slate-300 rounded-md print:p-2"
      data-testid="ls-besshi-p1-section"
    >
      <h2 className="text-center text-xl font-bold tracking-[0.4em] mb-3">
        {LS_P1_LABELS.formTitle}
      </h2>

      {/* 1.평가대상 상장법인 */}
      <div className="border border-slate-500 mb-2">
        <div className="bg-slate-100 border-b border-slate-500 px-2 py-1 text-sm font-semibold">
          {LS_P1_LABELS.section1Title}
        </div>
        <div className="grid grid-cols-4 text-sm">
          <Cell
            no="①"
            label={LS_P1_LABELS["①"]}
            value={page1.companyName ?? "-"}
            testId="ls-besshi-p1-①"
          />
          <Cell
            no="②"
            label={LS_P1_LABELS["②"]}
            value={page1.representative ?? "-"}
            testId="ls-besshi-p1-②"
          />
          <Cell
            no="③"
            label={LS_P1_LABELS["③"]}
            value={page1.companyAddress ?? "-"}
            testId="ls-besshi-p1-③"
          />
          <Cell
            no="④"
            label={LS_P1_LABELS["④"]}
            value={fmtDate(page1.valuationDate)}
            testId="ls-besshi-p1-④"
          />
          <Cell
            no="⑤"
            label={LS_P1_LABELS["⑤"]}
            value={LS_P1_STOCK_CLASS_LABEL[page1.stockClass]}
            testId="ls-besshi-p1-⑤"
          />
          <Cell
            no="⑥"
            label={LS_P1_LABELS["⑥"]}
            value={fmtDate(page1.listingDate)}
            testId="ls-besshi-p1-⑥"
          />
          <Cell
            no="⑦"
            label={LS_P1_LABELS["⑦"]}
            value={fmtDate(page1.capitalIncreaseDate)}
            testId="ls-besshi-p1-⑦"
          />
          <Cell
            no="⑧"
            label={LS_P1_LABELS["⑧"]}
            value={fmtDate(page1.mergerDate)}
            testId="ls-besshi-p1-⑧"
          />
        </div>
      </div>

      {/* 2.1주당 가액 평가 */}
      <div className="border border-slate-500 mb-2">
        <div className="bg-slate-100 border-b border-slate-500 px-2 py-1 text-sm font-semibold">
          {LS_P1_LABELS.section2Title}
        </div>
        <div className="grid grid-cols-4 text-sm">
          <Cell
            no="⑨"
            label={LS_P1_LABELS["⑨"]}
            value={fmt(page1Values.closingAvg)}
            spanLabel
            testId="ls-besshi-p1-⑨"
          />
          <Cell
            no="⑩"
            label={LS_P1_LABELS["⑩"]}
            value={fmt(page1Values.perShareMajorShareholder)}
            spanLabel
            testId="ls-besshi-p1-⑩"
          />
        </div>
      </div>

      {/* 3.미상장주식의 1주당가액 평가 (조건부) */}
      <div
        className={`border border-slate-500 mb-2 ${isUnlistedSection ? "" : "opacity-50"}`}
      >
        <div className="bg-slate-100 border-b border-slate-500 px-2 py-1 text-sm font-semibold">
          {LS_P1_LABELS.section3Title}
        </div>
        <div className="grid grid-cols-6 text-sm">
          <Cell
            no="⑪"
            label={LS_P1_LABELS["⑪"]}
            value={fmtPct(page1Values.priorDividendRate)}
            testId="ls-besshi-p1-⑪"
          />
          <Cell
            no="⑫"
            label={LS_P1_LABELS["⑫"]}
            value={page1Values.priorDividendAmount != null ? fmt(page1Values.priorDividendAmount) : "-"}
            testId="ls-besshi-p1-⑫"
          />
          <Cell
            no="⑬"
            label={LS_P1_LABELS["⑬"]}
            value={fmtDate(page1Values.dividendBaseDate)}
            testId="ls-besshi-p1-⑬"
          />
          <Cell
            no="⑭"
            label={LS_P1_LABELS["⑭"]}
            value={
              page1Values.daysUntilDividendBase != null
                ? `${page1Values.daysUntilDividendBase}/365`
                : "( /365)"
            }
            testId="ls-besshi-p1-⑭"
          />
          <Cell
            no="⑮"
            label={LS_P1_LABELS["⑮"]}
            value={page1Values.dividendDifference != null ? fmt(page1Values.dividendDifference) : "-"}
            testId="ls-besshi-p1-⑮"
          />
          <Cell
            no="⑯"
            label={LS_P1_LABELS["⑯"]}
            value={page1Values.perShareValue != null ? fmt(page1Values.perShareValue) : "-"}
            testId="ls-besshi-p1-⑯"
          />
          <Cell
            no="⑰"
            label={LS_P1_LABELS["⑰"]}
            value={
              page1Values.perShareMajorShareholderUnlisted != null
                ? fmt(page1Values.perShareMajorShareholderUnlisted)
                : "-"
            }
            spanLabel
            testId="ls-besshi-p1-⑰"
          />
        </div>
      </div>

      {/* §63③ 배제 사유 안내 (해당 시) */}
      {page1Values.premiumExclusionLabel && (
        <div
          className="text-xs text-slate-600 mt-2"
          data-testid="ls-besshi-p1-premium-exclusion"
        >
          ※ 할증 배제 사유: {page1Values.premiumExclusionLabel}
        </div>
      )}

      {/* 푸터: 작성연월·서명 */}
      <div className="text-right text-sm mt-6">
        {page1.valuationDate
          ? `${page1.valuationDate.slice(0, 4)}년 ${parseInt(page1.valuationDate.slice(5, 7), 10)}월     일`
          : ""}
      </div>
      <div className="text-right text-sm mt-1">성  명 :              (서명 또는 인)</div>
    </section>
  );
}
