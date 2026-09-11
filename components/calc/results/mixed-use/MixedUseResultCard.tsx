"use client";

/**
 * 겸용주택 분리계산 결과 카드 (4-카드 + 합산)
 *
 * 학습·검증 목적: 양도가액 안분 → 주택부분 → 상가부분 → 비사업용토지 → 합산세액
 * 각 항목 하단에 계산 과정(산식)을 한국어로 표기.
 */

import type { MixedUseGainBreakdown } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { useState, useMemo } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import {
  MIXED_USE_PRINT_SECTIONS,
  type MixedUsePrintSectionId,
} from "@/lib/print/mixed-use-print-sections";
import {
} from "@/components/calc/results/mixed-use/MixedUseResultCardParts";
import { MixedUseCalculationSections } from "@/components/calc/results/mixed-use/MixedUseCalculationSections";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import {
  mixedUseToFilingResult,
} from "@/components/calc/results/mixed-use/MixedUseResultCardAdapter";

// 하위 호환 — 종전에 이 모듈에서 어댑터를 가져가던 소비처 유지.
export { mixedUseToFilingResult };

const MIXED_SECTION_IDS = ["apportion", "housing", "commercial", "nbl", "total"] as const;

interface Props {
  breakdown: MixedUseGainBreakdown;
  formData?: TransferFormData;
}

export function MixedUseResultCard({ breakdown, formData }: Props) {
  // 출력 항목 선택 (PR-F4) — 기존 자체 printScoped("full"/"form-table") → PrintSelectionPanel 통일.
  // ⚠️ pdf 채널 0(ResultPdfDocument에 mixed-use 섹션 부재) → onPrintPdf 미전달.
  //    "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)만 노출. 설계 §2.8.
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  // 계산 섹션(①~④·합산)의 펼침 상태 — 상단 전체 토글로 일괄 제어. 기본 전체 펼침.
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(MIXED_SECTION_IDS.map((id) => [id, true])),
  );
  // 현재 결과뷰에 실제 렌더되는 leaf id (본문·신고서·명세서 항상 + 건물 기준시가 계산서는
  // 소속 스냅샷이 있을 때만 — 단건 TransferTaxResultView와 동일 판정).
  const availablePrintIds = useMemo<Set<MixedUsePrintSectionId>>(() => {
    const ids = new Set<MixedUsePrintSectionId>(["calculation", "form-table", "detailed-statement"]);
    if (hasBuildingStdReport({ assets: formData?.assets })) ids.add("building-std-report");
    return ids;
  }, [formData?.assets]);

  if (breakdown.splitMode === "pre-2022-rejected") {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
        <p className="font-semibold mb-1">겸용주택 분리계산 불가</p>
        {breakdown.warnings.map((w, i) => (
          <p key={i}>{w}</p>
        ))}
      </div>
    );
  }

  // `multiHouseSurcharge`는 더 이상 구조분해하지 않는다 — §95② 배제 표시가 그것을 **재도출**하던
  // 것을 엔진 echo(`surchargeLthdExclusion`)로 대체했기 때문이다(2026-08-25).
  // 🔑 `breakdown` 파생은 **자식이 한다** — 분리계산 본문이 그 15개를 전부 쓰기 때문이다.
  //    부모에 남기면 props 가 17개가 되고 dual-truth 가 생긴다(자식 파일 상단 주석 참조).
  const nb = breakdown.nonBusinessLandPart;

  // 실제 렌더되는 섹션만 전체 토글 대상 (nbl은 nb 있을 때만).
  const renderedSectionIds = MIXED_SECTION_IDS.filter((id) => id !== "nbl" || !!nb);
  const allSectionsOpen = renderedSectionIds.every((id) => openSections[id]);
  const setAllSections = (value: boolean) =>
    setOpenSections((prev) => {
      const next = { ...prev };
      for (const id of renderedSectionIds) next[id] = value;
      return next;
    });
  const toggleSection = (id: string) =>
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="space-y-4">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄 — 브라우저 PDF 저장) */}
      <PrintSelectionPanel
        allGroups={MIXED_USE_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
      />

      {/* ── 신고서 양식 표 (결과탭 첫번째 보고서) ── */}
      <PrintSection id="form-table" selectedIds={selectedPrintIds}>
      {(() => {
        // 겸용주택(propertyType="mixed-use-house")은 재개발과 배타적이므로
        // redevelopmentDetail이 항상 undefined → redev props 비활성. 일관성 차원에서 전달.
        const mixedFilingResult = mixedUseToFilingResult(breakdown);
        const primaryAsset = formData?.assets?.[0];
        const hasRedev = !!mixedFilingResult.redevelopmentDetail;
        return (
          <FilingFormTable
            result={mixedFilingResult}
            formData={formData}
            redevSubject={
              hasRedev
                ? ((primaryAsset?.redevSubject || (primaryAsset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
                : undefined
            }
            redevSettlementDirection={
              hasRedev
                ? ((primaryAsset?.redevSettlementDirection || "pay") as "pay" | "receive")
                : undefined
            }
          />
        );
      })()}
      </PrintSection>

      {/* ── 분리계산 본문 (안분·주택·상가·비사업용·합산세액·계산경로) ── */}
      {/* ── 분리계산 본문 → `MixedUseCalculationSections.tsx` (800줄 분리) ── */}
      <MixedUseCalculationSections
        breakdown={breakdown}
        formData={formData}
        selectedPrintIds={selectedPrintIds}
        openSections={openSections}
        toggleSection={toggleSection}
        allSectionsOpen={allSectionsOpen}
        setAllSections={setAllSections}
      />

      {/* ── 계산결과 상세명세서 (겸용주택 모드) ── */}
      {/* 신고서 양식 32 항목별 산식·변수값·법령 노출 — mixedUseDetail은 단건 모드로 처리 */}
      <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
      <DetailedCalculationStatementCard
        result={mixedUseToFilingResult(breakdown)}
        formData={formData}
        asset={formData?.assets[0]}
      />
      </PrintSection>

      {/* ── 건물 기준시가 계산서 (PHD 3시점 일괄 스냅샷 소속 시) ── */}
      {/* 겸용 입력폼 PHD 배치가 bsp-{assetId}-phd-* 스냅샷을 저장 → 여기서 소속 재유도·출력.
          엔진·스냅샷 생성 무변경, 단건 TransferTaxResultView와 동일 배선(inputData=assets). */}
      {hasBuildingStdReport({ assets: formData?.assets }) && (
        <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
          <BuildingStdPriceReportSection inputData={{ assets: formData?.assets }} />
        </PrintSection>
      )}

      {/*
        면책 고지 — 선택 출력과 무관하게 **항상** 인쇄되어야 하므로 `PrintSection` 밖이다
        (`TransferTaxResultView.tsx:709`와 같은 규약).

        🔴 겸용주택 결과·PDF에만 이 고지가 없었다 (2026-09-07 UI 리뷰). 같은 물건을 단건(주택)으로
           계산하면 붙으므로, **자산 종류를 겸용으로 바꾸는 것만으로 고지가 사라졌다**.
      */}
      <DisclaimerBanner />
    </div>
  );
}
