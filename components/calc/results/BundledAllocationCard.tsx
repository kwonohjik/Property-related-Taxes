"use client";

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
import { AmendmentResultCard } from "@/components/calc/results/transfer/AmendmentResultCard";
import {
  BurdenedGiftFilingFormSection,
  hasBurdenedGiftFilingForm,
} from "@/components/calc/results/transfer/BurdenedGiftFilingFormSection";
import { SaleSplitJudgmentBlock } from "@/components/calc/results/transfer/SaleSplitJudgmentBlock";
// 800줄 정책 — 일반건물 3-way 요약 표(사례 33)를 별도 파일로 분리(2026-08-11).
import { GeneralBuilding3WayTable } from "@/components/calc/results/transfer/GeneralBuilding3WayTable";
import {
  BuildingStdPriceReportSection,
  hasBuildingStdReport,
} from "@/components/calc/results/BuildingStdPriceReportSection";
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
import { Frac } from "@/components/calc/results/shared/FormulaParts";

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
    usedEstimatedAcquisition: false,
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
                <td className="py-1.5 pr-2 text-right font-mono">
                  {formatKRW(a.standardPriceAtTransfer)}
                </td>
                <td className="py-1.5 pr-2 text-right text-muted-foreground">
                  {(a.displayRatio * 100).toFixed(2)}%
                </td>
                <td className="py-1.5 text-right font-mono font-medium">
                  {formatKRW(a.allocatedSalePrice)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-semibold text-sm">
              <td className="pt-2 pr-2">합계</td>
              <td className="pt-2 pr-2 text-right font-mono">
                {formatKRW(apportionment.totalStandardAtTransfer)}
              </td>
              <td className="pt-2 pr-2 text-right">100%</td>
              <td className="pt-2 text-right font-mono">
                {formatKRW(apportionment.apportioned.reduce((s, a) => s + a.allocatedSalePrice, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/*
        §100③ 판정 (Phase 2) — **일반건물 구분양도 전용**.
        ⚠️ 일반건물은 자산 카드 2장을 만들어 aggregate 경로로 흐르므로 화면도 이 다자산 뷰다
           (`TransferTaxResultView`의 GB 상세 카드는 이 경로에서 렌더되지 않는다).
           표시를 붙일 곳을 여기로 잡지 않으면 **판정이 계산에만 반영되고 화면에는 안 보인다**.
      */}
      {aggregated.generalBuildingValuationDetail?.saleSplitJudgment && (
        <SaleSplitJudgmentBlock
          j={aggregated.generalBuildingValuationDetail.saleSplitJudgment}
          // 근거 문구는 엔진을 거치지 않는다(계획서 §15.3) — 폼에서 직접 읽는다.
          {...(formData.assets[0]?.saleSplitExemptionNote
            ? { exemptionNote: formData.assets[0].saleSplitExemptionNote }
            : {})}
        />
      )}

      {/*
        §163⑨ 상속 취득가액 직접 산정 — **파트별**(C1 전부 상속 · C2·C2′·C3 부분 상속).

        ⚠️ 표시를 여기 붙이는 이유는 바로 위 §100③ 블록과 같다 — 일반건물은 aggregate 경로로
           흐르므로 `GeneralBuildingValuationDetailCard`(TransferTaxResultView 전용)는
           **렌더되지 않는다**. 그쪽에만 라벨을 두면 계산에는 반영되고 화면에는 안 보인다.
      */}
      {(aggregated.generalBuildingValuationDetail?.acquisitionByInheritance ||
        aggregated.generalBuildingValuationDetail?.buildingAcquisitionByInheritance) && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-violet-900">
            상속 취득가액 직접 산정 — 소득세법 시행령 §163⑨
          </p>
          <p className="text-xs text-violet-800">
            상속개시일 현재 「상속세 및 증여세법」 §60~§66 평가액을 취득당시의 실지거래가액으로
            봅니다. 그 파트는 환산취득가·개산공제(§163⑥)를 적용하지 않습니다.
          </p>
          <ul className="text-xs text-violet-900 space-y-0.5 pt-1">
            {(["land", "building"] as const).map((kind) => {
              const inherited =
                kind === "land"
                  ? aggregated.generalBuildingValuationDetail?.acquisitionByInheritance
                  : aggregated.generalBuildingValuationDetail?.buildingAcquisitionByInheritance;
              const alloc = apportionment.apportioned.find((a) => a.assetKind === kind);
              if (!alloc) return null;
              return (
                <li key={kind} className="flex items-baseline justify-between gap-3">
                  <span>
                    {kind === "land" ? "토지분" : "건물분"} 취득가액
                    <span className="ml-1 text-violet-600">
                      {inherited ? "(상속개시일 평가액)" : "(상속 아님 — 종전 산정)"}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
                    {formatKRW(alloc.allocatedAcquisitionPrice)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/*
        §99-164-10 환산주택가격 — 취득당시 기준시가를 **덮어쓴 근거**.

        ⚠️ 여기 붙이는 이유는 바로 위 §163⑨ 블록과 같다 — 일반건물은 aggregate 경로로 흐르므로
           `GeneralBuildingValuationDetailCard`(TransferTaxResultView 전용)는 렌더되지 않는다.
           그쪽에만 두면 계산에는 반영되고 화면에는 안 보인다
           (memory `feedback_transfer_result_view_is_not_one` — 2회 재발한 함정).
      */}
      {aggregated.generalBuildingValuationDetail?.convertedHousing && (
        <div className="rounded-lg border border-violet-300 bg-violet-50/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-violet-900">
            환산주택가격 — 양도소득세 집행기준 99-164-10
          </p>
          <p className="text-xs text-violet-800">
            취득 당시 주택으로 개별주택가격이 고시된 뒤 상가로 용도변경했으므로, 최초공시주택가격을
            자산별 기준시가 비율로 환산해 <b>취득 당시 기준시가</b>로 사용합니다.
          </p>
          {(() => {
            const c = aggregated.generalBuildingValuationDetail!.convertedHousing!;
            const rows: Array<[string, number, string?]> = [
              ["최초공시주택가격", c.firstDisclosurePrice],
              ["취득 당시 토지 기준시가", c.acqLandStd],
              ["취득 당시 건물 기준시가", c.acqBuildingStd],
              ["최초공시 당시 토지 기준시가", c.firstDiscLand],
              ["최초공시 당시 건물 기준시가", c.firstDiscBuilding],
            ];
            return (
              <>
                <ul className="text-xs text-violet-900 space-y-0.5 pt-1">
                  {rows.map(([label, v]) => (
                    <li key={label} className="flex items-baseline justify-between gap-3">
                      <span>{label}</span>
                      <span className="font-mono tabular-nums whitespace-nowrap">
                        {formatKRW(v)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="pt-1 text-xs text-violet-800">
                  환산주택가격 = 최초공시주택가격 {formatKRW(c.firstDisclosurePrice)} ×{" "}
                  <Frac
                    top={`취득 당시 기준시가 합계 ${formatKRW(c.acqTotal)}`}
                    bottom={`최초공시 당시 기준시가 합계 ${formatKRW(c.firstDiscTotal)}`}
                  />
                </p>
                <ul className="text-xs text-violet-900 space-y-0.5 pt-1">
                  <li className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold">환산주택가격</span>
                    <span className="font-mono tabular-nums font-semibold whitespace-nowrap">
                      {formatKRW(c.converted)}
                    </span>
                  </li>
                  <li className="flex items-baseline justify-between gap-3">
                    <span>
                      토지분<span className="ml-1 text-violet-600">(취득 당시 기준시가 비율 안분)</span>
                    </span>
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      {formatKRW(c.convertedLand)}
                    </span>
                  </li>
                  <li className="flex items-baseline justify-between gap-3">
                    <span>건물분</span>
                    <span className="font-mono tabular-nums whitespace-nowrap">
                      {formatKRW(c.convertedBuilding)}
                    </span>
                  </li>
                </ul>
              </>
            );
          })()}
        </div>
      )}

      {/* §97② 2호 단서 swap 발동 표시 (일반건물 환산 자산총액 판정 — F10) */}
      {aggregated.swapApplied && aggregated.swapComparison && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-sm space-y-1">
          <p className="font-semibold text-amber-900">
            필요경비 swap 적용 — 소득세법 §97② 2호 단서
          </p>
          <p className="text-xs text-amber-800">
            환산취득가 + 개산공제 합 {formatKRW(aggregated.swapComparison.estimatedSide)}
            {" < "}자본적지출 + 양도비 {formatKRW(aggregated.swapComparison.directSide)}
          </p>
          <p className="text-xs text-amber-800">
            → 자본적지출 + 양도비 {formatKRW(aggregated.swapComparison.directSide)}을 필요경비로 적용(환산취득가 미차감, 자산별 비율 배분)
          </p>
        </div>
      )}

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
      <GeneralBuilding3WayTable aggregated={aggregated} />
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
          />
        ))}
      </div>

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
