"use client";

/**
 * DeductionBesshiPdfButtons — 부표3·별지5호·별지1호 통합 PDF 다운로드 (1 문서 3 Page, 렌더 가드 Page).
 * PDFDownloadLink dynamic(ssr:false). 화면과 동일 어댑터 결과 소비.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Buppyo3Data, Besshi5Data, Besshi1Data } from "@/lib/calc/deduction-besshi-data";
import {
  InheritanceDeductionBesshiPdf,
  generateDeductionBesshiPdfFilename,
} from "@/lib/pdf/InheritanceDeductionBesshiPdf";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="cursor-not-allowed rounded-md border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-400 print:hidden"
        data-testid="deduction-besshi-pdf-loading"
      >
        로딩 중...
      </button>
    ),
  },
);

interface Props {
  bp3: Buppyo3Data;
  b5: Besshi5Data | null;
  b1: Besshi1Data | null;
  deathDate?: string;
}

export function DeductionBesshiPdfButtons({ bp3, b5, b1, deathDate }: Props) {
  const document = useMemo(
    () => <InheritanceDeductionBesshiPdf bp3={bp3} b5={b5} b1={b1} />,
    [bp3, b5, b1],
  );
  const filename = useMemo(() => generateDeductionBesshiPdfFilename(deathDate), [deathDate]);

  return (
    <PDFDownloadLink
      document={document}
      fileName={filename}
      className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 no-underline transition-colors hover:bg-slate-100 print:hidden"
      data-testid="deduction-besshi-pdf-button"
    >
      {({ loading, error }) =>
        loading ? "PDF 생성 중..." : error ? "⚠ PDF 오류" : "📄 별지(부표3·5호·1호) PDF"
      }
    </PDFDownloadLink>
  );
}
