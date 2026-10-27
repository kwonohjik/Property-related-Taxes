/**
 * 영 §163의2②2호 분자 「해당 자산가액(증여세가 과세된 증여세 과세가액)」 — 당초 증여 때 인수한 채무(④·⑧ 공용 leaf).
 *
 * 「상속세 및 증여세법」 제47조 제1항의 과세가액은 증여재산가액에서 수증자가 인수한 채무를 뺀 금액이다. 그래서 당초 증여 때 그 자산에 담보된
 * 채무를 인수한 것이 인정됐다면 분자는 평가액 − 인수채무다. 계획서 `docs/00-pm/carryover-gift-tax-numerator-net.plan.md` §2 · Q-2 a · Q-3 a.
 *
 * 토글(`giftDebtAssumed`)은 **증여 사건** 서브폼의 값이고, 금액(`giftAssumedDebt`)은 **그 파트** 서브폼의 값이다(파트마다 받는다 — 자동 안분 금지).
 * 토글이 꺼져 있으면(옛 이력 포함) 0 — 종전 세액 그대로다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

export function carryoverAssumedDebt(
  event: Pick<CarryoverTaxationForm, "giftDebtAssumed"> | undefined,
  part: Pick<CarryoverTaxationForm, "giftAssumedDebt"> | undefined,
): number {
  return event?.giftDebtAssumed ? parseAmount(part?.giftAssumedDebt ?? "") : 0;
}

/** 분자 = 평가액 − 인수채무(음수면 0 — ⑧이 채무 > 평가액을 먼저 막는다). */
export function carryoverGiftTaxedValue(valuation: number, debt: number): number {
  return Math.max(0, valuation - debt);
}
