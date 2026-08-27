"use client";

/**
 * 양도소득세 계산 결과 화면
 * ResultView + Row 헬퍼 컴포넌트
 */

import { useState, useMemo } from "react";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";
// LawArticleModal은 EngineStepsSubToggle로 이전되었으나, 감면 상세 카드 인용 링크화를 위해 재도입 (2026-06-15)
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { formatKRW, parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { CalculationWarningsCard } from "@/components/calc/results/shared/CalculationWarningsCard";
import { CrossEngine1045Notice } from "@/components/calc/shared/CrossEngine1045Notice";
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
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { Pre1990LandValuationDetailCard } from "@/components/calc/results/transfer/Pre1990LandValuationDetailCard";
import { FamilyBusinessImputedComparisonCard } from "@/components/calc/results/transfer/FamilyBusinessImputedComparisonCard";
import { ReductionDetailCards } from "@/components/calc/results/transfer/ReductionDetailCards";
import { resolveRuralSurtax } from "@/components/calc/results/transfer/reduction-eligible-income";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  BurdenedGiftFilingFormSection,
  hasBurdenedGiftFilingForm,
} from "@/components/calc/results/transfer/BurdenedGiftFilingFormSection";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import { extractRelevantBuildingStdSnapshots } from "@/lib/storage/use-auto-save-calculation";
import { resolveReceiveOnlyDisplay } from "@/components/calc/results/transfer/receive-only-display";
import {
  TRANSFER_PRINT_SECTIONS,
  type TransferPrintSectionId,
} from "@/lib/print/transfer-print-sections";

// ── 중과 유예 근거(basis) 표시용 기한 포맷 — API JSON 왕복 후 string 도달 가능(Date 직렬화) ──
function fmtDeadline(d: Date | string | undefined): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

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

  // receiveOnly(사례 46) — 신고단위 양도가액·양도일 보정.
  // 이월과세 비교 분기는 FilingFormTable에 redevSubject를 함께 넘겨 redev 공존을 상정하므로,
  // 시나리오 B 카드도 같은 leaf를 태운다(계획서 §6-3 지점 C).
  const receiveOnlyDisplay = resolveReceiveOnlyDisplay(
    result,
    transferPriceOverride ?? Number(formData?.contractTotalPrice ?? 0),
    formData?.transferDate ?? "",
  );

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
    if (hasBurdenedGiftFilingForm(result.transferBurdenedGiftBreakdown)) s.add("gift-filing-form");
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
              transferPrice={receiveOnlyDisplay.transferPrice}
              transferDate={receiveOnlyDisplay.transferDate}
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
                const ruralSurtax = resolveRuralSurtax(result);
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

        {/* 엔진 경고 — 종전에는 **부담부증여 카드에서만** 표시돼(:521) 일반 경로의 경고가
            화면 어디에도 나오지 않았다(§155⑳ 요건 미충족 안내·§155⑦3호 귀농 사후관리 등).
            부담부증여 카드가 뜨는 경우는 그쪽이 표시하므로 여기서는 제외해 중복을 막는다. */}
        {!result.transferBurdenedGiftBreakdown && (
          <CalculationWarningsCard warnings={result.warnings} />
        )}

        {/* 부분 비과세(고가주택) 근거 — 전액 비과세는 위 카드가 이미 exemptReason을 표시한다.
            어느 특례로 1세대1주택 의제가 성립했는지 남기지 않으면 12억 초과분만 과세된 이유를
            납세자가 확인할 수 없다. */}
        {!result.isExempt && result.exemptReason && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-sm dark:border-emerald-900/60 dark:bg-emerald-950/20">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              1세대1주택 특례 적용 — {result.exemptReason}
            </p>
            <p className="text-xs text-emerald-800 dark:text-emerald-400 mt-0.5">
              양도가액 12억원 초과분에 대해서만 과세됩니다 (소득세법 §89①3호·시행령 §160).
            </p>
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
            {/* ⑦ echo — 중과 유예 근거 목(가/나/다) + 나·다목 양도기한 */}
            {result.surchargeSuspensionBasis && (
              <p className="mt-1 text-xs text-blue-700 dark:text-blue-400">
                {result.surchargeSuspensionBasis === "a" &&
                  "근거: 2026-05-09까지 양도 (소득세법 시행령 §167의3①12의2 가목)"}
                {result.surchargeSuspensionBasis === "na" &&
                  `근거: 토지거래허가 경과조치 (나목) — 양도기한 ${fmtDeadline(result.surchargeSuspensionDeadline)} 이내 충족`}
                {result.surchargeSuspensionBasis === "da" &&
                  `근거: 매매계약 경과조치 (다목) — 양도기한 ${fmtDeadline(result.surchargeSuspensionDeadline)} 이내 충족`}
              </p>
            )}
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
            <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} nblSurchargeExcluded={result.nblSurchargeExcluded} />
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
          <Pre1990LandValuationDetailCard detail={result.pre1990LandValuationDetail} />
        )}

        {/* 비주택 → 주택 용도변경 §95⑤·⑥ 카드는 `ReductionDetailCards`로 이관했다(:하단).
            종전에는 여기서만 렌더돼 **일괄(bundled) 결과에서 사라졌다** — 엔진은
            `pickReductionDetails`로 자산별 breakdown에 값을 실어 보내는데 렌더러가 없었다.
            공용 컴포넌트를 재사용하므로 여기 인라인 렌더는 제거한다(단건 중복 렌더 방지). */}
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
      {/* 토지/건물 분리 양도차익 상세 */}
      {result.splitDetail && (
        <PrintSection id="split-detail" selectedIds={selectedPrintIds}>
          <SplitGainDetailSection
            splitDetail={result.splitDetail}
            assetKind={formData?.assets?.[0]?.assetKind}
            // §166⑧ 예외 근거는 엔진 미전송(계획서 §15.3) — 폼에서 직접 읽는다.
            {...(formData?.assets?.[0]?.saleSplitExemptionNote
              ? { exemptionNote: formData.assets[0].saleSplitExemptionNote }
              : {})}
          />
        </PrintSection>
      )}

      {/* 증여세 신고서 양식(별지 제10호) — 부담부증여 무상이전분.
          🔴 일반건물 일괄은 `BundledAllocationCard`가 종착지다 — 그쪽에도 같은 섹션이 있어야 한다. */}
      {hasBurdenedGiftFilingForm(result.transferBurdenedGiftBreakdown) && (
        <PrintSection id="gift-filing-form" selectedIds={selectedPrintIds}>
          <BurdenedGiftFilingFormSection breakdown={result.transferBurdenedGiftBreakdown} />
        </PrintSection>
      )}

      {/* 건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더) */}
      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ assets: formData?.assets }} />
      </PrintSection>

      {/* 계산 과정 토글은 명세서 카드 내 'EngineStepsSubToggle'로 통합됨 (2026-05-12) */}

      {/* ⑦ 가업상속공제 §97의2④ 의제·일반 비교 결과 카드 */}
      {result.familyBusinessDetail && (
        <FamilyBusinessImputedComparisonCard detail={result.familyBusinessDetail} />
      )}

      {/* §104⑤ 크로스 엔진 고지 — 비사업용 토지가 있을 때만(계획서 C-1 · R-5 좁은 노출).
          ⚠️ `surchargeType`은 부칙 §9270호 §14① 위기취득 배제 시 undefined가 되고
             `nonBusinessLandJudgmentDetail`은 `nonBusinessLandDetails` 제공 시만 채워지므로,
             비사토인데 안 뜨는 경우가 있다. **오탐보다 미탐이 낫다**는 R-5 방침상 의도된 것이다
             (§104⑤ 자체는 비사토와 무관하게 걸리며, 그 사실은 고지 본문이 적는다). */}
      {(result.surchargeType === "non_business_land" || result.nonBusinessLandJudgmentDetail?.isNonBusinessLand) && (
        <CrossEngine1045Notice from="real_estate" />
      )}

      {/* 면책 고지 */}
      <DisclaimerBanner />

      {/* ⑦ 상업용건물·오피스텔 환산취득가 산정 근거 상세 (소령 §164⑥, §176조의2②2호) */}
      {/* `as any` 제거(2026-07-28) — `TransferTaxResult.commercialBuildingValuationDetail`이
          실재하므로 캐스트가 불필요하다. 이 캐스트가 경계의 타입 검사를 꺼두고 있었던 탓에,
          카드가 엔진 타입을 로컬 재선언해 7개 필드가 누락된 상태가 컴파일 에러로 드러나지 않았다. */}
      {result.commercialBuildingValuationDetail && (
        <CommercialBuildingValuationDetailCard
          detail={result.commercialBuildingValuationDetail}
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
          swapApplied={result.swapApplied ?? undefined}
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
          {...(result.lthdExclusionReason ? { lthdExclusionReason: result.lthdExclusionReason } : {})}
        />
      )}

      {/* ⑦ 장기임대주택 보유자 거주주택 비과세 특례 상세 (소령 §155⑳) — applied=false 시 미적용 사유도 표시 */}
      {result.rentalHousingExceptionDetail && (
        <RentalHousingExceptionDetailCard detail={result.rentalHousingExceptionDetail} />
      )}

      {/* ⑦ 감면·환산취득가 상세 (자경농지·상속주택·신축주택·장기임대 + §95⑤ 용도변경 LTHD) */}
      <ReductionDetailCards
        result={result}
        calculatedTax={result.calculatedTax}
        taxBase={result.taxBase}
        longTermHoldingDeduction={result.longTermHoldingDeduction}
      />

      {/* 비로그인 안내 */}
      {onLoginPrompt && (
        <div className="print:hidden">
          <LoginPromptBanner hasPendingResult />
        </div>
      )}

      {/* 하단 버튼 — 입력 단계 네비와 통일 (컴팩트 nav + 글자폭 CTA) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          {onGoToFirst && (
            <NavButton direction="prev" label="자산 목록" onClick={onGoToFirst} />
          )}
          <NavButton direction="prev" label="이전" onClick={onBack} />
        </div>
        <div className="flex items-center gap-2">
          <CtaButton onClick={onReset}>다시 계산하기</CtaButton>
          {showMultiTransferButton && onContinueToMulti && (
            <CtaButton tone="outline" onClick={onContinueToMulti}>동일연도 다른 양도건</CtaButton>
          )}
        </div>
      </div>
    </div>
  );
}
