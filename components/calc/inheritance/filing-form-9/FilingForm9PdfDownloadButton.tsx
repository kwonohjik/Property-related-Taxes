"use client";

/**
 * FilingForm9PdfDownloadButton — 별지 제9호서식(앞쪽) PDF 다운로드.
 *
 * 기존 결과 화면 상단 `window.print()`(전체 인쇄)와 별개 — 양식 1장만 react-pdf로 출력.
 * `PDFDownloadLink` dynamic import(ssr:false). 데이터는 화면과 동일 `buildFilingForm9Data`.
 *
 * Design: docs/02-design/features/inheritance-filing-form-9-replica.ui.design.md §6
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type {
  Heir,
  InheritanceTaxResult,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import { buildFilingForm9Data } from "@/lib/calc/filing-form-9-data";
import {
  InheritanceFilingForm9PdfDocument,
  generateFilingForm9PdfFilename,
} from "@/lib/pdf/InheritanceFilingForm9PdfDocument";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 cursor-not-allowed print:hidden"
        data-testid="ff9-pdf-button-loading"
      >
        로딩 중...
      </button>
    ),
  },
);

interface Props {
  result: InheritanceTaxResult;
  heirs: Heir[];
  deathDate?: string;
}

export function FilingForm9PdfDownloadButton({ result, heirs, deathDate }: Props) {
  const data = useMemo(
    () => buildFilingForm9Data(result, heirs, deathDate),
    [result, heirs, deathDate],
  );
  const document = useMemo(
    () => <InheritanceFilingForm9PdfDocument data={data} />,
    [data],
  );
  const filename = useMemo(
    () => generateFilingForm9PdfFilename(deathDate),
    [deathDate],
  );

  return (
    <PDFDownloadLink
      document={document}
      fileName={filename}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 no-underline transition-colors hover:bg-slate-100 print:hidden"
      data-testid="ff9-pdf-button"
    >
      {({ loading, error }) =>
        loading ? "PDF 생성 중..." : error ? "⚠ PDF 오류" : "📄 별지9호 PDF"
      }
    </PDFDownloadLink>
  );
}
