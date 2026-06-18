/** (6) 금전 무상대출 등에 따른 이익의 증여 (상증법 §41의4) */
import { GIFT } from "../legal-codes";
import { applyRateFraction } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, FreeLoanInput } from "./types";
import { FREE_LOAN_THRESHOLD } from "../data/gift-deemed-rates";

export function calcFreeLoanGift(input: FreeLoanInput): DeemedGiftResult {
  const { loanAmount, actualInterestPaid, appropriateRate, isRelatedParty, hasJustifiableReason } = input;

  if (!isRelatedParty && hasJustifiableReason) {
    return {
      type: "free_loan",
      applied: false,
      deemedGiftValue: 0,
      breakdown: [{ label: "상증법 §41의4③ — 거래관행상 정당한 사유 (비특수관계인)", amount: 0 }],
      exclusionReason: "거래관행상 정당한 사유 (비특수관계인)",
      legalBasis: GIFT.FREE_LOAN,
    };
  }

  const interestByRate = applyRateFraction(loanAmount, appropriateRate.numer, appropriateRate.denom);
  const benefit = interestByRate - actualInterestPaid;
  const value = Math.max(0, benefit);
  const applied = benefit >= FREE_LOAN_THRESHOLD;
  const ratePct = (appropriateRate.numer * 100) / appropriateRate.denom;

  const steps: CalculationStep[] = [
    { label: "대출금액", amount: loanAmount, lawRef: GIFT.FREE_LOAN },
    { label: `적정이자율(${ratePct}%) 적용액`, amount: interestByRate },
    { label: "실제 지급이자", amount: -actualInterestPaid },
    { label: "증여이익 (적정이자 − 실제이자)", amount: benefit },
  ];
  if (!applied) {
    return {
      type: "free_loan",
      applied: false,
      deemedGiftValue: 0,
      breakdown: steps,
      exclusionReason: "증여이익 1천만 미만",
      legalBasis: GIFT.FREE_LOAN,
      thresholdEcho: { benefit, threshold: FREE_LOAN_THRESHOLD },
    };
  }
  steps.push({ label: "증여재산가액", amount: value, lawRef: GIFT.FREE_LOAN });
  return { type: "free_loan", applied: true, deemedGiftValue: value, breakdown: steps, legalBasis: GIFT.FREE_LOAN };
}
