"use client";

/**
 * 이월과세 **적용**(Scenario A) 요약 카드 — 소득세법 §97조의2.
 *
 * ## 왜 생겼나 (결과탭 코드리뷰 #023)
 *
 * 비교과세(§97조의2 ② 3호)에서 **B가 채택되면** `TransferTaxResult`는 B로 계산된 값이다
 * (`transfer-tax-carryover.ts`의 `adoptedInput`). 그런데 결과탭의 2단 레이아웃은 [A] 자리에
 * 언제나 완전한 `FilingFormTable`에 그 `result`를 넘겼다. 결과:
 *
 * - 머리: 취득일자 = **증여자** 취득일 · 보유기간 = A 기준(예 26년)
 * - 본문: 취득가액·양도차익·장특공제·결정세액 = **전부 B 값**
 * - 부제: 취득가액 500,000,000(A) ↔ 본문 550,000,000(B) — **같은 카드가 자기모순**
 *
 * 「보유 26년인데 장특공제율 6%(3년)」처럼 성립할 수 없는 서식이 나왔다.
 *
 * ⇒ 채택되지 않은 시나리오는 **그 시나리오 자신의 detail**로 그린다. B 카드와 껍데기를
 *   공유하므로 어느 쪽이 채택돼도 좌우가 대칭이다.
 */

import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  CarryoverScenarioSummaryCard,
  fmtScenarioDate,
  type SummaryRow,
} from "./CarryoverScenarioSummaryCard";
import type { CarryoverScenarioADetail } from "@/lib/tax-engine/types/transfer-carryover.types";

interface Props {
  scenarioA: CarryoverScenarioADetail;
  adopted: boolean;
  /** 양도가액 (원) */
  transferPrice?: number;
  /** 양도일자 (YYYY-MM-DD) */
  transferDate?: string;
  /** 증여자 취득일 (YYYY-MM-DD) — 보유기간 기산점 */
  donorAcquisitionDate?: string;
  onPrint?: () => void;
}

export function CarryoverScenarioAFilingCard({
  scenarioA,
  adopted,
  transferPrice,
  transferDate,
  donorAcquisitionDate,
  onPrint,
}: Props) {
  const rows: SummaryRow[] = [
    { label: "양도일자", value: fmtScenarioDate(transferDate) },
    { label: "취득일자 (증여자 취득일)", value: fmtScenarioDate(donorAcquisitionDate) },
    { label: "보유기간 (증여자 기산)", value: `${scenarioA.holdingPeriodYears}년` },
    ...(transferPrice && transferPrice > 0
      ? [{ label: "양도가액", value: formatKRW(transferPrice) }]
      : []),
    { label: "취득가액 (증여자 취득 당시)", value: formatKRW(scenarioA.acquisitionPrice) },
    { label: "양도차익", value: formatKRW(scenarioA.transferGain) },
    ...(scenarioA.longTermHoldingDeduction != null
      ? [{
          label: `장기보유특별공제 (${scenarioA.longTermHoldingRate != null ? `${(scenarioA.longTermHoldingRate * 100).toFixed(0)}%` : ""})`,
          value: scenarioA.longTermHoldingDeduction > 0
            ? formatKRW(scenarioA.longTermHoldingDeduction)
            : "해당없음",
          indent: true,
        }]
      : []),
    ...(scenarioA.taxBase != null
      ? [{ label: "과세표준", value: formatKRW(scenarioA.taxBase), highlight: true }]
      : []),
    ...(scenarioA.calculatedTax != null
      ? [{ label: "산출세액", value: formatKRW(scenarioA.calculatedTax) }]
      : []),
    { label: "결정세액", value: formatKRW(scenarioA.determinedTax), highlight: true },
  ];

  return (
    <CarryoverScenarioSummaryCard
      title="[A] 이월과세 적용 (비교용)"
      subtitle="증여자 기산 보유기간 · 취득가액 = 증여자 취득 당시 가액"
      footnote="※ Scenario A는 이월과세 적용 시 결과. 비교과세(§97조의2 ② 3호) 판정용."
      rows={rows}
      adopted={adopted}
      onPrint={onPrint}
    />
  );
}
