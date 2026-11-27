"use client";

/**
 * 국외자산 부동산 결과 화면 — 출력 항목 선택 패널 + 결과 카드 + 하단 이동 버튼.
 *
 * 순서는 국내 결과뷰와 같다: 출력 항목 선택 → 계산 내역. 선택 기본은 «전체 미선택»(메모리 `feedback_print_media_needs_section_selection`).
 * 서버·클라이언트 PDF에 국외 부동산 섹션이 없어 PDF 버튼은 없고 「선택 항목 인쇄」(브라우저 PDF 저장)만 있다(레지스트리 주석).
 */
import { useMemo, useState } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { NavButton } from "@/components/calc/shared/WizardNav";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";
import {
  TRANSFER_FOREIGN_PRINT_SECTIONS,
  flattenTransferForeignPrintIds,
} from "@/lib/print/transfer-foreign-print-sections";
import type { ForeignRealEstateResult } from "@/lib/tax-engine/foreign-realestate";
import { ForeignRealEstateResultCard } from "./ForeignRealEstateResultCard";

export function ForeignRealEstateResultView({
  result,
  onBack,
  onGoToFirst,
  onReset,
}: {
  result: ForeignRealEstateResult;
  onBack: () => void;
  onGoToFirst: () => void;
  onReset: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  // 거주 5년 미만은 세액 계산 섹션이 렌더되지 않는다 — 없는 서식을 고르게 두지 않는다(거짓 선택 방지)
  const availableIds = useMemo<Set<string>>(
    () => new Set(flattenTransferForeignPrintIds().filter((id) => result.isLiable || id !== "tax-calc")),
    [result.isLiable],
  );
  return (
    <div className="space-y-4" data-testid="foreign-result-view">
      <PrintSelectionPanel
        allGroups={TRANSFER_FOREIGN_PRINT_SECTIONS}
        selectedIds={selectedIds}
        availableIds={availableIds}
        onChange={setSelectedIds}
      />
      <ForeignRealEstateResultCard result={result} selectedIds={selectedIds} />
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
