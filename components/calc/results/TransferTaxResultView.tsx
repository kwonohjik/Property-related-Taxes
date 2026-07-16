"use client";

/**
 * 양도소득세 계산 결과 화면
 * ResultView + Row 헬퍼 컴포넌트
 */

import { useState, useMemo } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { cn } from "@/lib/utils";
// LawArticleModal은 EngineStepsSubToggle로 이전되었으나, 감면 상세 카드 인용 링크화를 위해 재도입 (2026-06-15)
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { LoginPromptBanner } from "@/components/calc/shared/LoginPromptBanner";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { formatRate, Row, downloadSelectedPdf } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { expandToggleClass, expandToggleLabel } from "@/components/calc/results/shared/ExpandToggleButton";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { CarryoverScenarioBFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioBFilingCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { RentalHousingExceptionDetailCard } from "@/components/calc/results/transfer/RentalHousingExceptionDetailCard";
import { CommercialBuildingValuationDetailCard } from "@/components/calc/results/CommercialBuildingValuationDetailCard";
import { GeneralBuildingValuationDetailCard } from "@/components/calc/results/GeneralBuildingValuationDetailCard";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { RedevelopmentDetailCard } from "@/components/calc/results/transfer/RedevelopmentDetailCard";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { HousingExpropriationValuationCard } from "@/components/calc/results/transfer/HousingExpropriationValuationCard";
import { SplitLandExpropriationValuationCard } from "@/components/calc/results/transfer/SplitLandExpropriationValuationCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import { extractRelevantBuildingStdSnapshots } from "@/lib/storage/use-auto-save-calculation";
import {
  TRANSFER_PRINT_SECTIONS,
  type TransferPrintSectionId,
} from "@/lib/print/transfer-print-sections";

// ── 필지별 계산 내역 (펼치기/접기 — 자산 카드와 동일 표준 칩) ──────────
function ParcelDisclosure({
  pr,
  idx,
}: {
  pr: NonNullable<TransferTaxResult["parcelDetails"]>[number];
  idx: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 bg-muted/20 hover:bg-muted/40 text-sm font-medium text-left"
      >
        <span>필지 {idx + 1}</span>
        <span className="ml-auto font-mono text-xs text-muted-foreground">
          양도차익 {formatKRW(pr.transferGain)}
        </span>
        <span className={expandToggleClass("slate")} aria-hidden>
          {expandToggleLabel(open)}
        </span>
      </button>
      <div className={open ? "" : "hidden print:block"}>
        <table className="w-full text-sm border-collapse [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0">
          <tbody>
            <Row label="안분 양도가액" value={formatKRW(pr.allocatedTransferPrice)} sub />
            <Row label="취득가액" value={formatKRW(pr.acquisitionPrice)} sub />
            {pr.estimatedDeduction > 0 && (
              <Row label="필요경비 (개산공제 §163⑥)" value={`- ${formatKRW(pr.estimatedDeduction)}`} sub />
            )}
            {pr.expenses > 0 && (
              <Row label={pr.swapApplied ? "필요경비 (자본·양도비 §97②단서)" : pr.estimatedDeduction > 0 ? "필요경비 (자본·양도비)" : "필요경비"} value={`- ${formatKRW(pr.expenses)}`} sub />
            )}
            <Row label="양도차익" value={formatKRW(pr.transferGain)} />
            <Row
              label={`장기보유특별공제 (${(pr.longTermHoldingRate * 100).toFixed(0)}%)`}
              value={pr.longTermHoldingDeduction > 0 ? `- ${formatKRW(pr.longTermHoldingDeduction)}` : "해당없음"}
              sub
            />
            <Row label="양도소득금액" value={formatKRW(pr.transferIncome)} highlight />
          </tbody>
        </table>
        {/*
          공익수용 양도당시 기준시가 차감 특례 (소득령 §164⑨ 1호) 산출근거 — **필지별**.
          필지마다 개별공시지가가 달라 min[] 선택이 독립이므로 자산-수준으로 승격하지 않는다.
        */}
        {pr.expropriationValuationDetail && (
          <div className="mt-3">
            <ExpropriationValuationCard detail={pr.expropriationValuationDetail} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────

interface Props {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onGoToFirst?: () => void;
  onLoginPrompt?: boolean;
  showMultiTransferButton?: boolean;
  onContinueToMulti?: () => void;
  formData?: TransferFormData;
  asset?: AssetForm;
  transferPriceOverride?: number;
  /** 저장된 계산 id — 호출부 호환용. PDF는 로컬 result 기반 클라이언트 생성으로 전환되어 더는 사용 안 함 */
  savedId?: string;
}

// ── 메인 컴포넌트 ──────────────────────────────────────────────

export function TransferTaxResultView({
  result,
  onReset,
  onBack,
  onGoToFirst,
  onLoginPrompt = false,
  showMultiTransferButton = false,
  onContinueToMulti,
  formData,
  asset,
  transferPriceOverride,
}: Props) {
  // showSteps 상태는 명세서 카드의 EngineStepsSubToggle로 통합되어 제거 (2026-05-12)

  // asset prop 미전달 시 formData.assets[0] 자동 fallback
  // (호출부에서 asset 안 넘기는 경우 carryover 정보 표시 위해 필수)
  const resolvedAsset = asset ?? formData?.assets[0];

  // 이월과세(§97조의2) 모드 판정
  const carryoverDetail = result.carryoverTaxationDetail;
  const isCarryoverMode = !!carryoverDetail?.isEligible;
  const adoptedA = carryoverDetail?.adoptedScenario === "A";

  const [pdfBusy, setPdfBusy] = useState(false);
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(
    () => new Set()
  );

  // 선택 항목 PDF 다운로드 — 클라이언트 react-pdf 생성(로컬 result). Helpers downloadSelectedPdf 위임 (800줄 정책)
  const handlePrintPdf = (pdfSections: string[]) =>
    downloadSelectedPdf(
      {
        taxType: "transfer",
        taxTypeLabel: "양도소득세",
        resultData: result as unknown as Record<string, unknown>,
        // 건물 기준시가 계산서(building-std-report) PDF는 inputData.buildingStdSnapshots에서 재유도.
        inputData: { buildingStdSnapshots: extractRelevantBuildingStdSnapshots({ assets: formData?.assets }) },
        filenamePrefix: "양도소득세_계산결과",
      },
      pdfSections,
      setPdfBusy,
    );

  // 현재 결과뷰에 실제 렌더되는 leaf id (printScoped scope → leaf, 설계 §2.5)
  const availablePrintIds = useMemo<Set<TransferPrintSectionId>>(() => {
    const s = new Set<TransferPrintSectionId>();
    s.add("form-table");
    s.add("detailed-statement");
    s.add("calculation");
    if (result.preHousingDisclosureDetail) s.add("phd");
    if (result.splitDetail) s.add("split-detail");
    if (hasBuildingStdReport({ assets: formData?.assets })) s.add("building-std-report");
    return s;
  }, [result, formData]);

  return (
    <div className="space-y-5">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      <PrintSelectionPanel
        allGroups={TRANSFER_PRINT_SECTIONS}
        selectedIds={selectedPrintIds}
        availableIds={availablePrintIds}
        onChange={setSelectedPrintIds}
        onPrintPdf={handlePrintPdf}
        pdfReady={true}
        pdfBusy={pdfBusy}
      />

      {/* ── 신고서 양식 표 ── */}
      <PrintSection id="form-table" selectedIds={selectedPrintIds}>
      {isCarryoverMode && carryoverDetail ? (
        /* 이월과세 비교과세 모드: Scenario A(채택) + Scenario B(미적용) 나란히 */
        <div className="space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">
            신고서 양식 — 이월과세 비교과세 (소득세법 §97조의2)
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FilingFormTable
              result={result}
              formData={formData}
              asset={resolvedAsset}
              transferPriceOverride={transferPriceOverride}
              acquisitionDateLabel="(증여자 취득일)"
              acquisitionDateOverride={resolvedAsset?.carryover?.donorAcquisitionDate ?? ""}
              title="[A] 이월과세 적용"
              subtitle={`보유기간 ${carryoverDetail.scenarioA.holdingPeriodYears}년 (증여자 취득일 기산) · 취득가액 ${formatKRW(carryoverDetail.scenarioA.acquisitionPrice)}`}
              adopted={adoptedA}
              redevSubject={
                result.redevelopmentDetail
                  ? ((resolvedAsset?.redevSubject || (resolvedAsset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
                  : undefined
              }
              redevSettlementDirection={
                result.redevelopmentDetail
                  ? ((resolvedAsset?.redevSettlementDirection || "pay") as "pay" | "receive")
                  : undefined
              }
            />
            <CarryoverScenarioBFilingCard
              scenarioB={carryoverDetail.scenarioB}
              adopted={!adoptedA}
              transferPrice={transferPriceOverride ?? Number(formData?.contractTotalPrice ?? 0)}
              transferDate={formData?.transferDate}
              giftRegistryDate={resolvedAsset?.carryover?.giftRegistryDate}
            />
          </div>
        </div>
      ) : (
        /* 일반 모드: 단일 신고서 양식 */
        <FilingFormTable
          result={result}
          formData={formData}
          asset={asset}
          transferPriceOverride={transferPriceOverride}
          redevSubject={
            result.redevelopmentDetail
              ? ((resolvedAsset?.redevSubject || (resolvedAsset?.assetKind === "right_to_move_in" ? "right" : "apt")) as "right" | "apt")
              : undefined
          }
          redevSettlementDirection={
            result.redevelopmentDetail
              ? ((resolvedAsset?.redevSettlementDirection || "pay") as "pay" | "receive")
              : undefined
          }
        />
      )}
      </PrintSection>

      {/* ── 계산결과 상세명세서 ── */}
      {/* 신고서 양식 32 항목별 산식·변수값·법령 노출 (사용자 검증용)
          이월과세 모드: 채택된 시나리오 기준 명세서만 표시 (result 자체가 채택값) */}
      <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
      <DetailedCalculationStatementCard
        result={result}
        formData={formData}
        asset={resolvedAsset}
        transferPriceOverride={transferPriceOverride}
        acquisitionDateLabel={
          isCarryoverMode
            ? adoptedA
              ? "(이월과세 적용 — 증여자 취득일 기산)"
              : "(이월과세 미적용 — 등기접수일 기산)"
            : undefined
        }
        acquisitionDateOverride={
          isCarryoverMode && adoptedA
            ? resolvedAsset?.carryover?.donorAcquisitionDate
            : undefined
        }
      />
      </PrintSection>

      {/* ── 핵심 결과 카드 + 계산 내역 ── */}
      <PrintSection id="calculation" selectedIds={selectedPrintIds}>
      <div className="space-y-5">

        {/* 비과세 / 납부세액 요약 — [F13] 비과세 경정(refund_claim)은 🎉 대신 환급 카드 우선 */}
        {result.isExempt && result.amendmentDetail?.correctionKind !== "refund_claim" ? (
          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 p-6 text-center">
            <div className="text-4xl mb-2">🎉</div>
            <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
              {result.exemptReason ?? "비과세"}
            </p>
            <p className="text-2xl font-bold mt-1">납부세액 0</p>
          </div>
        ) : result.amendmentDetail ? (
          <AmendmentResultCard detail={result.amendmentDetail} fullTotalTax={result.totalTax} />
        ) : (
          <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
            <p className="text-sm font-medium text-muted-foreground mb-1">총 납부세액</p>
            <p className="text-3xl font-bold">{formatKRW(result.totalTax)}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {(() => {
                const totalAllPenalty = result.penaltyTax + (result.penaltyDetail?.totalPenalty ?? 0);
                const ruralSurtax = result.new993Detail?.ruralSurtax ?? 0;
                return (
                  <>
                    <span>결정세액 {formatKRW(result.determinedTax)}</span>
                    {totalAllPenalty > 0 && (
                      <>
                        <span>+</span>
                        <span>가산세 {formatKRW(totalAllPenalty)}</span>
                      </>
                    )}
                    <span>+</span>
                    <span>지방소득세 {formatKRW(result.localIncomeTax)}</span>
                    {ruralSurtax > 0 && (
                      <>
                        <span>+</span>
                        <span>농어촌특별세 {formatKRW(ruralSurtax)}</span>
                      </>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {/* 필지별 계산 내역 */}
        {result.parcelDetails && result.parcelDetails.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">필지별 계산 내역</h3>
            {result.parcelDetails.map((pr, idx) => (
              <ParcelDisclosure key={pr.id} pr={pr} idx={idx} />
            ))}
          </div>
        )}

        {/* 이월과세 비교과세 결과 카드 */}
        {result.carryoverTaxationDetail && (
          <CarryoverComparisonCard detail={result.carryoverTaxationDetail} />
        )}

        {/* §97② 단서 swap 발동 표시 */}
        {!result.isExempt && result.swapApplied && result.swapComparison && (
          <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1">
            <p className="font-semibold text-amber-900">
              필요경비 swap 적용 — 소득세법 §97② 2호 단서
            </p>
            <p className="text-xs text-amber-800">
              환산취득가(또는 감정가액·매매사례가액) + 개산공제 {formatKRW(result.swapComparison.estimatedSide)}
              {" < "}자본적지출 + 양도비 {formatKRW(result.swapComparison.directSide)}
            </p>
            <p className="text-xs text-amber-800">
              → 자본적지출 + 양도비 {formatKRW(result.swapComparison.directSide)}을 필요경비로 적용
            </p>
          </div>
        )}
        {!result.isExempt && !result.swapApplied && result.swapComparison && (
          <div className="rounded-lg border border-border bg-muted/20 p-2 text-xs text-muted-foreground">
            §97② 본문 적용 — 환산+개산공제 {formatKRW(result.swapComparison.estimatedSide)} ≥ 자본+양도비 {formatKRW(result.swapComparison.directSide)} (swap 미발동)
          </div>
        )}

        {/* 중과세 정보 */}
        {result.surchargeType && !result.isSurchargeSuspended && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">
            <p className="font-medium text-amber-800 dark:text-amber-400">
              ⚠️ 중과세 적용 —{" "}
              {result.surchargeType === "multi_house_2" ? "2주택" : result.surchargeType === "multi_house_3plus" ? "3주택+" : "비사업용토지"}{" "}
              (+{formatRate(result.surchargeRate ?? 0)})
            </p>
          </div>
        )}
        {result.isSurchargeSuspended && (
          <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm">
            <p className="font-medium text-blue-800 dark:text-blue-400">
              ℹ️ 다주택 중과세 유예 기간 적용 — 일반세율로 계산됩니다.
            </p>
          </div>
        )}

        {/* 다주택 중과세 상세 */}
        {result.multiHouseSurchargeDetail && (
          <MultiHouseSurchargeDetailCard detail={result.multiHouseSurchargeDetail} />
        )}

        {/* 비사업용토지 판정 상세 */}
        {result.nonBusinessLandJudgmentDetail && (
          <div>
            <p className="text-sm font-medium mb-2">비사업용토지 판정 결과</p>
            <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} />
          </div>
        )}

        {/* 공익수용 양도당시 기준시가 차감 특례 (소득세법 시행령 §164⑨ 1호) 산출근거 */}
        {result.expropriationValuationDetail && (
          <ExpropriationValuationCard detail={result.expropriationValuationDetail} />
        )}

        {/* §164⑨ 2호 공매·경락 특례 산출근거 (P4) */}
        {result.auctionValuationDetail && (
          <AuctionValuationCard detail={result.auctionValuationDetail} />
        )}

        {/* §164⑨ 1호 주택 총액 트랙 특례 산출근거 (P5) */}
        {result.housingExpropriationValuationDetail && (
          <HousingExpropriationValuationCard detail={result.housingExpropriationValuationDetail} />
        )}

        {/* §164⑨ 1호 건물 split 토지분 특례 산출근거 (P6/D6) */}
        {result.splitDetail?.splitLandExpropriationValuationDetail && (
          <SplitLandExpropriationValuationCard detail={result.splitDetail.splitLandExpropriationValuationDetail} />
        )}

        {/* §164⑨ 1호 주택 PHD split 총액 특례 산출근거 (P6b/D15) */}
        {result.splitDetail?.housingExpropriationValuationDetail && (
          <HousingExpropriationValuationCard detail={result.splitDetail.housingExpropriationValuationDetail} />
        )}

        {result.pre1990LandValuationDetail && (
          <div className="rounded-lg border border-amber-500/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-2">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              1990.8.30. 이전 취득 토지 기준시가 환산
            </p>
            <p className="text-xs text-muted-foreground">{result.pre1990LandValuationDetail.caseLabel}</p>
            <div className="text-xs space-y-1 mt-2">
              <div>
                <span className="text-muted-foreground">공식: </span>
                <code className="text-caption">{result.pre1990LandValuationDetail.breakdown.formula}</code>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 pt-2">
                <span className="text-muted-foreground">취득시 등급가액</span>
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValueAtAcquisition.toLocaleString()}</span>
                <span className="text-muted-foreground">90.8.30. 현재 등급가액</span>
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValue_1990_0830.toLocaleString()}</span>
                <span className="text-muted-foreground">90.8.30. 직전 등급가액</span>
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.gradeValuePrev_1990_0830.toLocaleString()}</span>
                <span className="text-muted-foreground">분모 (min(평균, 현재))</span>
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.breakdown.appliedDenominator.toLocaleString()}</span>
                <span className="text-muted-foreground">적용 비율</span>
                <span className="font-mono text-right">{(result.pre1990LandValuationDetail.breakdown.appliedRatio * 100).toFixed(2)}%</span>
                <span className="text-muted-foreground">㎡당 가액</span>
                <span className="font-mono text-right">{result.pre1990LandValuationDetail.pricePerSqmAtAcquisition.toLocaleString()}</span>
                <span className="text-muted-foreground font-medium">취득시 기준시가</span>
                <span className="font-mono text-right font-medium">{result.pre1990LandValuationDetail.standardPriceAtAcquisition.toLocaleString()}</span>
                {/* 양도시 기준시가는 상위 폼 standardPriceAtTransfer 입력값으로 공급 — 서브엔진 미산출 */}
              </div>
              {result.pre1990LandValuationDetail.warnings.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-destructive">
                  {result.pre1990LandValuationDetail.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              )}
              <p className="text-micro text-muted-foreground pt-1">{result.pre1990LandValuationDetail.breakdown.legalBasis}</p>
            </div>
          </div>
        )}
      </div>
      </PrintSection>

      {/* 개별주택가격 미공시 취득 환산 상세 */}
      {result.preHousingDisclosureDetail && (
        <PrintSection id="phd" selectedIds={selectedPrintIds}>
        <PreHousingDisclosureDetailSection
          result={result}
        />
        </PrintSection>
      )}

      {/* 토지/건물 분리 양도차익 상세 */}
      {result.splitDetail && (() => {
        const selfOwns = result.splitDetail.selfOwns ?? "both";
        const landIsOwned = selfOwns !== "building_only";
        const buildingIsOwned = selfOwns !== "land_only";
        const ownerLabel = selfOwns === "building_only" ? "건물" : selfOwns === "land_only" ? "토지" : null;
        const colCls = (owned: boolean) =>
          owned ? "font-mono text-right" : "font-mono text-right text-muted-foreground/50 line-through";
        const headerCls = (owned: boolean) =>
          owned ? "font-medium text-center" : "font-medium text-center text-muted-foreground/50";
        return (
          <PrintSection id="split-detail" selectedIds={selectedPrintIds}>
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold">토지/건물 분리 양도차익</p>
                {ownerLabel && (
                  <span className="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-medium">
                    본인 신고분: {ownerLabel} (소령 §166⑥·§168②)
                  </span>
                )}
              </div>
            </div>
            <div className="text-xs grid grid-cols-3 gap-x-2 gap-y-1">
              <span />
              <span className={headerCls(landIsOwned)}>토지{!landIsOwned && " (타인 소유)"}</span>
              <span className={headerCls(buildingIsOwned)}>건물{!buildingIsOwned && " (타인 소유)"}</span>
              <span className="text-muted-foreground">양도가액</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.transferPrice.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.transferPrice.toLocaleString()}</span>
              <span className="text-muted-foreground">환산취득가</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.acquisitionPrice.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.acquisitionPrice.toLocaleString()}</span>
              <span className="text-muted-foreground">필요경비 (개산공제)</span>
              <span className={colCls(landIsOwned)}>
                {result.splitDetail.land.appraisalDeduction.toLocaleString()}
                {result.splitDetail.land.stdPriceAtAcq != null && (
                  <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {result.splitDetail.land.stdPriceAtAcq.toLocaleString()} × 3%</span>
                )}
              </span>
              <span className={colCls(buildingIsOwned)}>
                {result.splitDetail.building.appraisalDeduction.toLocaleString()}
                {result.splitDetail.building.stdPriceAtAcq != null && (
                  <span className="block text-muted-foreground/70 font-normal">취득시 기준시가 {result.splitDetail.building.stdPriceAtAcq.toLocaleString()} × 3%</span>
                )}
              </span>
              <span className="text-muted-foreground">양도차익</span>
              <span className={cn(colCls(landIsOwned), landIsOwned && "font-semibold")}>{result.splitDetail.land.gain.toLocaleString()}</span>
              <span className={cn(colCls(buildingIsOwned), buildingIsOwned && "font-semibold")}>{result.splitDetail.building.gain.toLocaleString()}</span>
              <span className="text-muted-foreground">보유연수</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.holdingYears}년</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.holdingYears}년</span>
              <span className="text-muted-foreground">장특공제율</span>
              <span className={colCls(landIsOwned)}>{(result.splitDetail.land.longTermRate * 100).toFixed(0)}%</span>
              <span className={colCls(buildingIsOwned)}>{(result.splitDetail.building.longTermRate * 100).toFixed(0)}%</span>
              <span className="text-muted-foreground">장특공제액</span>
              <span className={colCls(landIsOwned)}>{result.splitDetail.land.longTermDeduction.toLocaleString()}</span>
              <span className={colCls(buildingIsOwned)}>{result.splitDetail.building.longTermDeduction.toLocaleString()}</span>
            </div>
          </div>
          </PrintSection>
        );
      })()}

      {/* 건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더) */}
      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ assets: formData?.assets }} />
      </PrintSection>

      {/* 계산 과정 토글은 명세서 카드 내 'EngineStepsSubToggle'로 통합됨 (2026-05-12) */}

      {/* ⑦ 가업상속공제 §97의2④ 의제·일반 비교 결과 카드 */}
      {result.familyBusinessDetail && (
        <FamilyBusinessImputedComparisonCard detail={result.familyBusinessDetail} />
      )}

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* ⑦ 상업용건물·오피스텔 환산취득가 산정 근거 상세 (소령 §164⑧, §176조의2②2호) */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(result as any).commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          detail={(result as any).commercialBuildingValuationDetail}
          transferPrice={formData ? (parseAmount(formData.contractTotalPrice) || 0) : 0}
          acquisitionGain={result.transferGain ?? undefined}
          longTermDeduction={result.longTermHoldingDeduction ?? undefined}
          taxableIncome={
            typeof (result as unknown as Record<string, unknown>).taxableIncome === "number"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ? (result as any).taxableIncome
              : undefined
          }
          taxBase={result.taxBase ?? undefined}
          taxAmount={result.calculatedTax ?? undefined}
          localTax={result.localIncomeTax ?? undefined}
          totalTax={result.totalTax ?? undefined}
        />
      )}

      {/* ⑦ 부담부증여 상증법 평가 명세 + Phase 2 증여세 (sibling 카드) */}
      {/* F-2 (2026-05-12): result.warnings 직접 연결 (케이스 12 다주택 중과 안내 등) */}
      {result.transferBurdenedGiftBreakdown && (
        <BurdenedGiftDetailCard
          breakdown={result.transferBurdenedGiftBreakdown}
          propertyType={asset?.assetKind ?? formData?.assets?.[0]?.assetKind}
          warnings={result.warnings}
        />
      )}

      {/* ⑦ 일반건물(토지+건물 일괄) 환산취득가 산정 근거 상세 (소령 §176의2②, §163⑥, §102②) */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {(result as any).generalBuildingValuationDetail && (
        <GeneralBuildingValuationDetailCard
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          detail={(result as any).generalBuildingValuationDetail}
          totalTransferPrice={formData ? (parseAmount(formData.contractTotalPrice) || 0) : 0}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          holdingYears={(result as any).holdingYears ?? undefined}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          holdingMonths={(result as any).holdingMonths ?? undefined}
        />
      )}

      {/* 재개발/재건축 상세 (시행령 §166) — 사례 44 3분할 양도차익 + LTHD 3줄 */}
      {result.redevelopmentDetail && (
        <RedevelopmentDetailCard
          detail={result.redevelopmentDetail}
          subject={
            formData?.assets?.[0]?.assetKind === "right_to_move_in"
              ? "right"
              : (formData?.assets?.[0]?.redevSubject as "apt" | "right" | undefined) ?? "apt"
          }
          settlementDirection={
            (formData?.assets?.[0]?.redevSettlementDirection as "pay" | "receive" | undefined) ?? "pay"
          }
        />
      )}

      {/* ⑦ 장기임대주택 보유자 거주주택 비과세 특례 상세 (소령 §155⑳) — applied=false 시 미적용 사유도 표시 */}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}

      {/* ⑦ 감면·환산취득가 상세 4건 (자경농지·상속주택·신축주택·장기임대) */}
      <ReductionDetailCards result={result} />

      {/* 비로그인 안내 */}
      {onLoginPrompt && (
        <div className="print:hidden">
          <LoginPromptBanner hasPendingResult />
        </div>
      )}

      {/* 하단 버튼 */}
      <div className="flex gap-2 print:hidden">
        {onGoToFirst && (
          <button
            type="button"
            onClick={onGoToFirst}
            className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
          >
            ← 자산 목록
          </button>
        )}
        <button
          type="button"
          onClick={onBack}
          className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium hover:bg-muted/40 transition-colors"
        >
          이전
        </button>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          다시 계산하기
        </button>
        {showMultiTransferButton && onContinueToMulti && (
          <button
            type="button"
            onClick={onContinueToMulti}
            className="flex-1 rounded-lg bg-black py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 transition-colors"
          >
            동일연도 다른 양도건
          </button>
        )}
      </div>
    </div>
  );
}
