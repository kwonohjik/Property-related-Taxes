"use client";

/**
 * 이월과세 미적용(시나리오 B) 신고서 핵심 항목 요약 카드 — 소득세법 §97조의2
 *
 * 완전한 TransferTaxResult 없이 CarryoverScenarioBDetail만으로 표시.
 * 표시 껍데기는 `CarryoverScenarioSummaryCard`와 공유한다 — A 카드와 대칭이어야 한다(#023).
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  CarryoverScenarioSummaryCard,
  fmtScenarioDate,
  type SummaryRow,
} from "./CarryoverScenarioSummaryCard";
import type { CarryoverScenarioBDetail } from "@/lib/tax-engine/types/transfer-carryover.types";

interface Props {
  scenarioB: CarryoverScenarioBDetail;
  adopted: boolean;
  /** 양도가액 (원) — formData.contractTotalPrice 또는 result.transferPrice */
  transferPrice?: number;
  /** 양도일자 (YYYY-MM-DD) */
  transferDate?: string;
  /** 증여 등기접수일 (YYYY-MM-DD) — 보유기간 기산점 */
  giftRegistryDate?: string;
  /** 출력 버튼 핸들러 */
  onPrint?: () => void;
}

export function CarryoverScenarioBFilingCard({
  scenarioB,
  adopted,
  transferPrice,
  transferDate,
  giftRegistryDate,
  onPrint,
}: Props) {
  // 소유자 분리 — 양도차익이 본인 파트 값이므로 양도가액·취득가액도 본인 파트 값을 적는다(엔진 echo · 계획서 V-4).
  const own = scenarioB.ownerSplitPart;
  const shownTransferPrice = own?.transferPrice ?? transferPrice;
  const rows: SummaryRow[] = [
    { label: "양도일자", value: fmtScenarioDate(transferDate) },
    { label: "취득일자 (증여 등기접수일)", value: fmtScenarioDate(giftRegistryDate) },
    { label: `보유기간 (수증자 기산)`, value: `${scenarioB.holdingPeriodYears}년` },
    ...(shownTransferPrice && shownTransferPrice > 0
      ? [{ label: `양도가액${own ? " (본인 소유 파트)" : ""}`, value: formatKRW(shownTransferPrice) }]
      : []),
    { label: `취득가액 (${scenarioB.acquisitionIsRedevelopmentFiling ? "신고서 취득가액 · 인가 전·후 분 합 · 소령 §166①1호" : scenarioB.acquisitionIsBurdenedGiftShare ? "수증자 취득가 × 채무비율 · 소령 §159①1호" : "증여 당시 평가액"}${own ? " · 본인 소유 파트" : ""})`, value: formatKRW(own?.acquisitionPrice ?? scenarioB.acquisitionPrice) },
    { label: "양도차익", value: formatKRW(scenarioB.transferGain) },
    ...(scenarioB.longTermHoldingDeduction != null
      ? [{
          label: `장기보유특별공제 (${scenarioB.longTermHoldingRate != null ? `${(scenarioB.longTermHoldingRate * 100).toFixed(0)}%` : ""})`,
          value: scenarioB.longTermHoldingDeduction > 0
            ? formatKRW(scenarioB.longTermHoldingDeduction)
            : "해당없음",
          indent: true,
        }]
      : []),
    ...(scenarioB.taxBase != null
      ? [{ label: "과세표준", value: formatKRW(scenarioB.taxBase), highlight: true }]
      : []),
    ...(scenarioB.calculatedTax != null
      ? [{ label: "산출세액", value: formatKRW(scenarioB.calculatedTax) }]
      : []),
    { label: "결정세액", value: formatKRW(scenarioB.determinedTax), highlight: true },
  ];

  return (
    <CarryoverScenarioSummaryCard
      title="[B] 이월과세 미적용 (비교용)"
      subtitle={`수증자 기산 보유기간 · 취득가액 = ${scenarioB.acquisitionIsRedevelopmentFiling ? "신고서 취득가액(인가 전·후 분 합 · 소령 §166①1호)" : scenarioB.acquisitionIsBurdenedGiftShare ? "수증자 취득가 × 채무비율(소령 §159①1호)" : "증여 당시 평가액"}`}
      footnote="※ 시나리오 B는 이월과세 미적용 시 결과. 비교과세(§97조의2 ② 3호) 판정용."
      rows={rows}
      adopted={adopted}
      onPrint={onPrint}
    />
  );
}
