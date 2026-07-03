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

import { addMonths, addYears, isAfter } from "date-fns";
import {
  AMENDMENT_REDUCTION_48_2,
  AMENDMENT_45,
  AMENDMENT_48_2,
  AMENDMENT_48_1_2,
  PENALTY,
  CORRECTION_CLAIM_45_2,
  CLAIM_PERIOD_ORDINARY_YEARS,
  CLAIM_PERIOD_POSTERIOR_MONTHS,
} from "./legal-codes";
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
 * ISO "YYYY-MM-DD" — getUTC* 사용.
 * date-coerce가 `new Date("YYYY-MM-DD")`=UTC 자정으로 파싱하므로 로컬 getter·`format`·`toISOString`은
 * UTC-음수 오프셋 환경에서 −1일 드리프트. getUTC*가 tz-안전.
 */
function toISODateUTC(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 경정청구 청구기한 도출 (국세기본법 §45의2).
 * - ordinary(①): 법정신고기한 + 5년.
 * - posterior(②): 후발적 사유 안 날 + 3개월.
 * 날짜 연산(addYears/addMonths) — 일수환산·differenceInCalendarMonths 금지(경계 오판정).
 */
export function resolveClaimDeadline(
  reasonType: "ordinary" | "posterior" | undefined,
  statutoryFilingDeadline: Date | undefined,
  posteriorEventDate: Date | undefined,
): Date | undefined {
  if (reasonType === "posterior")
    return posteriorEventDate ? addMonths(posteriorEventDate, CLAIM_PERIOD_POSTERIOR_MONTHS) : undefined;
  return statutoryFilingDeadline ? addYears(statutoryFilingDeadline, CLAIM_PERIOD_ORDINARY_YEARS) : undefined;
}

/**
 * 경정청구 환급세액 계산 (correctionKind="refund_claim").
 * 환급세액 = max(0, 당초 결정세액 − 경정 결정세액). 국세환급가산금은 세무서 산정(지급결정일 미정) — UI 안내만.
 */
function computeRefundClaim(a: AmendmentInput, determinedTax: number): AmendmentDetail {
  const refundTax = Math.max(0, a.originalDeterminedTax - determinedTax);
  const refundLocalIncomeTax = applyRate(refundTax, 0.1); // 참고 근사(지자체 별도 경정청구)
  const claimDeadline = resolveClaimDeadline(
    a.claimReasonType,
    a.statutoryFilingDeadline,
    a.posteriorEventDate,
  );
  const isDeadlineExceeded = !!(
    claimDeadline && a.amendedFilingDate && isAfter(a.amendedFilingDate, claimDeadline)
  );

  const steps: CalculationStep[] = [
    {
      label: "당초 결정세액",
      formula: "당초 신고·납부한 양도소득세 본세",
      amount: a.originalDeterminedTax,
      legalBasis: CORRECTION_CLAIM_45_2,
    },
    {
      label: "경정 결정세액",
      formula: "정정 후 재계산한 결정세액",
      amount: determinedTax,
      legalBasis: CORRECTION_CLAIM_45_2,
    },
    {
      label: "환급세액",
      formula: `당초 결정세액 ${a.originalDeterminedTax.toLocaleString()} − 경정 결정세액 ${determinedTax.toLocaleString()}`,
      amount: refundTax,
      legalBasis: CORRECTION_CLAIM_45_2,
    },
    {
      label: "참고 · 지방소득세 환급 (지자체 별도 경정청구)",
      formula: `환급세액 ${refundTax.toLocaleString()} × 10%`,
      amount: refundLocalIncomeTax,
      legalBasis: "지방세법 제103조의",
      sub: true,
    },
  ];

  return {
    correctionKind: "refund_claim",
    originalDeterminedTax: a.originalDeterminedTax,
    amendedDeterminedTax: determinedTax,
    // amend 필드 0 (거울상 — refund는 추가납부·가산세 없음)
    additionalTax: 0,
    underReportingReductionRate: 0,
    underReportingPenalty: 0,
    latePaymentPenalty: 0,
    additionalLocalIncomeTax: 0,
    totalPayable: 0,
    // refund 전용
    refundTax,
    refundLocalIncomeTax,
    claimReasonType: a.claimReasonType,
    claimDeadline: claimDeadline ? toISODateUTC(claimDeadline) : undefined,
    isDeadlineExceeded,
    steps,
  };
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
  // 경정청구(세액 감소·환급) — 방향 분기 (미지정=amend → 기존 경로 바이트 불변)
  if ((amendment.correctionKind ?? "amend") === "refund_claim")
    return computeRefundClaim(amendment, determinedTax);

  const steps: CalculationStep[] = [];

  const additionalTax = Math.max(0, determinedTax - amendment.originalDeterminedTax);
  steps.push({
    label: "추가 납부 본세",
    formula: `수정 결정세액 ${determinedTax.toLocaleString()} − 당초 결정세액 ${amendment.originalDeterminedTax.toLocaleString()}`,
    amount: additionalTax,
    legalBasis: AMENDMENT_45,
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
    legalBasis: AMENDMENT_45,
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
