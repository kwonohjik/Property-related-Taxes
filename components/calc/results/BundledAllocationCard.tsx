"use client";

import { penaltyMethodSums } from "@/lib/tax-engine/penalty-method-of-properties";
import { gbResultDonorBuiltEchoes } from "@/lib/tax-engine/gb-result-donor-built-echoes";
import { selfBuiltResultEchoes } from "@/lib/tax-engine/transfer-tax-self-built-display";
import { aggregateAcqModes, allEstimated } from "@/components/calc/results/transfer/split-acq-text";
import { DisclaimerBanner } from "@/components/calc/shared/DisclaimerBanner";
import { HomeButton } from "@/components/calc/shared/HomeButton";
import { NavButton, CtaButton } from "@/components/calc/shared/WizardNav";
import { RestartFromScratchButton } from "@/components/calc/shared/RestartFromScratchButton";
import type { BundledApportionmentResult } from "@/lib/tax-engine/bundled-sale-apportionment";
import type { AggregateTransferResult } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import { LawArticleModal } from "@/components/ui/law-article-modal";
import { FilingFormTable } from "@/components/calc/results/transfer/FilingFormTable";
import { DetailedCalculationStatementCard } from "@/components/calc/results/transfer/DetailedCalculationStatementCard";
import { BurdenedGiftDetailCard } from "@/components/calc/results/transfer/BurdenedGiftDetailCard";
import { CarryoverDonorBuiltPenaltyCard } from "@/components/calc/results/transfer/CarryoverDonorBuiltPenaltyCard";
import { GbBurdenedGiftCarryoverCard } from "@/components/calc/results/transfer/GbBurdenedGiftCarryoverCard";
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import {
  BurdenedGiftFilingFormSection,
  hasBurdenedGiftFilingForm,
} from "@/components/calc/results/transfer/BurdenedGiftFilingFormSection";
import { isSaleSplitActual } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { assetOfProperty } from "@/components/calc/results/transfer/sale-split-unentered-notice";
import { isPhdApartment } from "@/components/calc/results/transfer/phd-housing-term";
import { GbResultBlocks } from "@/components/calc/results/transfer/GbResultBlocks";
import { gbBlockViewsOf } from "@/components/calc/results/transfer/gb-result-block-views";
// 800줄 정책 — 일반건물 3-way 요약 표(사례 33)를 별도 파일로 분리(2026-08-11).
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
import { OneHouseJudgmentProvenanceLine } from "@/components/calc/results/transfer/OneHouseJudgmentProvenanceLine";
import { FalseContractPriceNoticeForItems } from "@/components/calc/results/shared/FalseContractPriceNotice";
import { SameDayOrderLine } from "@/components/calc/results/transfer/SameDayOrderLine";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { CalculationWarningsCard } from "./shared/CalculationWarningsCard";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  TRANSFER_PRINT_SECTIONS,
  type TransferPrintSectionId,
} from "@/lib/print/transfer-print-sections";
import { downloadSelectedPdf } from "@/components/calc/results/transfer/TransferTaxResultViewHelpers";
import { extractRelevantBuildingStdSnapshots } from "@/lib/storage/use-auto-save-calculation";
import { useMemo, useState } from "react";

interface Props {
  apportionment: BundledApportionmentResult;
  aggregated: AggregateTransferResult;
  /**
   * propertyId → 지분율(분자/분모) 매핑 (선택).
   * 지분 단계취득 자산의 결과 카드에 "지분 X%" 라벨 표시용.
   * 단독 소유(100/100)는 미포함 또는 포함되어도 PropertyCard에서 미표시.
   */
  ownershipMap?: Map<string, { numerator: number; denominator: number }>;
  /** 마법사 폼 데이터 — 신고서 양식 표 자산별 머리 정보(취득일/거주기간 등) 표시용 */
  formData: TransferFormData;
  /** 부담부증여 §159 산정 명세 (일반건물 + 부담부증여 모드에서만 — 증여세 통합 결과 포함). */
  transferBurdenedGiftBreakdown?: import("@/lib/tax-engine/types/transfer-burdened-gift.types").TransferBurdenedGiftBreakdown;
  onBack?: () => void;
  onReset?: () => void;
}

/**
 * AggregateTransferResult → TransferTaxResult 어댑팅 (FilingFormTable 호환).
 * `aggregate` prop과 함께 호출하므로 result는 합계 보조용. `aggregate` 모드가 우선 적용되어
 * mixed-use/split 분기는 발동하지 않음.
 *
 * MultiTransferTaxResultView·BundledAllocationCard·DetailedCalculationStatementCard에서 공유.
 */
export function aggregateToFilingResult(a: AggregateTransferResult): TransferTaxResult {
  return {
    isExempt: false,
    transferGain: a.totalTransferGain,
    taxableGain: a.totalTransferGain,
    // 자산별 산정방식 echo에서 파생 — 종전 상수 `false`는 환산 자산이 섞여도 「실제 거래가액」으로 읽혔다(G-4).
    // 집계에는 단일 플래그가 없다(전부 환산일 때만 true) — 소제목은 `aggregateAcqModes`가 직접 정한다.
    usedEstimatedAcquisition: allEstimated(aggregateAcqModes(a.properties, a.generalBuildingValuationDetail)),
    longTermHoldingDeduction: a.totalLongTermHoldingDeduction,
    /*
     * 🔴 종전에는 0 하드코딩이라 상세명세서가 「과세대상 양도차익 × **0%**」로 표시했다(#071).
     *   집계는 자산마다 공제율이 달라 단일 rate가 없으므로 **실효 blended rate**를 싣는다 —
     *   겸용 어댑터가 이미 쓰는 방식이다(`MixedUseResultCardAdapter.ts:61`).
     */
    longTermHoldingRate:
      a.totalTransferGain > 0 ? a.totalLongTermHoldingDeduction / a.totalTransferGain : 0,
    lthdStartDate: new Date(0), // aggregateToFilingResult mock: 단건 결과 합산 표시용, 실값 미사용

    basicDeduction: a.basicDeduction,
    taxBase: a.taxBase,
    /*
     * 세율군이 **하나뿐이면** 그 군의 세율이 곧 신고단위 세율이다. 여럿이면 단일 세율이
     * 존재하지 않으므로 0으로 두고, 표시부가 「자산별 세율 상이」로 분기한다
     * (실효율을 넣으면 「과세표준 × 세율 − 누진공제」 산식이 산술적으로 거짓이 된다).
     */
    appliedRate: a.groupTaxes.length === 1 ? a.groupTaxes[0].appliedRate : 0,
    surchargeRate: a.groupTaxes.length === 1 ? a.groupTaxes[0].surchargeRate : undefined,
    progressiveDeduction: a.groupTaxes.length === 1 ? a.groupTaxes[0].progressiveDeduction ?? 0 : 0,
    calculatedTax: a.calculatedTax,
    isSurchargeSuspended: false,
    reductionAmount: a.reductionAmount,
    determinedTax: a.determinedTax,
    penaltyTax: a.penaltyTax,
    penaltyBase: 0, // 어댑터: 합계 카드 표시용으로 자산별 penaltyBase는 BundledAllocationCard에서 별도 합산
    // §114조의2 산정방식 — 감정가액 건물 파트만 있으면 상세명세서 라벨을 「감정가액」으로(Q-13). 섞여 있으면 종전 표기(환산취득가액) 유지.
    ...((() => { const m = penaltyMethodSums(a.properties); return m.appraisal.tax > 0 && m.estimated.tax === 0; })() ? { penaltyMethod: "appraisal" as const } : {}),
    // 카드별 증여자 신축·증축 §114조의2 echo — 어댑터가 싣지 않으면 상세명세서·PDF 가 증여자 신축 근거를 읽을 수 없다(PR-5a).
    ...((() => { const e = gbResultDonorBuiltEchoes(a.properties, a.donorBuiltPenalty); return e.length > 0 ? { donorBuiltPenaltyEchoes: e } : {}; })()),
    // 카드별 일체 주택 본인 신축 §114조의2(건물분) echo — 어댑터가 싣지 않으면 상세명세서·신고서·PDF 가 건물분 근거를 읽을 수 없다(Q-12 PR-3).
    ...((() => { const e = selfBuiltResultEchoes(a.properties); return e.length > 0 ? { selfBuiltPenaltyEchoes: e } : {}; })()),
    // `a.penaltyTax`는 국기법분까지 합한 **총액**이라 지방소득세 base로 못 쓴다.
    // 엔진이 실제로 base에 넣은 §114조의2분 echo를 그대로 승계한다.
    localTaxPenalty: a.buildingPenaltyTax ?? 0,
    localIncomeTax: a.localIncomeTax,
    // 집계 엔진은 농특세를 이미 총액(소득금액차감분 + 세액감면분)으로 노출한다.
    ruralSurtax: a.ruralSurtax,
    totalTax: a.totalTax,
    steps: a.steps,
    // UI 자산별 산식 인라인 표시용 — 사례 31·33 일반건물 일괄 모드만 채워짐.
    generalBuildingValuationDetail: a.generalBuildingValuationDetail,
  };
}

// ─── 기본 행 ──────────────────────────────────────────────────


// ─── 카드·요약 서브 컴포넌트 — BundledAllocationSubCards.tsx로 분리 (800줄 정책) ───
import { PropertyCard, AggregatedTaxSummary } from "./BundledAllocationSubCards";


// ─── 메인 컴포넌트 ────────────────────────────────────────────

export function BundledAllocationCard({ apportionment, aggregated, ownershipMap, formData, transferBurdenedGiftBreakdown, onBack, onReset }: Props) {
  const gbViews = useMemo(() => gbBlockViewsOf(aggregated, apportionment, formData), [aggregated, apportionment, formData]);
  /**
   * 출력 항목 선택 — 단건(`TransferTaxResultView`)과 동일한 패널.
   * 일반건물·일괄양도는 이 카드가 결과뷰 종착지인데 종전에는 패널 자체가 없어
   * 인쇄·PDF를 항목별로 고를 수 없었다(건물 기준시가 계산서 포함 — 2026-08-11 사용자 제보).
   */
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  const [pdfBusy, setPdfBusy] = useState(false);

  const availablePrintIds = useMemo<Set<TransferPrintSectionId>>(() => {
    const s = new Set<TransferPrintSectionId>([
      "form-table",
      "detailed-statement",
      "calculation",
      // #062 — 「양도가액 안분」 표는 일괄에서 **항상** 렌더되므로 조건 없이 등록한다.
      "allocation",
    ]);
    if (hasBurdenedGiftFilingForm(transferBurdenedGiftBreakdown)) s.add("gift-filing-form");
    if (hasBuildingStdReport({ assets: formData.assets })) s.add("building-std-report");
    return s;
  }, [formData, transferBurdenedGiftBreakdown]);

  const handlePrintPdf = (pdfSections: string[]) =>
    downloadSelectedPdf(
      {
        taxType: "transfer",
        taxTypeLabel: "양도소득세",
        // 합산 결과를 단건 result 형태로 어댑팅(신고서 표와 같은 어댑터 — 단일 소스).
        resultData: aggregateToFilingResult(aggregated) as unknown as Record<string, unknown>,
        // 건물 기준시가 계산서 PDF는 inputData.buildingStdSnapshots에서 재유도.
        inputData: { buildingStdSnapshots: extractRelevantBuildingStdSnapshots({ assets: formData.assets }) },
        filenamePrefix: "양도소득세_계산결과",
      },
      pdfSections,
      setPdfBusy,
    );

  return (
    <div className="space-y-6">
      {/* 자산별 경고 — 집계 엔진이 단건 warnings를 자산 라벨과 함께 모은다(R-5).
          종전에는 일괄양도 결과에 경고 카드가 **아예 없었다**. */}
      <CalculationWarningsCard warnings={aggregated.warnings} />

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
      {/*
        「양도가액 안분」 표 + 취득가액 산정 근거 묶음.

        🔴 종전에는 이 블록들이 **`PrintSection` 밖**이라 「출력 항목 선택」이 전혀 걸리지 않았다.
           `PrintSection`은 미선택 시 `print:hidden`만 붙이므로 감싸지 않은 블록은 선택과
           무관하게 **항상 인쇄**된다 — 「신고서 양식 표」만 골라도 일괄 결과의 핵심 표인
           「양도가액 안분」·§100③ 판정·환산주택가격 블록이 그대로 딸려 나왔다(#062).

        ⚠️ 아래 `calculation` 안으로 **옮기지 않고** 이 자리에서 감쌌다 — 옮기면 안분 표가
           신고서 양식 표 **뒤로** 밀려 일괄 결과의 읽는 순서가 뒤집힌다.
      */}
      <PrintSection id="allocation" selectedIds={selectedPrintIds} className="space-y-6">
      {/* 부담부증여 §159·증여세 통합 명세 (일반건물 부담부증여 모드 전용) */}
      {transferBurdenedGiftBreakdown && (
        <BurdenedGiftDetailCard
          breakdown={transferBurdenedGiftBreakdown}
          /**
           * 종전에는 `"general_building"` 하드코딩이었다 — 이 슬롯을 일반건물 부담부증여
           * 경로만 쓰던 시절의 값이다. 축 B(지분 분할 취득 × 부담부증여, 2026-09-03)가
           * 같은 슬롯을 쓰면서 **주택·토지도 도달**하므로 자산 종류에서 파생한다.
           */
          propertyType={formData.assets[0]?.assetKind}
          /**
           * 이 명세는 주 자산의 것이다. 주 자산이 §166 자산(원조합원 입주권 등)이면 인가 전 분과 합산 신고서의 취득가액
           * (엔진 표시 echo — §166 역산 정본)을 잇는다.
           */
          redevFilingAcquisition={(() => {
            const primary = aggregated.properties.find((p) => p.propertyId === "primary");
            return primary?.redevelopmentDetail ? primary.acquisitionPrice : undefined;
          })()}
        />
      )}

      {/* 안분 결과 */}
      <div className="rounded-lg border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-base">양도가액 안분</h3>
          <LawArticleModal legalBasis={apportionment.legalBasis} />
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="pb-1 pr-2 text-left font-normal">구분</th>
              <th className="pb-1 pr-2 text-right font-normal">기준시가</th>
              <th className="pb-1 pr-2 text-right font-normal">비율</th>
              <th className="pb-1 text-right font-normal">안분 양도가액</th>
            </tr>
          </thead>
          <tbody>
            {apportionment.apportioned.map((a) => (
              <tr key={a.assetId} className="border-b last:border-0 text-sm">
                <td className="py-1.5 pr-2">{a.assetLabel}</td>
                <td className="py-1.5 pr-2 text-right font-mono tabular-nums">
                  {formatKRW(a.standardPriceAtTransfer)}
                </td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">
                  {(a.displayRatio * 100).toFixed(2)}%
                </td>
                <td className="py-1.5 text-right font-mono tabular-nums font-medium">
                  {formatKRW(a.allocatedSalePrice)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-sm">
              <td className="pt-2 pr-2">합계</td>
              <td className="pt-2 pr-2 text-right font-mono tabular-nums">
                {formatKRW(apportionment.totalStandardAtTransfer)}
              </td>
              <td className="pt-2 pr-2 text-right">100%</td>
              <td className="pt-2 text-right font-mono tabular-nums">
                {formatKRW(apportionment.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* 일반건물 결과 카드 블록 6종 — 일반건물 한 물건분씩. 함께 양도는 자산마다 소제목 아래 반복한다(`gb-bundled-result-blocks.plan.md`). */}
      {gbViews.map((v) => (
        <GbResultBlocks key={v.assetId ?? "single"} view={v} />
      ))}

      </PrintSection>

      {/* 합산 신고서 양식 — 단건과 동일한 32행, 합계 + 자산별 컬럼 */}
      {(() => {
        // landNatureMap: propertyId → "appurtenant" | "standalone" (토지 자산 성격 라벨 suffix용)
        const landNatureMap = new Map<string, "appurtenant" | "standalone">();
        for (const p of aggregated.properties) {
          const asset =
            p.propertyId === "primary"
              ? formData.assets[0]
              : formData.assets.find((a) => a.assetId === p.propertyId);
          if (asset?.assetKind === "land" && asset.landNature) {
            landNatureMap.set(p.propertyId, asset.landNature);
          }
        }
        const aggregateMeta = {
          properties: aggregated.properties,
          aggregated,
          ownershipMap,
          landNatureMap: landNatureMap.size > 0 ? landNatureMap : undefined,
        };
        // 부담부증여 §159 배지·결과 카드 통합 — adapt 후 breakdown 추가 주입.
        const adaptedResult = {
          ...aggregateToFilingResult(aggregated),
          transferBurdenedGiftBreakdown,
        };
        // 일괄양도 합산 모드: aggregate prop이 deriveColumns에서 우선 적용되어 redev 분기 미진입.
        // 재개발 입주권 자산이 포함된 경우를 위해 props는 전달하되 aggregate 모드에서 자동 무시.
        const primaryAsset = formData.assets[0];
        const hasRedev = !!adaptedResult.redevelopmentDetail;
        return (
          <>
            <PrintSection id="form-table" selectedIds={selectedPrintIds}>
            <FilingFormTable
              result={adaptedResult}
              formData={formData}
              aggregate={aggregateMeta}
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
            </PrintSection>
            {/* ── 계산결과 상세명세서 (다건 모드) ── */}
            <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
              <DetailedCalculationStatementCard
                result={adaptedResult}
                formData={formData}
                asset={formData.assets[0]}
                aggregate={aggregateMeta}
              />
            </PrintSection>
          </>
        );
      })()}

      {/* 자산별 세액 (요약 카드) + 합산 과세 내역 = 출력 항목 「핵심 결과·계산 내역」 */}
      <PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-6">
      {/* 일반건물 3-way 요약 표 (사례 33 증축 케이스 — 토지·건물1·건물2).
          🔴 종전에는 PrintSection 밖이라 선택과 무관하게 항상 인쇄됐다(#062).
             신고서 표 **뒤**에 있어 여기로 옮겨도 읽는 순서가 바뀌지 않는다. */}
      {gbViews.map((v) => (
        <GeneralBuilding3WayTable key={v.assetId ?? "single"} aggregated={aggregated} view={v} />
      ))}
      {/**
        수정신고·경정청구 (국세기본법 §45·§45의2).

        📌 **렌더 지점은 여기 한 곳뿐이다.** 종전에는 부모(`TransferTaxCalculator`)가
           `<BundledAllocationCard>` 바로 위에서 띄웠는데, 그 자리는 `PrintSection` **바깥**이라
           정정 카드가 **인쇄·PDF에 들어가지 않았다**. 단건 뷰는 `calculation` 그룹 **안**에 두므로
           (`TransferTaxResultView.tsx:309·321`) 경로 간 비대칭이었다 ⇒ 이리로 옮겼다.

        ⛔ 부모에 다시 추가하지 말 것 — 카드가 **두 번** 뜨고 `data-testid="amendment-result"`가
           비유일해져 Playwright strict 로케이터가 깨진다(2026-08-27 실제로 겪었다).
      */}
      {aggregated.amendmentDetail && (
        <AmendmentResultCard
          detail={aggregated.amendmentDetail}
          fullTotalTax={aggregated.totalTax}
          /* 부담부증여는 같은 화면에 증여세가 함께 뜬다 — `aggregated.totalTax`는 양도세분뿐이라 한정한다. */
          {...(transferBurdenedGiftBreakdown ? { totalScopeNote: "양도세분" } : {})}
        />
      )}

      <div className="space-y-3">
        <h3 className="font-semibold text-base">자산별 계산 결과</h3>
        {aggregated.properties.map((p) => (
          <PropertyCard
            key={p.propertyId}
            breakdown={p}
            ownership={ownershipMap?.get(p.propertyId)}
            assetKind={
              apportionment.apportioned.find((a) => a.assetId === p.propertyId)?.assetKind
            }
            // §166⑧ 예외 근거는 엔진을 거치지 않으므로(계획서 §15.3) 폼에서 **자산별로** 찾아 넘긴다.
            {...(() => {
              const note = formData.assets.find((a) => a.assetId === p.propertyId)?.saleSplitExemptionNote;
              return note ? { exemptionNote: note } : {};
            })()}
            // «구분 기재»를 골랐는가도 엔진 미전송이라 같은 경로로 읽는다 — 첫 자산은 propertyId가 "primary"다.
            {...(isSaleSplitActual(
              p.propertyId === "primary" ? formData.assets[0] : formData.assets.find((a) => a.assetId === p.propertyId),
            )
              ? { saleSplitActual: true }
              : {})}
            // PHD(§164⑦ 환산) 주택 종류(단독·다가구/공동주택)도 엔진 미전송(표시 축)이라 같은 경로로 읽는다 — 한도 초과 분리 카드 id(`__appurtenant`/`__excess`)까지 해석하는 단일 정의.
            phdApartment={isPhdApartment(assetOfProperty(p.propertyId, formData, undefined))}
            // 일괄은 단건과 같은 폼 — 엔진 detail의 행 id(`houseId`)는 이 명부를 가리킨다(route 5-a 주 자산 = `...engineInput`).
            houses={formData.houses}
          />
        ))}
      </div>

      {/* 소득세법 §91② 범위 밖 고지 (결정 #48) — 일괄양도의 주택 단위 결과도 「비과세」를 표시하므로 같은 술어·문구로 붙인다. */}
      <FalseContractPriceNoticeForItems
        items={aggregated.properties.map((p) => ({
          label: p.propertyLabel,
          transferDate: formData.transferDate,
          isExempt: p.isExempt,
          isPartialExempt: p.isPartialExempt,
          reductionAmount: p.reductionAmount,
        }))}
      />

      {/* 일반건물 부담부증여 × 이월과세 [A]/[B] 비교(F27 PR-4) — echo 가 없으면 렌더하지 않는다. */}
      <GbBurdenedGiftCarryoverCard detail={aggregated.burdenedGiftCarryoverDetail} />
      {/* 함께 부담부증여 묶음은 일반건물 자산마다(PR-1), 지분 분할 취득은 지분마다(PR-2) 한 장 — 비교 단위 하나 = 카드 하나. */}
      {Object.entries(aggregated.burdenedGiftCarryoverUnits ?? {}).map(([key, unit]) => (
        <GbBurdenedGiftCarryoverCard key={key} detail={unit} assetLabel={unit.assetLabel} />
      ))}

      {/* 일반건물 부담부증여 × 이월과세 × 당초 증여자 신축·증축 §114조의2 근거(PR-5c) — 단건 `CarryoverComparisonCard` 와 같은 카드·같은 문구 정본. echo 가 없으면 렌더하지 않는다. */}
      <CarryoverDonorBuiltPenaltyCard echo={aggregated.donorBuiltPenalty} />

      {/* 합산 과세 내역 (납부세액 요약 대체) */}
      <AggregatedTaxSummary aggregated={aggregated} />
      </PrintSection>

      {/*
        건물 기준시가 계산서 (모달 스냅샷 재유도 — 스냅샷 있을 때만 렌더)

        🔴 일반건물은 토지·건물 카드로 분해돼 **bundled 결과**로 오므로 이 카드가 종착지다.
           종전에는 단건(`TransferTaxResultView`)·겸용·상속·증여 뷰에만 배선돼 있어,
           「2시점 건물기준시가 일괄 계산」으로 스냅샷을 저장해도 일반건물에서는 화면·인쇄·PDF
           어디에도 계산서가 나오지 않았다(2026-08-11 사용자 제보).
      */}
      {/* 증여세 신고서 양식(별지 제10호) — 부담부증여 무상이전분. 기준시가 계산서 바로 위.
          🔴 일반건물 부담부증여는 route가 `mode: "bundled"`로 분기해 이 카드가 종착지다 —
             단건 뷰(`TransferTaxResultView`)에만 배선하면 여기서 통째로 사라진다
             (2026-08-12 사용자 제보로 발견. 「건물 기준시가 계산서」가 2026-08-11에 겪은 것과 같은 실패). */}
      {hasBurdenedGiftFilingForm(transferBurdenedGiftBreakdown) && (
        <PrintSection id="gift-filing-form" selectedIds={selectedPrintIds}>
          <BurdenedGiftFilingFormSection breakdown={transferBurdenedGiftBreakdown} />
        </PrintSection>
      )}

      <PrintSection id="building-std-report" selectedIds={selectedPrintIds}>
        <BuildingStdPriceReportSection inputData={{ assets: formData.assets }} />
      </PrintSection>

      {/* 🔴 면책 고지 — 종전에는 이 화면(다자산 일괄양도의 **종착지**)에만 통째로 없었다
          (2026-09-07 대장 재대조 · #33). 단건(`TransferTaxResultView:722`)·겸용·다건은 모두 있다.
          `print:hidden`을 붙이지 않아 PDF에도 함께 남는다 — 고지의 존재 이유가 그것이다. */}
      <DisclaimerBanner />

      {/* 하단 네비게이션 버튼 — 입력 단계 네비와 통일 (컴팩트 nav + 글자폭 CTA) */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex items-center gap-2">
          <HomeButton />
          {onBack && <NavButton direction="prev" label="이전 화면" onClick={onBack} />}
        </div>
        {/* 폐기(확인 필수)와 복귀를 라벨대로 분리 — Q25 (단건 결과뷰와 동일 규약). */}
        <div className="flex items-center gap-2">
          {onReset && <RestartFromScratchButton onReset={onReset} />}
          {onBack && <CtaButton onClick={onBack}>다시 계산하기</CtaButton>}
        </div>
      </div>
    </div>
  );
}
