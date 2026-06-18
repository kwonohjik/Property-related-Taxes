/** (Phase 3) 특정법인과의 거래를 통한 이익의 증여 의제 (§45의5 · 시행령 §34의5) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, SpecificCorpInput } from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000; // §34의5⑤ 증여의제이익 1억원 이상

/**
 * §45의5①: 증여의제이익 = 특정법인의 이익 × 지배주주등 주식보유비율.
 * 시행령 §34의5④: 특정법인의 이익 = 거래이익 − 법인세 상당액.
 * §34의5⑤: 증여의제이익이 1억원 이상인 경우로 한정. (한도 §45의5②는 증여세액 단계 — 별도)
 */
export function calcSpecificCorpGift(input: SpecificCorpInput): DeemedGiftResult {
  const { transactionBenefit, corporateTax, ownershipRatio } = input;
  const corpProfit = transactionBenefit - corporateTax;
  const gain = corpProfit > 0 ? safeMultiplyThenDivide(corpProfit, ownershipRatio.numer, ownershipRatio.denom) : 0;
  const applied = gain >= ABSOLUTE_THRESHOLD;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "거래이익 (증여재산·채무면제·시가−대가)", amount: transactionBenefit, lawRef: GIFT.SPECIFIC_CORP },
    { label: "법인세 상당액", amount: corporateTax },
    { label: "특정법인의 이익 (거래이익 − 법인세 상당액)", amount: corpProfit > 0 ? corpProfit : 0 },
    { label: "증여의제이익 (특정법인의 이익 × 지배주주등 지분율)", amount: value, lawRef: GIFT.SPECIFIC_CORP, note: "§45의5 특정법인 (1억원 이상 한정·한도 §45의5② 별도)" },
  ];
  return {
    type: "specific_corp",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "증여의제이익이 1억원 미만 (§34의5⑤)",
    legalBasis: GIFT.SPECIFIC_CORP,
    thresholdEcho: { gain },
  };
}
