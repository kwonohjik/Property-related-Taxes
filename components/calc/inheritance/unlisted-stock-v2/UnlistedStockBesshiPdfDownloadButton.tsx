"use client";

/**
 * UnlistedStockBesshiPdfDownloadButton — 비상장주식 평가서 PDF 다운로드 버튼
 *
 * react-pdf의 PDFDownloadLink를 dynamic import로 SSR 차단 후 클라이언트 렌더링.
 * Document·Page 컴포넌트는 server-side 렌더에서 hydration mismatch 위험.
 *
 * Plan: docs/00-pm/inheritance-unlisted-stock-besshi-pdf-export.plan.md
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  UnlistedStockBesshiPdfDocument,
  generateBesshiPdfFilename,
} from "@/lib/pdf/UnlistedStockBesshiPdfDocument";
import type { UnlistedStockValuationInput } from "@/lib/tax-engine/types/unlisted-stock-valuation.types";

const PDFDownloadLink = dynamic(
  () => import("@react-pdf/renderer").then((m) => m.PDFDownloadLink),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 font-medium cursor-not-allowed"
        data-testid="unlisted-stock-pdf-download-button-loading"
      >
        로딩 중...
      </button>
    ),
  },
);

export interface UnlistedStockBesshiPdfDownloadButtonProps {
  input: UnlistedStockValuationInput;
}

export function UnlistedStockBesshiPdfDownloadButton({
  input,
}: UnlistedStockBesshiPdfDownloadButtonProps) {
  // 비활성 조건 — 평가 가능 입력 미충족
  const isDisabled = input.totalShares <= 0 || input.ownedShares <= 0 || !input.corpName.trim();

  const filename = useMemo(() => generateBesshiPdfFilename(input), [input]);
  const document = useMemo(
    () => <UnlistedStockBesshiPdfDocument input={input} />,
    [input],
  );

  if (isDisabled) {
    return (
      <DisabledButton
        label="📄 PDF 다운로드"
        title="법인명·발행주식·보유주식수 입력 후 다운로드 가능합니다"
      />
    );
  }

  return (
    <PDFDownloadLink
      document={document}
      fileName={filename}
      className="text-xs px-2.5 py-1 rounded border border-indigo-300 bg-white hover:bg-indigo-100 text-indigo-700 font-medium transition-colors no-underline"
      data-testid="unlisted-stock-pdf-download-button"
    >
      {({ loading, error }) =>
        loading
          ? "PDF 생성 중..."
          : error
            ? "⚠ PDF 오류"
            : "📄 PDF 다운로드"
      }
    </PDFDownloadLink>
  );
}

function DisabledButton({ label, title }: { label: string; title?: string }) {
  return (
    <button
      type="button"
      disabled
      title={title}
      className="text-xs px-2.5 py-1 rounded border border-gray-300 bg-gray-50 text-gray-400 font-medium cursor-not-allowed"
      data-testid="unlisted-stock-pdf-download-button-disabled"
    >
      {label}
    </button>
  );
}
