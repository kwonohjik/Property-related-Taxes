"use client";

/**
 * ListedStockBesshiPreviewCard — 입력 폼 내 평가조서(갑·을) 즉시 미리보기.
 *
 * 결과 화면(ListedStockBesshiResultView)이 평가액 카드 + 갑·을 묶음을 표시하는 반면,
 * 본 PreviewCard는 입력 폼 안에서 갑·을 표만 표시 (중복 회피).
 *
 * Single source: evaluateListedStock(item, { valuationDate }).besshiData
 * [[ui_engine_dual_truth_avoidance]] · [[print-only-css-toggle]]
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-ux-refinement.plan.md §3-1
 */

import React, { useMemo, useState } from "react";
import { Page1CoverSection } from "./besshi/Page1CoverSection";
import { Page2DailyClosingTable } from "./besshi/Page2DailyClosingTable";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

interface Props {
  item: EstateItem;
  valuationDate?: string;
}

export function ListedStockBesshiPreviewCard({ item, valuationDate }: Props) {
  const [open, setOpen] = useState(false);

  const canPreview =
    (item.listedStockAvgPrice ?? 0) > 0 &&
    (item.listedStockShares ?? 0) > 0 &&
    !!valuationDate;

  const besshi = useMemo(() => {
    if (!canPreview) return null;
    try {
      const r = evaluateListedStock(item, { valuationDate });
      return r.besshiData ?? null;
    } catch {
      return null;
    }
  }, [item, valuationDate, canPreview]);

  if (!canPreview || !besshi) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs text-slate-600"
        data-testid="ls-besshi-preview-disabled"
      >
        📋 상장주식 평가조서 미리보기 — 평가기준일·종가 평균·주식 수 입력 후 활성화됩니다.
      </div>
    );
  }

  return (
    <section
      className="rounded-lg border border-sky-200 bg-sky-50/40 p-3"
      data-testid="ls-besshi-preview-card"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left text-sm font-semibold text-sky-900 py-1 print:hidden"
        data-testid="ls-besshi-preview-toggle"
      >
        {open ? "▼" : "▶"} 상장주식 평가조서(갑·을) 미리보기
      </button>
      <div className={open ? "block mt-3 space-y-3" : "hidden print:block mt-3 space-y-3"}>
        <Page1CoverSection besshi={besshi} />
        <Page2DailyClosingTable page2={besshi.page2} />
      </div>
    </section>
  );
}
