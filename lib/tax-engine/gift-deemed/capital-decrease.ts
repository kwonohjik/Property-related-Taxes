/** (9) 감자에 따른 이익의 증여 (§39의2) — 저가소각 (§39의2①1호, 시행령 §29의2①1·②) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, CapitalDecreaseInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcCapitalDecreaseGift(input: CapitalDecreaseInput): DeemedGiftResult {
  const { sharePrice, redemptionPrice, totalRedeemedShares, majorPostRatio, relatedRedeemedShares } = input;

  const diff = sharePrice - redemptionPrice;
  // 이익 = 차액 × 총감자수 × 감자후지분비율 × (관련감자 ÷ 총감자) = 차액 × 관련감자수 × 지분비율
  const base = diff > 0 ? safeMultiply(diff, relatedRedeemedShares) : 0;
  const gain = safeMultiplyThenDivide(base, majorPostRatio.numer, majorPostRatio.denom);

  // 기준금액(②) = 3억. 단, 차액이 1주평가의 30% 이상이면 기준금액 0(영)
  const threshold = diff >= applyRate(sharePrice, 0.3) ? 0 : ABSOLUTE_THRESHOLD;
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "감자주식 1주당 평가액", amount: sharePrice, lawRef: GIFT.CAPITAL_DECREASE },
    { label: "소각 시 지급한 1주당 금액", amount: redemptionPrice },
    { label: "1주당 차액", amount: diff },
    { label: "총감자 주식수", amount: totalRedeemedShares },
    { label: "대주주등 특수관계인 감자 주식수", amount: relatedRedeemedShares },
    { label: "증여재산가액 (차액 × 관련 감자주식수 × 감자후 지분비율)", amount: value, lawRef: GIFT.CAPITAL_DECREASE, note: "§39의2①1호 저가소각" },
  ];

  return {
    type: "capital_decrease",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(3억, 차액 30%↑ 시 0) 미만",
    legalBasis: GIFT.CAPITAL_DECREASE,
    thresholdEcho: { gain, threshold },
  };
}
