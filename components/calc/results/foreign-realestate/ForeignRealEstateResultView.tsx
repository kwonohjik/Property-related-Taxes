"use client";

/**
 * 국외자산 부동산 결과 화면 — 출력 항목 선택 패널 + 결과 카드 + 하단 이동 버튼.
 *
 * 순서는 국내 결과뷰와 같다: 출력 항목 선택 → 계산 내역. 선택 기본은 «전체 미선택»(메모리 `feedback_print_media_needs_section_selection`).
 * PDF 채널은 신고서 표(`form-table`, 별지 제84호서식) 1종 — 클라이언트 react-pdf(`ResultPdfDocument` taxType `transfer_foreign`)가 같은 행·열 값을 그린다.
 * 그 밖의 항목은 「선택 항목 인쇄」(브라우저 PDF 저장)로 출력한다(레지스트리 주석).
 */
import { useMemo, useState } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { downloadSelectedPdf } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { FOREIGN_FILING_FORM_PDF_KEY } from "@/lib/pdf/ResultPdfForeignSections";
import { NavButton } from "@/components/calc/shared/WizardNav";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";
import {
  TRANSFER_FOREIGN_PRINT_SECTIONS,
  flattenTransferForeignPrintIds,
} from "@/lib/print/transfer-foreign-print-sections";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { ForeignRealEstateResultCard } from "./ForeignRealEstateResultCard";
import { buildForeignFilingForm, buildForeignFilingMeta, hasForeignFilingForm } from "./foreign-filing-form";

export function ForeignRealEstateResultView({
  result,
  onBack,
  onGoToFirst,
  onReset,
  foreignAssets,
}: {
  result: ForeignRealEstateResult;
  /** 입력 쪽 소재지국·소재지 — 신고서 표(별지 제84호서식 부표1 ②)가 읽는다. 없으면 그 칸은 비운다 */
  foreignAssets?: readonly { countryCode: string; address: string }[];
  onBack: () => void;
  onGoToFirst: () => void;
  onReset: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pdfBusy, setPdfBusy] = useState(false);
  const filingMeta = useMemo(() => buildForeignFilingMeta(foreignAssets ?? []), [foreignAssets]);
  // 거주 5년 미만은 세액 계산 섹션·신고서 표가 렌더되지 않는다 — 없는 서식을 고르게 두지 않는다(거짓 선택 방지)
  const availableIds = useMemo<Set<string>>(
    () => new Set(flattenTransferForeignPrintIds().filter((id) => (id === "form-table" ? hasForeignFilingForm(result) : result.isLiable || id !== "tax-calc"))),
    [result],
  );
  // 선택 항목 PDF — 신고서 표만 PDF 채널이다. 값은 화면 표와 같은 순수 매핑을 그대로 실어 보낸다(PDF가 다시 계산하지 않는다).
  const handlePrintPdf = (pdfSections: string[]) =>
    downloadSelectedPdf(
      {
        taxType: "transfer_foreign",
        taxTypeLabel: "양도소득세(국외자산 부동산)",
        resultData: result as unknown as Record<string, unknown>,
        inputData: { [FOREIGN_FILING_FORM_PDF_KEY]: buildForeignFilingForm(result, filingMeta) },
        filenamePrefix: "양도소득세_국외부동산_신고서",
      },
      pdfSections,
      setPdfBusy,
    );
  return (
    <div className="space-y-4" data-testid="foreign-result-view">
      <PrintSelectionPanel
        allGroups={TRANSFER_FOREIGN_PRINT_SECTIONS}
        selectedIds={selectedIds}
        availableIds={availableIds}
        onChange={setSelectedIds}
        onPrintPdf={handlePrintPdf}
        pdfBusy={pdfBusy}
      />
      <ForeignRealEstateResultCard result={result} selectedIds={selectedIds} filingMeta={filingMeta} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-4 print:hidden">
        <NavButton direction="prev" label="처음으로 (국외자산 입력)" onClick={onGoToFirst} />
        <div className="flex items-center gap-2">
          <NavButton direction="prev" label="이전" onClick={onBack} />
          <RestartFromScratchButton onReset={onReset} />
        </div>
      </div>
    </div>
  );
}
