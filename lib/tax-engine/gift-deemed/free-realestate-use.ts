/** (5) 부동산 무상사용에 따른 이익의 증여 (상증법 §37) */
import { GIFT } from "../legal-codes";
import { applyRateFraction, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, FreeRealEstateInput } from "./types";
import {
  FREE_USE_ANNUAL_RATE,
  FREE_USE_DISCOUNT,
  FREE_USE_YEARS,
  FREE_USE_THRESHOLD,
  FREE_LOAN_THRESHOLD,
} from "../data/gift-deemed-rates";

export function calcFreeRealEstateGift(input: FreeRealEstateInput): DeemedGiftResult {
  const { subType, propertyValue, loanAmount, actualInterestPaid, isRelatedParty, hasJustifiableReason } = input;

  if (!isRelatedParty && hasJustifiableReason) {
    return _fail("상증법 §37③ — 거래관행상 정당한 사유 (비특수관계인)");
  }

  if (subType === "free_use") {
    const pv = propertyValue ?? 0;
    // 연간 무상사용이익 = floor(부동산가액 × 2/100)
    const annualBenefit = applyRateFraction(pv, FREE_USE_ANNUAL_RATE.numer, FREE_USE_ANNUAL_RATE.denom);
    let pvSum = 0;
    for (let n = 1; n <= FREE_USE_YEARS; n++) {
      // floor(연이익 × 10^n / 11^n) — 1/1.1^n 정수경로
      pvSum += safeMultiplyThenDivide(annualBenefit, FREE_USE_DISCOUNT.unit ** n, FREE_USE_DISCOUNT.base ** n);
    }
    const applied = pvSum >= FREE_USE_THRESHOLD;
    const steps: CalculationStep[] = [
      { label: "부동산 가액", amount: pv, lawRef: GIFT.FREE_REALESTATE },
      { label: "연간 무상사용이익 (부동산가액 × 2%)", amount: annualBenefit },
      { label: `${FREE_USE_YEARS}년 현가합 (할인율 10%)`, amount: pvSum, lawRef: GIFT.FREE_REALESTATE },
    ];
    if (!applied) {
      return {
        type: "free_realestate",
        applied: false,
        deemedGiftValue: 0,
        breakdown: steps,
        exclusionReason: "무상사용이익 1억 미만",
        legalBasis: GIFT.FREE_REALESTATE,
        thresholdEcho: { pvSum, threshold: FREE_USE_THRESHOLD },
      };
    }
    steps.push({ label: "증여재산가액", amount: pvSum, lawRef: GIFT.FREE_REALESTATE, note: "§37① 무상사용" });
    return { type: "free_realestate", applied: true, deemedGiftValue: pvSum, breakdown: steps, legalBasis: GIFT.FREE_REALESTATE };
  }

  // collateral (무상담보) — 차입금 × 4.6% − 실제이자
  const loan = loanAmount ?? 0;
  const interest = actualInterestPaid ?? 0;
  const rateApplied = applyRateFraction(loan, 46, 1000);
  const benefit = rateApplied - interest;
  const value = Math.max(0, benefit);
  const applied = benefit >= FREE_LOAN_THRESHOLD;
  const steps: CalculationStep[] = [
    { label: "차입금", amount: loan, lawRef: GIFT.FREE_REALESTATE },
    { label: "적정이자율 4.6% 적용액", amount: rateApplied },
    { label: "실제 지급이자", amount: -interest },
    { label: "차입이익", amount: benefit },
  ];
  if (!applied) {
    return {
      type: "free_realestate",
      applied: false,
      deemedGiftValue: 0,
      breakdown: steps,
      exclusionReason: "차입이익 1천만 미만",
      legalBasis: GIFT.FREE_REALESTATE,
      thresholdEcho: { benefit, threshold: FREE_LOAN_THRESHOLD },
    };
  }
  steps.push({ label: "증여재산가액", amount: value, lawRef: GIFT.FREE_REALESTATE, note: "§37② 무상담보" });
  return { type: "free_realestate", applied: true, deemedGiftValue: value, breakdown: steps, legalBasis: GIFT.FREE_REALESTATE };
}

function _fail(reason: string): DeemedGiftResult {
  return {
    type: "free_realestate",
    applied: false,
    deemedGiftValue: 0,
    breakdown: [{ label: reason, amount: 0 }],
    exclusionReason: reason,
    legalBasis: GIFT.FREE_REALESTATE,
  };
}
