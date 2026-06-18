/** (8) 증자에 따른 이익의 증여 (§39) — 저가발행·실권주 재배정 (§39①1호가, 시행령 §29②1) */
import { GIFT } from "../legal-codes";
import { safeMultiply } from "../tax-utils";
import { computeWeightedPerShare } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, CapitalIncreaseInput } from "./types";

export function calcCapitalIncreaseGift(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;

  // 증자 후 1주당 가액 = [(증자전평가×증자전주식수)+(인수가×증자주식수)] ÷ (증자전+증자주식수)
  const perShareAfter = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  const perShareGain = perShareAfter - newSharePrice;
  // §39①1호가목(실권주 재배정)은 별도 기준금액 없음 — 이익 > 0이면 과세
  const value = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0;
  const applied = value > 0;

  const breakdown: CalculationStep[] = [
    { label: "증자 후 1주당 가액", amount: perShareAfter, lawRef: GIFT.CAPITAL_INCREASE },
    { label: "신주 1주당 인수가액", amount: newSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "배정받은 실권주수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: "§39①1호가 저가발행·실권주 재배정" },
  ];

  return {
    type: "capital_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "증자 후 1주가가 인수가 이하 — 이익 없음",
    legalBasis: GIFT.CAPITAL_INCREASE,
  };
}
