"use client";

/**
 * 결과 PDF 클라이언트 생성 — 로컬 데이터(result/inputData)로 브라우저에서 react-pdf 렌더.
 *
 * 서버 라우트(/api/pdf/result/[id])는 Supabase getCalculation 의존이라
 * 로컬 IndexedDB id와 불일치해 작동 불가 → 클라이언트 생성으로 전환(로컬 일원화).
 * 폰트는 CDN(jsDelivr) 기반이라 브라우저에서도 registerFonts 동작.
 *
 * 계획서: docs/00-pm/local-first-storage-backup.plan.md §5-3 / §9 (PDF 클라이언트 전환)
 */

import React from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import { downloadBlob } from "@/lib/utils/file-download";
import { ResultPdfDocument, type ResultPdfProps } from "./ResultPdfDocument";
import { registerFonts } from "./fonts";

interface GenerateResultPdfParams {
  taxType: string;
  taxTypeLabel: string;
  resultData: Record<string, unknown>;
  inputData?: Record<string, unknown>;
  selectedSectionIds?: string[];
  /** 다운로드 파일명 (확장자 포함). */
  filename: string;
}

export async function generateResultPdf(p: GenerateResultPdfParams): Promise<void> {
  registerFonts();
  // react-pdf 번들은 무거움 → 다운로드 시점에 동적 로드
  const { pdf } = await import("@react-pdf/renderer");

  const createdAt = new Date().toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const props: ResultPdfProps = {
    taxType: p.taxType,
    taxTypeLabel: p.taxTypeLabel,
    createdAt,
    resultData: p.resultData,
    inputData: p.inputData,
    selectedSectionIds: p.selectedSectionIds,
  };

  const blob = await pdf(
    React.createElement(ResultPdfDocument, props) as React.ReactElement<DocumentProps>,
  ).toBlob();
  downloadBlob(blob, p.filename);
}
