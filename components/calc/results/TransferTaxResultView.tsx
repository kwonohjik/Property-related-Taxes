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
import { PartialExemptBasisCard } from "@/components/calc/results/shared/PartialExemptBasisCard";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";
import { NonBusinessLandResultCard } from "@/components/calc/NonBusinessLandResultCard";
import { MultiHouseSurchargeDetailCard } from "@/components/calc/MultiHouseSurchargeDetailCard";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { resolveBgCarryoverSingleDisplay } from "@/components/calc/results/transfer/DetailedStatementBgFormulas";
import { bgRedevFilingTransferPrice } from "@/lib/tax-engine/burdened-gift-totals";
import { formatRate, downloadSelectedPdf } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { SelfBuiltPenaltyCard } from "@/components/calc/results/transfer/SelfBuiltPenaltyCard";
import { ParcelDisclosure } from "@/components/calc/results/transfer/ParcelDisclosure";
import { SingleDetailCards, hasSingleDetailCards } from "@/components/calc/results/transfer/SingleDetailCards";
import { CarryoverComparisonCard } from "@/components/calc/results/transfer/CarryoverComparisonCard";
import { CarryoverScenarioBFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioBFilingCard";
import { CarryoverScenarioAFilingCard } from "@/components/calc/results/transfer/CarryoverScenarioAFilingCard";
import { PreHousingDisclosureDetailSection } from "@/components/calc/results/transfer/PreHousingDisclosureDetailSection";
import { ExpropriationValuationCard } from "@/components/calc/results/transfer/ExpropriationValuationCard";
import { AuctionValuationCard } from "@/components/calc/results/transfer/AuctionValuationCard";
import { HousingExpropriationValuationCard } from "@/components/calc/results/transfer/HousingExpropriationValuationCard";
import { SplitLandExpropriationValuationCard } from "@/components/calc/results/transfer/SplitLandExpropriationValuationCard";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { isSaleSplitActual } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { isPhdApartment } from "@/components/calc/results/transfer/phd-housing-term";
import { Pre1990LandValuationDetailCard } from "@/components/calc/results/transfer/Pre1990LandValuationDetailCard";
import { PreDeemedPurchaseResultCard } from "@/components/calc/results/transfer/PreDeemedPurchaseResultCard";
import { resolveRuralSurtax } from "@/components/calc/results/transfer/reduction-eligible-income";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { OneHouseJudgmentProvenanceLine } from "@/components/calc/results/transfer/OneHouseJudgmentProvenanceLine";
import { SameDayOrderLine } from "@/components/calc/results/transfer/SameDayOrderLine";
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
import { highValueThresholdForDisplay } from "@/lib/calc/high-value-threshold-display";
import { FalseContractPriceNotice } from "@/components/calc/results/shared/FalseContractPriceNotice";

// ── 중과 유예 근거(basis) 표시용 기한 포맷 — API JSON 왕복 후 string 도달 가능(Date 직렬화) ──
/** 이월과세 서식 부제의 취득가액 — 소유자 분리면 본인 파트 값(엔진 echo `ownerSplitPart` · 계획서 V-4). 자산 전체 값은 본문 서식과 어긋난다. */
export function scenarioAcqLabel(s: { acquisitionPrice: number; ownerSplitPart?: { acquisitionPrice: number } }): string {
  return s.ownerSplitPart
    ? `취득가액 ${formatKRW(s.ownerSplitPart.acquisitionPrice)} (본인 소유 파트)`
    : `취득가액 ${formatKRW(s.acquisitionPrice)}`;
}

function fmtDeadline(d: Date | string | undefined): string {
  if (!d) return "";
  const s = typeof d === "string" ? d : d.toISOString();
  return s.slice(0, 10);
}

// ── Props ──────────────────────────────────────────────────────

interface Props {
  result: TransferTaxResult;
  onReset: () => void;
  onBack: () => void;
  onGoToFirst?: () => void;
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
    transferPriceOverride ?? parseAmount(formData?.contractTotalPrice),
    formData?.transferDate ?? "",
  );

  // 이월과세 단건 부담부증여 — 미채택 시나리오 요약 카드의 양도가액은 §159 슬롯(= 채무 인수액)이다. 폼 계약금액은 빈 칸이라 행이 그려지지 않았다
  // (양도가액은 A·B가 같다 — 계획서 `bg-carryover-scenario-b-acquisition-echo.plan.md` Q-3 a).
  const carryoverCardTransferPrice =
    resolveBgCarryoverSingleDisplay(result)?.transferPrice ?? bgRedevFilingTransferPrice(result) ?? receiveOnlyDisplay.transferPrice;

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
        inputData: {
          buildingStdSnapshots: extractRelevantBuildingStdSnapshots({ assets: formData?.assets }),
          // PHD(§164⑦) 결과 이름 — 화면과 같은 단일 정의(`isPhdApartment`). 표시 전용, 엔진·API 무관
          phdApartment: isPhdApartment(resolvedAsset),
        },
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
    // #062 — 이 카드들은 조건부라 하나도 안 뜰 수 있다. 그 판정은 아래 술어가 한다.
    if (hasSingleDetailCards(result)) s.add("detail-cards");
    if (result.preHousingDisclosureDetail) s.add("phd");
    if (result.splitDetail) s.add("split-detail");
    if (hasBurdenedGiftFilingForm(result.transferBurdenedGiftBreakdown)) s.add("gift-filing-form");
    if (hasBuildingStdReport({ assets: formData?.assets })) s.add("building-std-report");
    return s;
  }, [result, formData]);

  return (
    <div className="space-y-5">
      {/* 출력 항목 선택 패널 (선택 항목만 인쇄·PDF) */}
      {/*
        출처 한 줄 (P5-b-1) — 판정 메뉴에서 넘겨받았을 때만 뜬다.
        🔑 `PrintSection` **밖**이다 — 「이 세액이 어떤 사실에 근거하는가」는 선택 출력과
           무관하게 항상 인쇄돼야 한다(`DisclaimerBanner`와 같은 층위).
        🔑 `formData`에서 읽는다 — 엔진 result에 실으면 어댑터 화이트리스트가 침묵 strip한다.
      */}
      <OneHouseJudgmentProvenanceLine form={formData} />
      <SameDayOrderLine form={formData} />

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
            {/*
              🔴 종전에는 [A] 자리에 **언제나** 완전한 `FilingFormTable`이 `result`를 받았다.
                 그런데 `result`는 **채택된 시나리오**로 계산된 값이다
                 (`transfer-tax-carryover.ts`의 `adoptedInput`). B가 채택되면 A의 취득일·
                 보유기간 머리에 **B의 금액**이 담겨, 부제(A 취득가액)와 본문(B 취득가액)이
                 서로 모순되고 「보유 26년인데 장특공제율 6%(3년)」 같은 서식이 나왔다
                 (결과탭 코드리뷰 #023).
              ⇒ **채택된 쪽**이 전체 서식을 받고, 미채택 쪽은 자기 detail로 그린 요약 카드다.
            */}
            {adoptedA ? (
              <FilingFormTable
                result={result}
                formData={formData}
                asset={resolvedAsset}
                transferPriceOverride={transferPriceOverride}
                acquisitionDateLabel="(증여자 취득일)"
                acquisitionDateOverride={resolvedAsset?.carryover?.donorAcquisitionDate ?? ""}
                title="[A] 이월과세 적용"
                subtitle={`보유기간 ${carryoverDetail.scenarioA.holdingPeriodYears}년 (증여자 취득일 기산) · ${scenarioAcqLabel(carryoverDetail.scenarioA)}`}
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
            ) : (
              <CarryoverScenarioAFilingCard
                scenarioA={carryoverDetail.scenarioA}
                adopted={false}
                transferPrice={carryoverCardTransferPrice}
                transferDate={receiveOnlyDisplay.transferDate}
                donorAcquisitionDate={resolvedAsset?.carryover?.donorAcquisitionDate}
              />
            )}
            {adoptedA ? (
              <CarryoverScenarioBFilingCard
                scenarioB={carryoverDetail.scenarioB}
                adopted={false}
                transferPrice={carryoverCardTransferPrice}
                transferDate={receiveOnlyDisplay.transferDate}
                giftRegistryDate={resolvedAsset?.carryover?.giftRegistryDate}
              />
            ) : (
              <FilingFormTable
                result={result}
                formData={formData}
                asset={resolvedAsset}
                transferPriceOverride={transferPriceOverride}
                acquisitionDateLabel="(증여 등기접수일)"
                acquisitionDateOverride={resolvedAsset?.carryover?.giftRegistryDate ?? ""}
                title="[B] 이월과세 미적용"
                subtitle={`보유기간 ${carryoverDetail.scenarioB.holdingPeriodYears}년 (증여 등기접수일 기산) · ${scenarioAcqLabel(carryoverDetail.scenarioB)}`}
                adopted
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
            {/* 소득세법 §91② 범위 밖 고지 (결정 #48) — 비과세 결과 안의 짧은 안내 줄. 공용 술어·문구. */}
            <FalseContractPriceNotice
              transferDate={formData?.transferDate}
              isExempt={result.isExempt}
              className="mt-3"
            />
          </div>
        ) : result.amendmentDetail ? (
          <AmendmentResultCard
            detail={result.amendmentDetail}
            fullTotalTax={result.totalTax}
            /**
             * 🔴 **단건 부담부증여도 한정해야 한다** (2026-09-07 UI 리뷰).
             *    `totalScopeNote`는 이 문제를 막으려고 도입됐는데 저장소에서
             *    `BundledAllocationCard` **한 곳만** 넘기고 있었다. 그런데 주택·토지·건물·상가
             *    부담부증여는 route가 `mode: "single"`로 떨어져 **이 뷰가 종착지**이고,
             *    같은 화면에 `BurdenedGiftDetailCard`(증여세)가 함께 뜬다 —
             *    `result.totalTax`는 양도세 집계뿐이라 한정 없이는 증여세까지 포함한 금액으로 읽힌다.
             */
            {...(result.transferBurdenedGiftBreakdown ? { totalScopeNote: "양도세분" } : {})}
          />
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

        {/* 일체 주택 본인 신축 §114조의2 가산세(건물분) — 근거 산식·고지. echo 가 있을 때만 뜬다(Q-12 PR-3). */}
        <SelfBuiltPenaltyCard echo={result.selfBuiltHousingPenalty} />

        {/* 부분 비과세(고가주택) 근거 — 전액 비과세는 위 카드가 이미 exemptReason을 표시한다.
            어느 특례로 1세대1주택 의제가 성립했는지 남기지 않으면 기준금액 초과분만 과세된 이유를
            납세자가 확인할 수 없다.
            🔑 `isPartialExempt`로 가른다(OH-43) — 일반 경로 결과는 `isExempt:false`에 판정의
               `exemptReason`을 그대로 싣는다. §155⑳ 요건 미충족·부수토지 비과세 제외(G-2·G-3)처럼
               안분 없이 과세된 결과에서 「초과분에 대해서만 과세」라고 적으면 결과와 모순된다.
            기준금액은 엔진 STEP 라벨(`과세 양도차익 (9억 초과분)` 등)에서 읽고, 없으면 양도일로 고른다. */}
        <PartialExemptBasisCard
          result={result}
          fallbackThresholdLabel={highValueThresholdForDisplay(formData?.transferDate).label}
        />

        {/* 소득세법 §91② 범위 밖 고지 (결정 #48) — 부분 비과세·감면 결과. 전액 비과세는 위 카드 안에 이미 있다(경정 환급 카드는 예외). */}
        {(!result.isExempt || result.amendmentDetail?.correctionKind === "refund_claim") && (
          <FalseContractPriceNotice
            transferDate={formData?.transferDate}
            isExempt={result.isExempt}
            isPartialExempt={result.isPartialExempt}
            reductionAmount={result.reductionAmount}
          />
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
          <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1 dark:bg-amber-950/40">
            <p className="font-semibold text-amber-900 dark:text-amber-200">
              필요경비 swap 적용 — 소득세법 §97② 2호 단서
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
              환산취득가(또는 감정가액·매매사례가액) + 개산공제 {formatKRW(result.swapComparison.estimatedSide)}
              {" < "}자본적지출 + 양도비 {formatKRW(result.swapComparison.directSide)}
            </p>
            <p className="text-xs text-amber-800 dark:text-amber-200">
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
            <NonBusinessLandResultCard judgment={result.nonBusinessLandJudgmentDetail} nblSurchargeExcluded={result.nblSurchargeExcluded} nblSurchargeExcludedBy={result.nblSurchargeExcludedBy} />
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

        {result.preDeemedPurchaseDetail && <PreDeemedPurchaseResultCard detail={result.preDeemedPurchaseDetail} />}

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
          phdApartment={isPhdApartment(resolvedAsset)}
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
            isExempt={result.isExempt}
            // §166⑧ 예외 근거는 엔진 미전송(계획서 §15.3) — 폼에서 직접 읽는다.
            {...(formData?.assets?.[0]?.saleSplitExemptionNote
              ? { exemptionNote: formData.assets[0].saleSplitExemptionNote }
              : {})}
            // «구분 기재»를 골랐는가도 엔진 미전송이라 폼에서 읽는다(엔진 echo와 둘 다 참일 때만 안내).
            {...(isSaleSplitActual(formData?.assets?.[0]) ? { saleSplitActual: true } : {})}
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

      {/*
        ⑦ 상세 산출근거 카드 묶음.

        🔴 종전에는 이 블록들이 **`PrintSection` 밖**이라 「출력 항목 선택」이 전혀 걸리지 않았다.
           `PrintSection`은 미선택 시 `print:hidden`만 붙이므로(shared/PrintSection.tsx) 감싸지
           않은 블록은 선택과 무관하게 **항상 인쇄**된다 — 「신고서 양식 표」만 골라도 재개발
           §166 3분할·감면 산출근거 카드가 그대로 딸려 나왔다(결과탭 코드리뷰 #062).

        ⚠️ 기존 `calculation` 안으로 **옮기지 않고** 이 자리에서 감쌌다 — 옮기면 화면 순서가
           바뀐다. 새 leaf라 `data-print-id`도 유일하다(중복이면 Playwright strict 로케이터가 깨진다).
      */}
      {hasSingleDetailCards(result) && (
      <PrintSection id="detail-cards" selectedIds={selectedPrintIds} className="space-y-5">
      <SingleDetailCards result={result} formData={formData} asset={asset} />
      </PrintSection>
      )}

      {/* 면책 고지 — 선택 출력과 무관하게 **항상** 인쇄되어야 하므로 PrintSection 밖이다. */}
      <DisclaimerBanner />

      {/* 비로그인 안내 */}
      {/* ⛔ 로그인 안내 배너를 되살리지 말 것 (2026-09-05 · 코드리뷰 Q30).
          「로그인하면 이력 저장·PDF 가능」은 **사실이 아니다** — 이력은 로컬 IndexedDB로
          일원화됐고(`proxy.ts:4`에서 /api/history 보호 라우트 제거), PDF는 클라이언트에서
          생성한다(같은 화면의 PDF 버튼이 비로그인에서도 동작한다). 로그인이 실제로 무엇을
          더 주는지가 생기면 그때 그 사실을 쓴다. `onLoginPrompt` prop도 함께 제거했다. */}
      {/* 하단 버튼 — 입력 단계 네비와 통일 (컴팩트 nav + 글자폭 CTA) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          {onGoToFirst && (
            <NavButton direction="prev" label="자산 목록" onClick={onGoToFirst} />
          )}
          <NavButton direction="prev" label="이전" onClick={onBack} />
        </div>
        <div className="flex items-center gap-2">
          {/* 폐기(확인 필수)와 복귀를 라벨대로 분리 — Q25. 「다시 계산하기」는 규약(CLAUDE.md:13)
              대로 마지막 입력 단계 복귀이고, 전체 초기화는 아래 전용 버튼이 확인을 받고 수행한다. */}
          <RestartFromScratchButton onReset={onReset} />
          {showMultiTransferButton && onContinueToMulti && (
            <CtaButton tone="outline" onClick={onContinueToMulti}>동일연도 다른 양도건</CtaButton>
          )}
          <CtaButton onClick={onBack}>다시 계산하기</CtaButton>
        </div>
      </div>
    </div>
  );
}
