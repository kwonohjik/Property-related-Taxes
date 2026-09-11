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
  decedentName?: string;
  decedentResidentNumber?: string;
  /**
   * ㊶ 분납액 · ㊵ 물납액 (IG-052).
   *
   * 종전에는 Props에 이 둘이 «아예 없어» 부모가 값을 넘겨줄 수도 없었고(명시 prop 매핑 strip),
   * 같은 어댑터를 5인자로만 불러 화면 별지9호에는 금액이 찍히는데 PDF에는 대시로 비어 나갔다.
   * 제출용 서식 두 벌이 서로 다른 납부방법을 말하게 된다 — 「단일 어댑터로 dual-truth를
   * 막는다」는 이 모듈의 전제가 깨진 지점이다.
   *
   * ⚠️ 8번째 인자 `decedentAddress`는 넘겨도 PDF가 달라지지 않는다 —
   * `InheritanceFilingForm9PdfDocument`의 metaRow가 ⑩을 렌더하지 않기 때문이다.
   * 그래서 Props에 추가하지 않는다(안 쓰는 prop을 만들지 않는다).
   */
  splitPaymentAmount?: number;
  paymentInKindAmount?: number;
}

export function FilingForm9PdfDownloadButton({
  result,
  heirs,
  deathDate,
  decedentName,
  decedentResidentNumber,
  splitPaymentAmount,
  paymentInKindAmount,
}: Props) {
  const data = useMemo(
    () =>
      buildFilingForm9Data(
        result,
        heirs,
        deathDate,
        decedentName,
        decedentResidentNumber,
        splitPaymentAmount,
        paymentInKindAmount,
      ),
    [
      result,
      heirs,
      deathDate,
      decedentName,
      decedentResidentNumber,
      splitPaymentAmount,
      paymentInKindAmount,
    ],
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
