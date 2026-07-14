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
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import { useState, useMemo } from "react";
import { PrintSelectionPanel } from "@/components/calc/results/PrintSelectionPanel";
import { PrintSection } from "@/components/calc/results/shared/PrintSection";
import {
  MIXED_USE_PRINT_SECTIONS,
  type MixedUsePrintSectionId,
} from "@/lib/print/mixed-use-print-sections";

/** MixedUseGainBreakdown → TransferTaxResult 어댑터 (FilingFormTable 호환) */
export function mixedUseToFilingResult(b: MixedUseGainBreakdown): TransferTaxResult {
  const t = b.total;
  const localTax = t.localTax;
  return {
    isExempt: false,
    transferGain: b.housingPart.transferGain + b.commercialPart.transferGain,
    taxableGain: b.housingPart.proratedTaxableGain + b.commercialPart.transferGain,
    usedEstimatedAcquisition: true,
    longTermHoldingDeduction: b.housingPart.longTermDeductionAmount + b.commercialPart.longTermDeductionAmount,
    longTermHoldingRate: 0,
    lthdStartDate: new Date(0), // mixed-use 합산 mock: 표시용
    basicDeduction: t.basicDeduction,
    taxBase: t.taxBase,
    appliedRate: t.appliedRate,
    progressiveDeduction: t.progressiveDeduction,
    calculatedTax: t.taxByBasicRate,
    isSurchargeSuspended: false,
    reductionAmount: 0,
    determinedTax: t.transferTax,
    penaltyBase: 0, // 겸용주택 어댑터: 가산세 미적용 경로 (MixedUseGainBreakdown에 penaltyBase 없음)
    penaltyTax: 0,
    localIncomeTax: localTax,
    totalTax: t.totalPayable,
    // b.steps는 MixedUseStep[] (id/title/legalBasis/values 구조)로 CalculationStep[]과
    // 형태가 달라 재사용 불가. 명세서 카드는 mixedUseDetail·result 필드로 값을 뽑고
    // formula는 fallback을 쓰므로 빈 배열로 전달 (findStepByLabel 매칭 자연 실패).
    steps: [],
    mixedUseDetail: b,
  };
}

// 결과 데이터에 신규 필드가 누락된 캐시 케이스를 안전하게 처리하기 위해 nullish 가드.
const fmt = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const fmtPlain = (n: number | undefined | null) => (n ?? 0).toLocaleString();
const fmtPct = (r: number | undefined | null) => `${((r ?? 0) * 100).toFixed(2)}%`;
const fmtSqm = (n: number | undefined | null) => `${(n ?? 0).toFixed(2)} ㎡`;

/** 양도소득세 기본세율 8구간 (소득세법 §104) — 캐시된 결과 fallback용 */
function deriveBasicRateBracket(taxBase: number): { rate: number; deduction: number } {
  if (taxBase <= 14_000_000) return { rate: 0.06, deduction: 0 };
  if (taxBase <= 50_000_000) return { rate: 0.15, deduction: 1_260_000 };
  if (taxBase <= 88_000_000) return { rate: 0.24, deduction: 5_760_000 };
  if (taxBase <= 150_000_000) return { rate: 0.35, deduction: 15_440_000 };
  if (taxBase <= 300_000_000) return { rate: 0.38, deduction: 19_940_000 };
  if (taxBase <= 500_000_000) return { rate: 0.40, deduction: 25_940_000 };
  if (taxBase <= 1_000_000_000) return { rate: 0.42, deduction: 35_940_000 };
  return { rate: 0.45, deduction: 65_940_000 };
}

interface Props {
  breakdown: MixedUseGainBreakdown;
  formData?: TransferFormData;
}

export function MixedUseResultCard({ breakdown, formData }: Props) {
  // 출력 항목 선택 (PR-F4) — 기존 자체 printScoped("full"/"form-table") → PrintSelectionPanel 통일.
  // ⚠️ pdf 채널 0(ResultPdfDocument에 mixed-use 섹션 부재) → onPrintPdf 미전달.
  //    "선택 항목 인쇄"(window.print → 브라우저 PDF 저장)만 노출. 설계 §2.8.
  const [selectedPrintIds, setSelectedPrintIds] = useState<Set<string>>(() => new Set());
  // 현재 결과뷰에 실제 렌더되는 leaf id (3종 항상 — 본문·신고서·명세서 항상 렌더)
  const availablePrintIds = useMemo<Set<MixedUsePrintSectionId>>(
    () => new Set<MixedUsePrintSectionId>(["calculation", "filing-form", "detailed-statement"]),
    [],
  );

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

  const { apportionment: a, housingPart: h, commercialPart: c, nonBusinessLandPart: nb, total: t } = breakdown;
  const totalTransfer = a.housingTransferPrice + a.commercialTransferPrice;

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
      <PrintSection id="filing-form" selectedIds={selectedPrintIds}>
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
      <PrintSection id="calculation" selectedIds={selectedPrintIds} className="space-y-4">
      {/* 경고 */}
      {breakdown.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          {breakdown.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
        </div>
      )}

      {/* 0. 보유 중 일부 용도변경 (있을 때만) — 시행령 §166⑥ + 집행기준 99-164-10 */}
      {breakdown.partialUsageChange && (
        <PartialUsageChangeCard
          puc={breakdown.partialUsageChange}
          reason={breakdown.calculationRoute.partialUsageChangeReason}
        />
      )}

      {/* 0-A. 용도변경일 기반 LTHD 시간 비례 분할 (집행기준 89-154-24 취지) */}
      {breakdown.usagePeriodSplit && breakdown.partialUsageChange && (
        <UsagePeriodSplitCard
          ups={breakdown.usagePeriodSplit}
          direction={breakdown.partialUsageChange.direction}
        />
      )}

      {/* 1세대 1주택 비과세 적용 여부 표시 */}
      <div
        className={`rounded-md px-3 py-2 text-xs border ${
          breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "bg-amber-50/60 border-amber-200 text-amber-900"
            : "bg-emerald-50/60 border-emerald-200 text-emerald-900"
        }`}
      >
        <span className="font-semibold">
          1세대 1주택 비과세:{" "}
          {breakdown.calculationRoute.highValueRule === "non_one_house_full_taxation"
            ? "미적용 (전액 과세 + 표1 공제)"
            : breakdown.calculationRoute.highValueRule === "below_threshold_exempt"
              ? "적용 (12억 이하 비과세)"
              : "적용 (12억 초과 안분 과세)"}
        </span>
      </div>

      {/* 1. 양도가액 안분 */}
      <ResultSection title="① 양도가액 안분" basis="소득세법 §99 + 시행령 §164">
        <Row
          label="양도시 개별주택공시가격"
          value={fmt(a.housingStandardPrice)}
          formula="입력값 — 주택건물+주택부수토지 일괄"
        />
        <Row
          label="양도시 상가부분 기준시가 합계"
          value={fmt(a.commercialStandardPrice)}
          formula="(공시지가/㎡ × 상가부수토지 면적) + 상가건물 기준시가"
        />
        <DivRow />
        <Row
          label={`주택비율`}
          value={fmtPct(a.housingRatio)}
          formula={`${fmtPlain(a.housingStandardPrice)} ÷ (${fmtPlain(a.housingStandardPrice)} + ${fmtPlain(a.commercialStandardPrice)})`}
        />
        <Row
          label="주택 양도가액"
          value={fmt(a.housingTransferPrice)}
          highlight
          formula={`${fmtPlain(totalTransfer)} × ${fmtPct(a.housingRatio)} → 내림`}
        />
        <Row
          label="상가 양도가액"
          value={fmt(a.commercialTransferPrice)}
          highlight
          formula={`총 양도가액 - 주택 양도가액 = ${fmtPlain(totalTransfer)} - ${fmtPlain(a.housingTransferPrice)}`}
        />
      </ResultSection>

      {/* 2. 주택부분 */}
      <ResultSection title="② 주택부분" basis="소득세법 §89 ① 3호 단서 + §95 ②">
        <Row
          label="주택 환산취득가액"
          value={fmt(h.estimatedAcquisitionPrice)}
          formula={(() => {
            if (!h.phdEstimatedAcqHousingPrice) {
              return `§97: 주택 양도가액 ${fmtPlain(a.housingTransferPrice)} × (취득시 개별주택공시가격 ÷ 양도시 개별주택공시가격 ${fmtPlain(a.housingStandardPrice)})`;
            }
            const ph = h.phdResult?.inputs;
            const fp = h.phdResult?.fourPartApportionment;
            // Case A 4부분 모드 — 주택부분 환산취득가 = 토지분(D11) + 건물분(E11)
            if (fp) {
              return `Case A 4부분 안분 — 주택부분 = 토지분(D11) ${fmtPlain(Math.floor(fp.housingLandAcqPrice))} + 건물분(E11) ${fmtPlain(Math.floor(fp.housingBuildingAcqPrice))} | 전체 환산취득가 ${fmtPlain(fp.totalEstAcq)} × (취득시 4부분 주택분 비율 ${fmtPlain(fp.housingLandAcqShare + fp.housingBuildingAcqShare)} ÷ 역산 취득시 개별주택가격 ${fmtPlain(h.phdEstimatedAcqHousingPrice)})`;
            }
            const isAreaSplit =
              !!ph &&
              (ph.landAreaAtAcquisition !== ph.landAreaAtTransfer ||
                ph.landAreaAtFirstDisclosure !== ph.landAreaAtTransfer);
            const base = `시행령 §164⑤ 역산 환산: 주택 양도가액 ${fmtPlain(a.housingTransferPrice)} × (역산한 취득시 개별주택가격 ${fmtPlain(h.phdEstimatedAcqHousingPrice)} ÷ 양도시 개별주택공시가격 ${fmtPlain(a.housingStandardPrice)})`;
            if (!isAreaSplit || !ph) return base;
            return `${base} | 시점별 토지면적: 취득시 ${ph.landAreaAtAcquisition.toFixed(2)}㎡ · 최초공시 ${ph.landAreaAtFirstDisclosure.toFixed(2)}㎡ · 양도시 ${ph.landAreaAtTransfer.toFixed(2)}㎡`;
          })()}
        />
        {h.phdResult && h.phdEstimatedAcqHousingPrice && (() => {
          const r = h.phdResult!;
          const ph = r.inputs;
          const fp = r.fourPartApportionment;
          // Case A 4부분 안분 활성 시 — 4부분(주택분토지·주택건물·상가분토지·상가건물) 합산 표시
          const formula = fp
            ? `최초공시 개별주택가격 ${fmtPlain(ph.firstDisclosureHousingPrice)} × 취득시 합산기준시가(4부분) ${fmtPlain(r.sumAtAcquisition)} ÷ 최초공시 합산기준시가(4부분) ${fmtPlain(r.sumAtFirstDisclosure)} | 취득시: 주택분토지 ${fmtPlain(fp.housingLandStdAtAcq)} + 주택건물 ${fmtPlain(fp.housingBuildingStdAtAcq)} + 상가분토지 ${fmtPlain(fp.commercialLandStdAtAcq)} + 상가건물 ${fmtPlain(fp.commercialBuildingStdAtAcq)} | 최초공시: 주택분토지 ${fmtPlain(fp.housingLandStdAtFirst)} + 주택건물 ${fmtPlain(fp.housingBuildingStdAtFirst)} + 상가분토지 ${fmtPlain(fp.commercialLandStdAtFirst)} + 상가건물 ${fmtPlain(fp.commercialBuildingStdAtFirst)}`
            : `최초공시 개별주택가격 ${fmtPlain(ph.firstDisclosureHousingPrice)} × 취득시 합산기준시가 ${fmtPlain(r.sumAtAcquisition)} ÷ 최초공시 합산기준시가 ${fmtPlain(r.sumAtFirstDisclosure)} | 취득시: 토지기준시가 ${fmtPlain(r.landStdAtAcquisition)} + 건물기준시가 ${fmtPlain(r.buildingStdAtAcquisition)} | 최초공시: 토지기준시가 ${fmtPlain(r.landStdAtFirstDisclosure)} + 건물기준시가 ${fmtPlain(r.buildingStdAtFirstDisclosure)}`;
          return (
            <Row
              label={fp ? "  ▸ 역산한 취득시 개별주택가격 (Case A 4부분 안분)" : "  ▸ 역산한 취득시 개별주택가격"}
              value={fmtPlain(h.phdEstimatedAcqHousingPrice)}
              small
              formula={formula}
            />
          );
        })()}
        <Row
          label="주택 양도차익"
          value={fmt(h.transferGain)}
          formula="(양도가액 - 환산취득가액 - 개산공제) — 토지/건물 분리 후 합산"
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(h.landTransferGain)}
          small
          formula={`양도가액 ${fmtPlain(h.landTransferPrice)} - 환산취득가액 ${fmtPlain(h.landAcqPrice)} - 개산공제 ${fmtPlain(h.landAppraisalDed)} (취득시 토지 기준시가 ${h.landStdPriceAtAcq != null ? fmtPlain(h.landStdPriceAtAcq) + " " : ""}× 3%)`}
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(h.buildingTransferGain)}
          small
          formula={`양도가액 ${fmtPlain(h.buildingTransferPrice)} - 환산취득가액 ${fmtPlain(h.buildingAcqPrice)} - 개산공제 ${fmtPlain(h.buildingAppraisalDed)} (취득시 건물 기준시가 ${h.buildingStdPriceAtAcq != null ? fmtPlain(h.buildingStdPriceAtAcq) + " " : ""}× 3%)`}
        />
        <DivRow />
        {h.isExempt ? (
          <Row label="12억 이하 → 전액 비과세" value="0" />
        ) : (
          <Row
            label="12억 초과 안분 후 과세대상 양도차익"
            value={fmt(h.proratedTaxableGain)}
            formula={`주택 양도차익 × ((주택 양도가액 - 12억) ÷ 주택 양도가액) — 비사업용 이전분 제외`}
          />
        )}
        <Row
          label={`장기보유공제 (표${h.longTermDeductionTable}, ${fmtPct(h.longTermDeductionRate)})`}
          value={`△ ${fmt(h.longTermDeductionAmount)}`}
          formula={
            h.longTermDeductionTable === 2
              ? "보유연수×4% + 거주연수×4% (최대 80%)"
              : "보유연수×2% (최대 30%)"
          }
        />
        <DivRow />
        <Row
          label="주택부분 양도소득금액"
          value={fmt(h.incomeAmount)}
          highlight
          formula="과세대상 양도차익 - 장기보유공제"
        />
        {h.nonBusinessTransferRatio > 0 && (
          <Row
            label={`비사업용 이전 (${fmtPct(h.nonBusinessTransferRatio)})`}
            value={`→ ${fmt(h.nonBusinessTransferredGain)}`}
            small
            formula="주택 토지분 양도차익 중 부수토지 배율초과 면적 비율만큼 ④로 이전"
          />
        )}
      </ResultSection>

      {/* 3. 상가부분 */}
      <ResultSection title="③ 상가부분" basis="소득세법 §95 ② 표1">
        <Row
          label="취득시 상가부분 기준시가 합계"
          value={fmt(c.acqStandardTotal)}
          small
          formula={`상가건물 기준시가 ${fmtPlain(c.acqStandardBuilding)} + 상가부수토지 기준시가 ${fmtPlain(c.acqStandardLand)} (= 개별공시지가 × 상가부수토지 면적, 자동)`}
        />
        <Row
          label="상가 환산취득가액"
          value={fmt(c.estimatedAcquisitionPrice)}
          formula={`§97: 상가 양도가액 ${fmtPlain(a.commercialTransferPrice)} × (취득시 상가부분 기준시가 ${fmtPlain(c.acqStandardTotal)} ÷ 양도시 상가부분 기준시가 ${fmtPlain(a.commercialStandardPrice)})`}
        />
        <Row
          label="상가 양도차익"
          value={fmt(c.transferGain)}
          formula="(양도가액 - 환산취득가액 - 개산공제) — 토지/건물 분리 후 합산"
        />
        <Row
          label="  ▸ 토지분"
          value={fmt(c.landTransferGain)}
          small
          formula={`양도가액 ${fmtPlain(c.landTransferPrice)} - 환산취득가액 ${fmtPlain(c.landAcqPrice)} - 개산공제 ${fmtPlain(c.landAppraisalDed)} (취득시 토지 기준시가 ${c.landStdPriceAtAcq != null ? fmtPlain(c.landStdPriceAtAcq) + " " : ""}× 3%)`}
        />
        <Row
          label="  ▸ 건물분"
          value={fmt(c.buildingTransferGain)}
          small
          formula={`양도가액 ${fmtPlain(c.buildingTransferPrice)} - 환산취득가액 ${fmtPlain(c.buildingAcqPrice)} - 개산공제 ${fmtPlain(c.buildingAppraisalDed)} (취득시 건물 기준시가 ${c.buildingStdPriceAtAcq != null ? fmtPlain(c.buildingStdPriceAtAcq) + " " : ""}× 3%)`}
        />
        <DivRow />
        <Row
          label={`장기보유공제 (표1, ${fmtPct(c.longTermDeductionRate)})`}
          value={`△ ${fmt(c.longTermDeductionAmount)}`}
          formula="보유연수×2% (최대 30%) — 토지/건물 별 보유연수 적용"
        />
        <DivRow />
        <Row
          label="상가부분 양도소득금액"
          value={fmt(c.incomeAmount)}
          highlight
          formula="양도차익 - 장기보유공제"
        />
      </ResultSection>

      {/* 4. 비사업용토지 (조건부) */}
      {nb && (
        <ResultSection title="④ 비사업용토지 (주택부수토지 배율초과)" basis="시행령 §168의12 + §104의3">
          <Row
            label={`적용 배율`}
            value={`${nb.appliedMultiplier}배`}
            formula="수도권 주거지역 3배 / 녹지·외곽 5배 / 도시 외 10배"
          />
          <Row
            label="배율초과 면적"
            value={fmtSqm(nb.excessArea)}
            formula="주택부수토지 면적 - (주택 정착면적 × 배율)"
          />
          <Row
            label="비사업용 양도차익"
            value={fmt(nb.transferGain)}
            formula="주택 토지분 양도차익 × (배율초과 면적 ÷ 주택부수토지 면적)"
          />
          <Row
            label={`장기보유공제 (표1, ${fmtPct(nb.longTermDeductionRate)})`}
            value={`△ ${fmt(nb.longTermDeductionAmount)}`}
            formula="토지 보유연수×2% (최대 30%)"
          />
          <DivRow />
          <Row
            label="비사업용토지 양도소득금액 (+10%p 가산)"
            value={fmt(nb.incomeAmount)}
            highlight
            formula="양도차익 - 장기보유공제 (세율 가산은 합산세액에서 처리)"
          />
        </ResultSection>
      )}

      {/* 합산 세액 */}
      <ResultSection title="합산 세액" basis="소득세법 §92~§107">
        <Row
          label="합산 양도소득금액"
          value={fmt(t.aggregateIncome)}
          formula="주택부분 + 상가부분 + 비사업용토지 양도소득금액"
        />
        <Row
          label="기본공제"
          value={`△ ${fmt(t.basicDeduction)}`}
          formula="연 250만원 (소득세법 §103)"
        />
        <Row
          label="과세표준"
          value={fmt(t.taxBase)}
          formula="합산 양도소득금액 - 기본공제"
        />
        <DivRow />
        <Row
          label="산출세액 (기본세율)"
          value={fmt(t.taxByBasicRate)}
          formula={(() => {
            if (t.taxBase <= 0) return "과세표준 × 누진세율 (6%~45% 8구간) — 소득세법 §104";
            // 엔진이 신규 필드를 채웠으면 그대로 사용, 아니면 taxBase로부터 도출 (캐시 fallback)
            const fallback = deriveBasicRateBracket(t.taxBase);
            const rate = t.appliedRate && t.appliedRate > 0 ? t.appliedRate : fallback.rate;
            const deduction = t.progressiveDeduction && t.progressiveDeduction > 0 ? t.progressiveDeduction : fallback.deduction;
            return `${fmtPlain(t.taxBase)} × ${fmtPct(rate)} - ${fmtPlain(deduction)} (소득세법 §104)`;
          })()}
        />
        {t.nonBusinessSurcharge > 0 && (
          <Row
            label="비사업용토지 +10%p 가산세"
            value={fmt(t.nonBusinessSurcharge)}
            formula="비사업용토지 양도소득금액 × 10%"
          />
        )}
        <Row
          label="양도소득세"
          value={fmt(t.transferTax)}
          formula="산출세액 + 비사업용토지 가산세"
        />
        <Row
          label="지방소득세 (10%)"
          value={fmt(t.localTax)}
          formula="양도소득세 × 10% (지방세법 §103의3)"
        />
        <DivRow />
        <Row
          label="총 납부세액"
          value={fmt(t.totalPayable)}
          highlight
          large
          formula="양도소득세 + 지방소득세"
        />
      </ResultSection>

      {/* 계산 경로 메타 (학습·검증용) */}
      <CalculationRouteCard route={breakdown.calculationRoute} />
      </PrintSection>

      {/* ── 계산결과 상세명세서 (겸용주택 모드) ── */}
      {/* 신고서 양식 32 항목별 산식·변수값·법령 노출 — mixedUseDetail은 단건 모드로 처리 */}
      <PrintSection id="detailed-statement" selectedIds={selectedPrintIds}>
      <DetailedCalculationStatementCard
        result={mixedUseToFilingResult(breakdown)}
        formData={formData}
        asset={formData?.assets[0]}
      />
      </PrintSection>
    </div>
  );
}

// ── 계산 경로 메타 카드 (학습·검증용 — "왜 이 세액인지" 설명) ──

const ACQ_SOURCE_LABEL: Record<string, string> = {
  direct_input: "직접 입력",
  phd_auto: "최초공시 기준 역산 (시행령 §164⑤)",
  missing: "미입력 (환산 불가)",
};

const CONVERSION_ROUTE_LABEL: Record<string, string> = {
  section97_direct: "§97 직접 환산 (양도가액 × 취득시 기준시가 / 양도시 기준시가)",
  phd_corrected: "최초공시 기준 역산 후 §97 환산 (취득 당시 개별주택가격 미공시)",
};

const HIGH_VALUE_LABEL: Record<string, string> = {
  below_threshold_exempt: "주택 양도가액 ≤ 12억 → 전액 비과세",
  above_threshold_prorated: "주택 양도가액 > 12억 → 안분 과세 (§89 ① 3호 단서)",
};

function CalculationRouteCard({
  route,
}: {
  route: import("@/lib/tax-engine/types/transfer-mixed-use.types").MixedUseCalculationRoute;
}) {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-2">
      <div className="flex items-start justify-between mb-1">
        <h4 className="font-semibold text-sm text-blue-900">계산 경로 (학습·검증용)</h4>
        <span className="text-micro text-blue-700">&quot;왜 이 세액인지&quot; 설명</span>
      </div>
      <MetaRow label="취득시 주택공시가격" value={ACQ_SOURCE_LABEL[route.housingAcqPriceSource]} />
      <MetaRow label="환산취득가액 경로" value={CONVERSION_ROUTE_LABEL[route.acquisitionConversionRoute]} />
      <MetaRow label="12억 비과세 적용" value={HIGH_VALUE_LABEL[route.highValueRule]} />
      <MetaRow label="주택 장기보유공제" value={route.housingDeductionTableReason} />
      <MetaRow label="부수토지 배율" value={route.landMultiplierReason} />
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-2 text-xs">
      <span className="text-blue-800 font-medium whitespace-nowrap">{label}</span>
      <span className="text-blue-900 text-right">{value}</span>
    </div>
  );
}

// ── 공용 서브 컴포넌트 ──

function ResultSection({
  title,
  basis,
  children,
}: {
  title: string;
  basis: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-semibold text-sm">{title}</h4>
        <span className="text-micro text-muted-foreground text-right max-w-[140px]">{basis}</span>
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  highlight,
  large,
  small,
  formula,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  large?: boolean;
  small?: boolean;
  formula?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className={`flex justify-between items-center ${small ? "text-xs text-muted-foreground" : "text-sm"}`}>
        <span className={highlight ? "font-medium" : ""}>{label}</span>
        <span className={`font-mono ${highlight ? "font-semibold text-primary" : ""} ${large ? "text-base" : ""}`}>
          {value}
        </span>
      </div>
      {formula && (
        <p className="text-caption text-muted-foreground/80 leading-snug pl-2 border-l-2 border-muted">
          {formula}
        </p>
      )}
    </div>
  );
}

function DivRow() {
  return <div className="border-t my-1" />;
}

/**
 * 보유 중 일부 용도변경 — "취득시점 자산 구성" 섹션.
 * direction별 설명 + 자동/수정 면적 비교표 + commercial_to_house 시 보수 검토 배지.
 */
function PartialUsageChangeCard({
  puc,
  reason,
}: {
  puc: NonNullable<MixedUseGainBreakdown["partialUsageChange"]>;
  reason?: string;
}) {
  const isCommToHouse = puc.direction === "commercial_to_house";
  const isPhdCaseA = puc.phdScopeBranch === "case_a_whole_building";
  const isPhdCaseB = puc.phdScopeBranch === "case_b_housing_only";
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-amber-900">
          취득시점 자산 구성 (보유 중 일부 용도변경)
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {isPhdCaseA && (
            <span className="inline-flex items-center rounded-md border border-rose-300 bg-rose-100 px-2 py-0.5 text-caption font-semibold text-rose-900">
              최초공시일 &lt; 용도변경일 — 건물 전체 기준으로 취득시 주택가격 역산
            </span>
          )}
          {isPhdCaseB && (
            <span className="inline-flex items-center rounded-md border border-violet-300 bg-violet-100 px-2 py-0.5 text-caption font-semibold text-violet-900">
              최초공시일 ≥ 용도변경일 — 주택 부분만 기준으로 취득시 주택가격 역산
            </span>
          )}
          {isCommToHouse && (
            <span className="inline-flex items-center rounded-md border border-yellow-300 bg-yellow-100 px-2 py-0.5 text-caption font-semibold text-yellow-900">
              ⚠ 법령 적용에 보수 검토 필요
            </span>
          )}
        </div>
      </div>
      <p className="text-xs text-amber-800">
        취득시 자산 구성:{" "}
        <span className="font-semibold">
          {puc.direction === "house_to_commercial"
            ? "전체 주택 → 양도시 일부 상가화"
            : "전체 상가 → 양도시 일부 주택화"}
        </span>
      </p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white/60 border border-amber-200 px-3 py-2">
          <div className="text-caption text-amber-700">취득시 주택 연면적</div>
          <div className="font-mono text-amber-900">{puc.acqResidentialArea.toFixed(2)}㎡</div>
        </div>
        <div className="rounded-md bg-white/60 border border-amber-200 px-3 py-2">
          <div className="text-caption text-amber-700">취득시 상가 연면적</div>
          <div className="font-mono text-amber-900">{puc.acqCommercialArea.toFixed(2)}㎡</div>
        </div>
      </div>
      {puc.isAreaCustomized && (
        <p className="text-caption text-muted-foreground">
          ※ 사용자가 취득시 면적을 직접 입력함 (자동값 대신 수동값 사용)
        </p>
      )}
      {isPhdCaseA && (
        <div className="rounded-md bg-rose-50 border border-rose-200 px-3 py-2 text-caption text-rose-900 space-y-1 leading-relaxed">
          <p className="font-semibold">취득시 개별주택가격 역산 산식 — 건물 전체 기준 (시행령 §164⑤)</p>
          <p>
            역산한 취득시 개별주택가격 = 최초공시 개별주택가격 × (취득시 토지기준시가 + 취득시 건물기준시가) ÷ (최초공시 토지기준시가 + 최초공시 건물기준시가)
          </p>
          <p>
            · 최초공시 시점에 건물 전체가 주택이었으므로 최초공시 개별주택가격에는 이후 상가로 변한 부분도 포함됩니다. 취득시·최초공시 시점 모두 전체 토지면적·전체 건물 기준시가를 사용하여 비율을 맞춥니다.
          </p>
        </div>
      )}
      {reason && (
        <p className="text-caption text-amber-800 bg-amber-100/60 border border-amber-200 rounded-md px-2 py-1.5 leading-relaxed">
          💡 {reason}
        </p>
      )}
    </div>
  );
}

/**
 * 용도변경일 기반 LTHD 시간 비례 분할 카드.
 * 집행기준 89-154-24 취지 — 주택으로 사용한 기간 통산.
 * Period 1 (단일 용도) + Period 2 (혼용)별 양도차익·LTHD 내역 표시.
 */
function UsagePeriodSplitCard({
  ups,
  direction,
}: {
  ups: NonNullable<MixedUseGainBreakdown["usagePeriodSplit"]>;
  direction: "house_to_commercial" | "commercial_to_house";
}) {
  const isHtoC = direction === "house_to_commercial";
  const fmtDays = (d: number) => `${d.toFixed(0)}일 (${(d / 365.25).toFixed(2)}년)`;
  const period1Label = isHtoC ? "Period 1 (전체 주택)" : "Period 1 (전체 상가)";
  const period1Cat = isHtoC ? "주택분" : "상가분";

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-semibold text-violet-900">
          용도변경일 기반 LTHD 분리 계산
        </p>
        <span className="inline-flex items-center rounded-md border border-violet-300 bg-violet-100 px-2 py-0.5 text-caption font-semibold text-violet-900">
          집행기준 89-154-24
        </span>
      </div>
      <p className="text-caption text-violet-800 leading-relaxed">
        용도변경일 입력 시 양도차익을 시간 비례로 분할하여, 각 기간의 보유연수로 장기보유특별공제를 적용합니다.
        주택으로 사용한 기간을 통산하는 집행기준 취지를 반영.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-white/60 border border-violet-200 px-3 py-2 space-y-1">
          <div className="text-caption text-violet-700 font-semibold">{period1Label}</div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>기간</span>
            <span className="font-mono">{fmtDays(ups.period1Days)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>{period1Cat} 양도차익</span>
            <span className="font-mono">{fmt(ups.period1Gain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period1LongTermDeductionRate)} / {fmt(ups.period1LongTermDeductionAmount)}
            </span>
          </div>
        </div>

        <div className="rounded-md bg-white/60 border border-violet-200 px-3 py-2 space-y-1">
          <div className="text-caption text-violet-700 font-semibold">Period 2 (혼용 — 양도시점 비율)</div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>기간</span>
            <span className="font-mono">{fmtDays(ups.period2Days)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>주택분 양도차익</span>
            <span className="font-mono">{fmt(ups.period2HousingGain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>주택 LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period2HousingLongTermDeductionRate)} / {fmt(ups.period2HousingLongTermDeductionAmount)}
            </span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>상가분 양도차익</span>
            <span className="font-mono">{fmt(ups.period2CommercialGain)}</span>
          </div>
          <div className="flex justify-between text-xs text-violet-800">
            <span>상가 LTHD 공제율 / 공제액</span>
            <span className="font-mono">
              {fmtPct(ups.period2CommercialLongTermDeductionRate)} / {fmt(ups.period2CommercialLongTermDeductionAmount)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
