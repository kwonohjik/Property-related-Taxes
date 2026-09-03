/**
 * H-12: emitPenaltySteps — STEP 12 신고불성실·납부지연 가산세 + 합산 step 푸시
 *
 * transfer-tax-helpers.ts 800줄 정책 분리 (2026-06-11).
 * 외부 import 호환을 위해 transfer-tax-helpers.ts에서 re-export 유지.
 */

import { TRANSFER, PENALTY } from "./legal-codes";
import {
  calculateTransferTaxPenalty,
  formatDelayedPaymentFormula,
  formatDelayedPaymentLabel,
  formatFilingPenaltyFormula,
  formatFilingPenaltyLabel,
  type TransferTaxPenaltyResult,
} from "./transfer-tax-penalty";
import type { CalculationStep, TransferTaxInput } from "./types/transfer.types";

export interface PenaltyEmissionResult {
  penaltyDetail?: TransferTaxPenaltyResult;
  filingDelayedPenalty: number;
  totalAllPenalty: number;
}

/**
 * STEP 12: 신고불성실·납부지연 가산세 계산 + 가산세 합산 step 5종 푸시.
 *
 * - 입력에 filingPenaltyDetails 또는 delayedPaymentDetails가 있으면 calculateTransferTaxPenalty 호출.
 * - 환산가액적용가산세(§114조의2 penaltyTax)와 합산하여 totalAllPenalty 반환.
 * - 가산세가 0보다 크면 steps에 4~5건의 항목 push (가산세 합계 / §114조의2 / 신고불성실 / 납부지연 / 총결정세액).
 *
 * 부수효과: steps 배열에 push (호출측 배열을 그대로 변경).
 */
export function emitPenaltySteps(
  input: TransferTaxInput,
  steps: CalculationStep[],
  determinedTax: number,
  penaltyTax: number,
  penaltyBase: number,
  penaltyNote: string | undefined,
): PenaltyEmissionResult {
  const penaltyDetail =
    input.filingPenaltyDetails || input.delayedPaymentDetails
      ? calculateTransferTaxPenalty({
          filing: input.filingPenaltyDetails,
          delayedPayment: input.delayedPaymentDetails,
        })
      : undefined;
  const filingDelayedPenalty = penaltyDetail?.totalPenalty ?? 0;
  const totalAllPenalty = penaltyTax + filingDelayedPenalty;

  if (totalAllPenalty > 0) {
    steps.push({
      label: "가산세 합계",
      formula: `환산가액적용가산세 + 신고불성실가산세 + 납부지연가산세`,
      amount: totalAllPenalty,
      legalBasis: TRANSFER.BUILDING_PENALTY,
    });
    if (penaltyTax > 0) {
      steps.push({
        label: "환산가액적용가산세 (§114조의2)",
        formula: `${penaltyBase.toLocaleString()} × 5% (${penaltyNote ?? ""})`,
        amount: penaltyTax,
        legalBasis: TRANSFER.BUILDING_PENALTY,
        sub: true,
      });
    }
    if (penaltyDetail?.filingPenalty && penaltyDetail.filingPenalty.filingPenalty > 0) {
      // 가목·나목 혼합이면 실효세율 반올림 표기가 금액을 재현하지 못한다 — 포맷터가 분해해 적는다.
      const f = penaltyDetail.filingPenalty;
      steps.push({
        label: formatFilingPenaltyLabel(f),
        formula: formatFilingPenaltyFormula(f),
        amount: f.filingPenalty,
        legalBasis: f.legalBasis,
        sub: true,
      });
    }
    if (penaltyDetail?.delayedPaymentPenalty && penaltyDetail.delayedPaymentPenalty.delayedPaymentPenalty > 0) {
      // 이자율 구간이 둘 이상이면 대표 이자율 단일 표기가 금액을 재현하지 못한다.
      const d = penaltyDetail.delayedPaymentPenalty;
      steps.push({
        label: formatDelayedPaymentLabel(d),
        formula: formatDelayedPaymentFormula(d),
        amount: d.delayedPaymentPenalty,
        legalBasis: PENALTY.DELAYED_PAYMENT,
        sub: true,
      });
    }
    steps.push({
      label: "총결정세액",
      formula: `결정세액 ${determinedTax.toLocaleString()} + 가산세 합계 ${totalAllPenalty.toLocaleString()}`,
      amount: determinedTax + totalAllPenalty,
      legalBasis: TRANSFER.FINAL_TAX,
    });
  }

  return { penaltyDetail, filingDelayedPenalty, totalAllPenalty };
}
