/**
 * 농어촌특별세 미납분의 납부지연가산세 (NH-38 · Q-22 결정: 소득세와 별도 줄 · 세목 간 상계 안 함).
 *
 * 「국세기본법」 §2 1호 차목은 「국세」에 농어촌특별세를 넣고, §47의4①의 괄호가 빼는 국세는
 * 인지세뿐이다 ⇒ 농특세를 법정납부기한까지 납부하지 않으면 그 미납분에도 납부지연가산세가 붙는다.
 * 종전에는 미납세액이 소득세 결정세액뿐이라(`resolveUnpaidTax`) 농특세분 가산세가 통째로 빠졌다.
 *
 * - 소득세분과 **따로** 산정한다(세목별 원 미만 절사) — 소득세 총결정세액·지방소득세 base에 넣지 않는다.
 * - 무신고·과소신고가산세는 붙이지 않는다 — §47의2①·§47의3①이 「「농어촌특별세법」에 따른 신고는 제외」.
 * - 미납 농특세 = 농특세 − 기납부 농특세(`paidRuralSurtax`, 미제공 0). 소득세 미납세액과 상계하지 않는다.
 *
 * 단건 finalize · 재개발 · §155⑳ 특례 · 합산(신고서 단위·자산별) · 겸용이 **이 함수 하나**를 쓴다.
 */
import { PENALTY } from "./legal-codes";
import {
  calculateDelayedPaymentPenalty,
  formatDelayedPaymentFormula,
  formatDelayedPaymentLabel,
  type DelayedPaymentInput,
  type DelayedPaymentResult,
} from "./transfer-tax-penalty";
import type { CalculationStep } from "./types/transfer.types";

export interface RuralSurtaxDelayedPenaltyDetail {
  /** 가산세 base가 된 농특세(자산별 다건은 예정신고 농특세) */
  ruralSurtax: number;
  /** 기납부 농특세 */
  paidRuralSurtax: number;
  /** 미납 농특세 = max(0, 농특세 − 기납부 농특세) */
  unpaidRuralSurtax: number;
  /** 농특세분 납부지연가산세 */
  penalty: number;
  delayed: DelayedPaymentResult;
}

/** 납부지연 입력이 없거나 미납 농특세가 0이면 undefined — 결과 객체에 키를 남기지 않는다. */
export function computeRuralSurtaxDelayedPenalty(
  details: DelayedPaymentInput | undefined,
  ruralSurtax: number,
): RuralSurtaxDelayedPenaltyDetail | undefined {
  if (!details) return undefined;
  const base = details.ruralSurtaxForPenalty ?? ruralSurtax;
  const paidRuralSurtax = details.paidRuralSurtax ?? 0;
  const unpaidRuralSurtax = Math.max(0, base - paidRuralSurtax);
  if (unpaidRuralSurtax <= 0) return undefined;
  const delayed = calculateDelayedPaymentPenalty({
    unpaidTax: unpaidRuralSurtax,
    paymentDeadline: details.paymentDeadline,
    actualPaymentDate: details.actualPaymentDate,
    calculationDate: details.calculationDate,
  });
  return {
    ruralSurtax: base,
    paidRuralSurtax,
    unpaidRuralSurtax,
    penalty: delayed.delayedPaymentPenalty,
    delayed,
  };
}

/** 산출근거 단계 — 소득세분 「납부지연가산세」 줄과 별도 줄이다. */
export function ruralSurtaxDelayedPenaltyStep(d: RuralSurtaxDelayedPenaltyDetail): CalculationStep {
  const unpaidFormula =
    d.paidRuralSurtax > 0
      ? `(농어촌특별세 ${d.ruralSurtax.toLocaleString()} − 기납부 농어촌특별세 ${d.paidRuralSurtax.toLocaleString()}) → `
      : "";
  return {
    label: `농어촌특별세 ${formatDelayedPaymentLabel(d.delayed)}`,
    formula: `${unpaidFormula}${formatDelayedPaymentFormula(d.delayed, "미납 농어촌특별세")}`,
    amount: d.penalty,
    legalBasis: PENALTY.DELAYED_PAYMENT_RURAL_SURTAX,
  };
}
