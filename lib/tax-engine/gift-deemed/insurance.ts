/** (2) 보험금의 증여 (상증법 §34) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, InsuranceInput } from "./types";

export function calcInsuranceGift(input: InsuranceInput): DeemedGiftResult {
  const { caseType, insuranceProceeds, totalPremiumPaid, relevantPremium, isInheritanceInsurance } = input;

  if (isInheritanceInsurance) {
    return _fail("상증법 §34② — 상속재산(§8)으로 보는 보험금, 증여세 미적용");
  }
  if (totalPremiumPaid <= 0) {
    return _fail("납부보험료 총액이 0 — 판정 불가");
  }

  // floor(보험금 × 관련보험료 ÷ 총보험료)
  const proportional = safeMultiplyThenDivide(insuranceProceeds, relevantPremium, totalPremiumPaid);
  const value =
    caseType === "non_payer" ? proportional : Math.max(0, proportional - relevantPremium);

  const breakdown: CalculationStep[] = [
    { label: "보험금", amount: insuranceProceeds, lawRef: GIFT.INSURANCE },
    { label: "납부보험료 총액", amount: totalPremiumPaid },
    {
      label:
        caseType === "non_payer"
          ? "수령인 외의 자가 납부한 보험료"
          : "증여받은 재산으로 납부한 보험료",
      amount: relevantPremium,
    },
    { label: "보험금 × (관련 보험료 ÷ 총 보험료)", amount: proportional },
    ...(caseType === "gifted_premium"
      ? [{ label: "증여받은 재산으로 납부한 보험료 차감", amount: -relevantPremium, lawRef: GIFT.INSURANCE }]
      : []),
    {
      label: "증여재산가액",
      amount: value,
      lawRef: GIFT.INSURANCE,
      note: caseType === "non_payer" ? "§34①1호" : "§34①2호",
    },
  ];

  return {
    type: "insurance",
    applied: value > 0,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: value > 0 ? undefined : "증여재산가액 0",
    legalBasis: GIFT.INSURANCE,
  };
}

function _fail(reason: string): DeemedGiftResult {
  return {
    type: "insurance",
    applied: false,
    deemedGiftValue: 0,
    breakdown: [{ label: reason, amount: 0 }],
    exclusionReason: reason,
    legalBasis: GIFT.INSURANCE,
  };
}
