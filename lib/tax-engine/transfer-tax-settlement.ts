/**
 * 확정신고 기납부세액 정산 Pure Engine (소득세법 §111③)
 *
 * 확정신고 시 결정세액에서 예정신고 기납부세액(국세·지방)을 공제해 추가납부/환급을 산출한다.
 * 기존 `MultiTransferTaxSummaryCard`의 UI 자체계산(currentTaxDue·currentLocalTaxDue·totalDue)을
 * 엔진 단일진실로 이관한 헬퍼 (dual-truth 해소). `computeAmendment` 구조 미러.
 *
 * Layer 2 원칙: DB 직접 호출 없음. 순수 함수. 정수 연산(Math.max, 절사 불요).
 *
 * 근거: 소득세법 §111③ — 확정신고납부 시 제107조 예정신고 산출세액을 공제하여 납부.
 * ⚠️ 기납부세액은 사용자 확정 입력. 예정신고 산출세액(§107②)의 재현이 아님(계획서 §2-A).
 */

import type { CalculationStep } from "./types/transfer.types";
import { PENALTY } from "./legal-codes/common";

export interface SettlementInput {
  /** 확정 결정세액 (국세, 비교과세·§133 반영) */
  determinedTax: number;
  /** 가산세 (국세). 정상 확정신고 정산 = 0 */
  penaltyTax: number;
  /** 지방소득세 결정세액 */
  localIncomeTax: number;
  /** 예정신고 기납부세액 (국세). 미지정 시 호출부에서 0 */
  priorPaidTax: number;
  /** 예정신고 기납부 지방소득세. 미지정 시 호출부에서 0 */
  priorPaidLocalTax: number;
}

export interface SettlementResult {
  priorPaidTax: number;
  priorPaidLocalTax: number;
  /** 국세 이번 납부할세액 = max(0, (결정+가산) − 기납부) */
  settlementAdditionalPayable: number;
  /** 국세 환급 = max(0, 기납부 − (결정+가산)) */
  settlementRefund: number;
  /** 지방 이번 납부할세액 = max(0, 지방결정 − 지방기납부) */
  settlementLocalPayable: number;
  /** 최종 납부할세액 = 국세 납부 + 지방 납부 */
  settlementTotalDue: number;
  step: CalculationStep;
}

/**
 * 확정신고 기납부세액 정산 (§111③).
 * 국세 base = 결정세액 + 가산세 (기존 SummaryCard currentTaxDue 이관).
 */
export function computeSettlement(input: SettlementInput): SettlementResult {
  const nationalDue = input.determinedTax + input.penaltyTax;
  const settlementAdditionalPayable = Math.max(0, nationalDue - input.priorPaidTax);
  const settlementRefund = Math.max(0, input.priorPaidTax - nationalDue);
  const settlementLocalPayable = Math.max(0, input.localIncomeTax - input.priorPaidLocalTax);
  const settlementTotalDue = settlementAdditionalPayable + settlementLocalPayable;

  const step: CalculationStep = {
    label: "예정신고 기납부세액 정산",
    formula:
      `국세 ${nationalDue.toLocaleString()} − 기납부 ${input.priorPaidTax.toLocaleString()} = ` +
      (input.priorPaidTax <= nationalDue
        ? `추가납부 ${settlementAdditionalPayable.toLocaleString()}`
        : `환급 ${settlementRefund.toLocaleString()}`),
    amount: settlementAdditionalPayable,
    legalBasis: PENALTY.FINAL_RETURN_SETTLEMENT,
  };

  return {
    priorPaidTax: input.priorPaidTax,
    priorPaidLocalTax: input.priorPaidLocalTax,
    settlementAdditionalPayable,
    settlementRefund,
    settlementLocalPayable,
    settlementTotalDue,
    step,
  };
}
