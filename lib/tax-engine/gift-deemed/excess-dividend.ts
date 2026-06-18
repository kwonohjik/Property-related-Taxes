/** (Phase 3) 초과배당에 따른 이익의 증여 (§41의2 · 시행령 §31의2) */
import { GIFT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ExcessDividendInput } from "./types";

/**
 * §41의2①: 증여재산가액 = 초과배당금액 − 초과배당금액에 대한 소득세 상당액.
 * 소득세 상당액(시행규칙 §10의3 누진율표·실제소득세)은 직접 입력. 정산(§41의2②③)은 별도 단계.
 */
export function calcExcessDividendGift(input: ExcessDividendInput): DeemedGiftResult {
  const { excessDividend, incomeTaxEquivalent } = input;
  const raw = excessDividend - incomeTaxEquivalent;
  const value = raw > 0 ? raw : 0;
  const applied = value > 0;

  const breakdown: CalculationStep[] = [
    { label: "초과배당금액", amount: excessDividend, lawRef: GIFT.EXCESS_DIVIDEND },
    { label: "초과배당금액에 대한 소득세 상당액", amount: incomeTaxEquivalent },
    { label: "증여재산가액 (초과배당금액 − 소득세 상당액)", amount: value, lawRef: GIFT.EXCESS_DIVIDEND, note: "§41의2① 초과배당 (정산 §41의2②③ 별도)" },
  ];
  return {
    type: "excess_dividend",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "초과배당금액이 소득세 상당액 이하 — 이익 없음",
    legalBasis: GIFT.EXCESS_DIVIDEND,
    thresholdEcho: { gain: value },
  };
}
