"use client";

/**
 * Buppyo2PdfDownloadButton — 부표 2 PDF 다운로드 (A4 가로). PDFDownloadLink dynamic(ssr:false).
 * 데이터는 화면과 동일 buildBuppyo2Data 결과(Buppyo2HeirData[]).
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Buppyo2HeirData } from "@/lib/calc/besshi-buppyo-2-data";
import {
  InheritanceBuppyo2PdfDocument,
  generateBuppyo2PdfFilename,
} from "@/lib/pdf/InheritanceBuppyo2PdfDocument";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 cursor-not-allowed print:hidden"
        data-testid="buppyo2-pdf-button-loading"
      >
        로딩 중...
      </button>
    ),
  },
);

export function Buppyo2PdfDownloadButton({
  data,
  deathDate,
}: {
  data: Buppyo2HeirData[];
  deathDate?: string;
}) {
  const document = useMemo(
    () => <InheritanceBuppyo2PdfDocument data={data} />,
    [data],
  );
  const filename = useMemo(
    () => generateBuppyo2PdfFilename(deathDate),
    [deathDate],
  );

  return (
    <PDFDownloadLink
      document={document}
      fileName={filename}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 no-underline transition-colors hover:bg-slate-100 print:hidden"
      data-testid="buppyo2-pdf-btn"
    >
      {({ loading, error }) =>
        loading ? "PDF 생성 중..." : error ? "⚠ PDF 오류" : "📄 부표2 PDF"
      }
    </PDFDownloadLink>
  );
}
