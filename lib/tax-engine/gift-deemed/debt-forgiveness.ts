/** (4) 채무면제 등에 따른 증여 (상증법 §36) */
import { GIFT } from "../legal-codes";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, DebtForgivenessInput } from "./types";

export function calcDebtForgivenessGift(input: DebtForgivenessInput): DeemedGiftResult {
  const { forgivenDebt, compensation } = input;
  const value = Math.max(0, forgivenDebt - compensation);

  const breakdown: CalculationStep[] = [
    { label: "면제·인수·변제 채무액", amount: forgivenDebt, lawRef: GIFT.DEBT_FORGIVENESS },
    { label: "보상(지급)액", amount: -compensation },
    { label: "증여재산가액", amount: value, lawRef: GIFT.DEBT_FORGIVENESS },
  ];

  return {
    type: "debt_forgiveness",
    applied: value > 0,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: value > 0 ? undefined : "증여재산가액 0 (보상액 ≥ 면제액)",
    legalBasis: GIFT.DEBT_FORGIVENESS,
  };
}
