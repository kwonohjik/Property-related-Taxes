"use client";

/**
 * ListedStockBesshiPdfDownloadButton — 상장주식 평가조서(갑·을) PDF 다운로드.
 *
 * 비상장 UnlistedStockBesshiPdfDownloadButton 패턴 그대로 차용.
 * react-pdf PDFDownloadLink dynamic import (ssr: false) — SSR hydration 차단.
 *
 * Plan: docs/00-pm/listed-stock-besshi-form-ux-refinement.plan.md §3-1
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  ListedStockBesshiPdfDocument,
  generateListedStockBesshiPdfFilename,
} from "@/lib/pdf/ListedStockBesshiPdfDocument";
import { evaluateListedStock } from "@/lib/tax-engine/property-valuation-stock";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 font-medium cursor-not-allowed"
        data-testid="ls-besshi-pdf-button-loading"
      >
        로딩 중...
      </button>
    ),
  },
);

interface Props {
  item: EstateItem;
  valuationDate?: string;
}

export function ListedStockBesshiPdfDownloadButton({ item, valuationDate }: Props) {
  const canDownload =
    (item.listedStockAvgPrice ?? 0) > 0 &&
    (item.listedStockShares ?? 0) > 0 &&
    !!valuationDate;

  const besshi = useMemo(() => {
    if (!canDownload) return null;
    try {
      const r = evaluateListedStock(item, { valuationDate });
      return r.besshiData ?? null;
    } catch {
      return null;
    }
  }, [item, valuationDate, canDownload]);

  const filename = useMemo(
    () => generateListedStockBesshiPdfFilename(item, valuationDate),
    [item, valuationDate],
  );

  const document = useMemo(
    () => (besshi ? <ListedStockBesshiPdfDocument besshi={besshi} /> : null),
    [besshi],
  );

  if (!canDownload || !besshi || !document) {
    return (
      <button
        type="button"
        disabled
        title="종목명·평가기준일·종가 평균·주식 수 입력 후 다운로드 가능"
        className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 font-medium cursor-not-allowed"
        data-testid="ls-besshi-pdf-button-disabled"
      >
        📄 PDF 다운로드
      </button>
    );
  }

  return (
    <PDFDownloadLink
      document={document}
      fileName={filename}
      className="text-xs px-2.5 py-1 rounded border border-sky-300 bg-white hover:bg-sky-100 text-sky-700 font-medium transition-colors no-underline"
      data-testid="ls-besshi-pdf-button"
    >
      {({ loading, error }) =>
        loading ? "PDF 생성 중..." : error ? "⚠ PDF 오류" : "📄 PDF 다운로드"
      }
    </PDFDownloadLink>
  );
}
