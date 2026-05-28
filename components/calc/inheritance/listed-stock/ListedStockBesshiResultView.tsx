"use client";

/**
 * ListedStockBesshiResultView — 상장주식 평가조서(갑·을) 결과뷰 묶음.
 *
 * 상속·증여 결과뷰에서 estateItem.category === "listed_stock" 행마다 호출.
 * besshiData 가 없으면 렌더 0건 (fallback 0).
 *
 * Design UI: docs/02-design/features/listed-stock-besshi-form-replica.ui.design.md §2
 */

import React, { useState } from "react";
import { Page1CoverSection } from "./besshi/Page1CoverSection";
import { Page2DailyClosingTable } from "./besshi/Page2DailyClosingTable";
import { LS_RESULT_LABELS } from "./besshi/listed-besshi-constants";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ListedStockBesshiData } from "@/lib/tax-engine/types/listed-stock-valuation.types";

interface Props {
  item: EstateItem;
  besshi: ListedStockBesshiData;
  valuatedAmount: number;
}

export function ListedStockBesshiResultView({ item, besshi, valuatedAmount }: Props) {
  const [page1Open, setPage1Open] = useState(true);
  const [page2Open, setPage2Open] = useState(true);

  return (
    <section
      className="bg-sky-50 dark:bg-white p-4 rounded-md border border-sky-200 mb-4 print:bg-white"
      data-testid={`ls-result-view-${item.id}`}
    >
      {/* 상단 요약 */}
      <header className="flex flex-wrap items-end justify-between gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold">
            {item.name} {item.listedStockCode ? `(${item.listedStockCode})` : ""}
          </h3>
          <p className="text-xs text-slate-600">
            보유 주식수: {(item.listedStockShares ?? 0).toLocaleString()}주 ·
            평균 종가: {besshi.page1Values.closingAvg.toLocaleString()}원/주
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-slate-600">평가액</div>
          <div className="text-xl font-bold text-rose-700 tabular-nums">
            {valuatedAmount.toLocaleString()}원
          </div>
        </div>
      </header>

      {/* 갑지 토글 */}
      <button
        type="button"
        onClick={() => setPage1Open((v) => !v)}
        className="w-full text-left text-sm font-semibold py-2 px-3 bg-white border border-sky-300 rounded mb-2 print:hidden"
        data-testid="ls-besshi-p1-toggle"
      >
        {page1Open ? "▼" : "▶"} {LS_RESULT_LABELS.page1Toggle.slice(2)}
      </button>
      <div className={page1Open ? "block mb-3" : "hidden print:block mb-3"}>
        <Page1CoverSection besshi={besshi} />
      </div>

      {/* 을지 토글 */}
      <button
        type="button"
        onClick={() => setPage2Open((v) => !v)}
        className="w-full text-left text-sm font-semibold py-2 px-3 bg-white border border-sky-300 rounded mb-2 print:hidden"
        data-testid="ls-besshi-p2-toggle"
      >
        {page2Open ? "▼" : "▶"} {LS_RESULT_LABELS.page2Toggle.slice(2)}
      </button>
      <div className={page2Open ? "block" : "hidden print:block"}>
        <Page2DailyClosingTable page2={besshi.page2} />
      </div>
    </section>
  );
}
