/**
 * 양도소득세 수정신고(경정) 순수 계산 엔진
 *
 * Layer 2 (Pure Engine): DB 직접 호출 없음, 순수 함수.
 *
 * 추가납부세액 = max(0, 수정 결정세액 − 당초 결정세액)
 * 신고불성실(§47의3) — §48②1호 경과기간별 자동감면 대상.
 * 납부지연(§47의4)   — §48② 감면 미적용.
 * 소득세법 §110① 확정신고기한 기준.
 */

import { addMonths, isAfter } from "date-fns";
import { AMENDMENT_REDUCTION_48_2, AMENDMENT_48_2, AMENDMENT_48_1_2, PENALTY } from "./legal-codes";
import { applyRate, truncateToWon } from "./tax-utils";
import {
  calculateFilingPenalty,
  calculateDelayedPaymentPenalty,
} from "./transfer-tax-penalty";
import type { CalculationStep } from "./types/transfer.types";
import type {
  AmendmentInput,
  AmendmentDetail,
} from "./types/transfer-amendment.types";

/**
 * §48②1호 감면율 결정.
 * "법정신고기한 후 N개월 이내" = filingDate <= addMonths(deadline, N). 오름차순 순차 매칭.
 * - notified=true → 0 (경정 예고 배제).
 * - deadline·filingDate 미제공 → 0 (validate에서 사전 차단; 방어적 0).
 * - 2년 초과 → 0.
 */
export function resolveAmendmentReductionRate(
  deadline: Date | undefined,
  filingDate: Date | undefined,
  notified: boolean | undefined,
): number {
  if (notified) return 0;
  if (!deadline || !filingDate) return 0;
  for (const { maxMonths, rate } of AMENDMENT_REDUCTION_48_2) {
    // filingDate <= deadline + maxMonths
    if (!isAfter(filingDate, addMonths(deadline, maxMonths))) return rate;
  }
  return 0; // 2년 초과
}

/**
 * 수정신고 추가납부세액 + 선택적 가산세 계산.
 *
 * @param amendment    수정신고 입력
 * @param determinedTax 이번 계산(수정)의 결정세액
 */
export function computeAmendment(
  amendment: AmendmentInput,
  determinedTax: number,
): AmendmentDetail {
  const steps: CalculationStep[] = [];

  const additionalTax = Math.max(0, determinedTax - amendment.originalDeterminedTax);
  steps.push({
    label: "추가 납부 본세",
    formula: `수정 결정세액 ${determinedTax.toLocaleString()} − 당초 결정세액 ${amendment.originalDeterminedTax.toLocaleString()}`,
    amount: additionalTax,
    legalBasis: "국세기본법 §45",
  });

  // ── 신고불성실가산세 (§47의3, §48② 감면 대상) ──
  let underReportingReductionRate = 0;
  let underReportingPenalty = 0;
  if (amendment.applyUnderReportingPenalty && additionalTax > 0) {
    const grossUnder = calculateFilingPenalty({
      determinedTax: additionalTax,
      reductionAmount: 0,
      priorPaidTax: 0,
      originalFiledTax: 0,
      excessRefundAmount: 0,
      interestSurcharge: 0,
      filingType: "under",
      penaltyReason: amendment.underReportingReason,
    }).filingPenalty;

    underReportingReductionRate =
      amendment.underReductionMode === "auto_48_2"
        ? resolveAmendmentReductionRate(
            amendment.statutoryFilingDeadline,
            amendment.amendedFilingDate,
            amendment.priorAssessmentNotified,
          )
        : 0;

    underReportingPenalty = truncateToWon(grossUnder * (1 - underReportingReductionRate));

    const reductionLabel =
      amendment.underReductionMode === "auto_48_2"
        ? ` × (1 − 감면 ${(underReportingReductionRate * 100).toFixed(0)}%)`
        : "";
    steps.push({
      label: "신고불성실가산세",
      formula: `추가납부세액 ${additionalTax.toLocaleString()} × ${(
        (grossUnder / additionalTax) * 100
      ).toFixed(0)}%${reductionLabel}`,
      amount: underReportingPenalty,
      legalBasis:
        amendment.underReductionMode === "auto_48_2" ? AMENDMENT_48_2 : PENALTY.UNDER_FILING,
      sub: true,
    });
  } else if (amendment.applyUnderReportingPenalty && amendment.underReductionMode === "exempt") {
    // 면제(§48①2호) 명시 — 금액 0이지만 근거 표기
    steps.push({
      label: "신고불성실가산세 (정당한 사유 면제)",
      formula: "국세기본법 §48①2호 — 면제",
      amount: 0,
      legalBasis: AMENDMENT_48_1_2,
      sub: true,
    });
  }

  // ── 납부지연가산세 (§47의4, §48② 감면 미적용) ──
  let latePaymentPenalty = 0;
  if (amendment.applyLatePaymentPenalty && additionalTax > 0 && amendment.statutoryFilingDeadline) {
    const dp = calculateDelayedPaymentPenalty({
      unpaidTax: additionalTax,
      paymentDeadline: amendment.statutoryFilingDeadline,
      actualPaymentDate: amendment.amendedPaymentDate,
    });
    latePaymentPenalty = dp.delayedPaymentPenalty;
    if (latePaymentPenalty > 0) {
      steps.push({
        label: `납부지연가산세 (${dp.elapsedDays}일 × ${(dp.dailyRate * 100).toFixed(3)}%)`,
        formula: `추가납부세액 ${additionalTax.toLocaleString()} × ${dp.elapsedDays}일 × ${(
          dp.dailyRate * 100
        ).toFixed(3)}%`,
        amount: latePaymentPenalty,
        legalBasis: PENALTY.DELAYED_PAYMENT,
        sub: true,
      });
    }
  }

  const additionalLocalIncomeTax = applyRate(additionalTax, 0.1);
  const totalPayable = additionalTax + underReportingPenalty + latePaymentPenalty;

  steps.push({
    label: "수정신고 총 납부세액",
    formula: `추가본세 ${additionalTax.toLocaleString()}${
      underReportingPenalty > 0 ? ` + 신고불성실 ${underReportingPenalty.toLocaleString()}` : ""
    }${latePaymentPenalty > 0 ? ` + 납부지연 ${latePaymentPenalty.toLocaleString()}` : ""}`,
    amount: totalPayable,
    legalBasis: "국세기본법 §45",
  });

  return {
    originalDeterminedTax: amendment.originalDeterminedTax,
    amendedDeterminedTax: determinedTax,
    additionalTax,
    underReportingReductionRate,
    underReportingPenalty,
    latePaymentPenalty,
    additionalLocalIncomeTax,
    totalPayable,
    steps,
  };
}
