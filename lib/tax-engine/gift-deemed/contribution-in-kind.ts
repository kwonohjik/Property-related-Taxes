/** (10) 현물출자에 따른 이익의 증여 (§39의3) — 저가인수(①1호) / 고가인수(①2호) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import { computeWeightedPerShare } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ContributionInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcContributionGift(input: ContributionInput): DeemedGiftResult {
  return (input.caseType ?? "low") === "high" ? contributionHigh(input) : contributionLow(input);
}

/** ①1호 저가인수 (시행령 §29의3①1 → §29②1가 준용) */
function contributionLow(input: ContributionInput): DeemedGiftResult {
  const { preContribPrice, preContribShares, newSharePrice, contributedShares, allocatedShares } = input;
  const perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
  const perShareGain = perShareAfter - newSharePrice; // 저가: 평가 > 인수가
  const value = perShareGain > 0 ? safeMultiply(perShareGain, allocatedShares) : 0;
  const applied = value > 0;

  const breakdown: CalculationStep[] = [
    { label: "현물출자 후 1주당 가액", amount: perShareAfter, lawRef: GIFT.CONTRIBUTION },
    { label: "신주 1주당 인수가액", amount: newSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "배정받은 신주수", amount: allocatedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CONTRIBUTION, note: "§39의3①1호 저가인수" },
  ];
  return {
    type: "contribution",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "출자 후 1주가가 인수가 이하 — 이익 없음",
    legalBasis: GIFT.CONTRIBUTION,
  };
}

/** ①2호 고가인수 (시행령 §29의3①2·② → §29②3가 준용) */
function contributionHigh(input: ContributionInput): DeemedGiftResult {
  const { preContribPrice, preContribShares, newSharePrice, contributedShares, allocatedShares } = input;
  const relatedRatio = input.relatedRatio ?? { numer: 0, denom: 1 };
  const perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
  const perShareGain = newSharePrice - perShareAfter; // 고가: 인수가 > 평가
  const base = perShareGain > 0 ? safeMultiply(perShareGain, allocatedShares) : 0;
  const gain = safeMultiplyThenDivide(base, relatedRatio.numer, relatedRatio.denom);
  // §29의3② 적용요건: 차액 ≥ 출자후가 30% OR 이익 ≥ 3억
  const applied = gain > 0 && (perShareGain >= applyRate(perShareAfter, 0.3) || gain >= ABSOLUTE_THRESHOLD);
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "신주 1주당 인수가액", amount: newSharePrice, lawRef: GIFT.CONTRIBUTION },
    { label: "현물출자 후 1주당 가액", amount: perShareAfter },
    { label: "1주당 차액", amount: perShareGain },
    { label: "인수 신주수", amount: allocatedShares },
    { label: "증여재산가액 (차액 × 인수신주 × 특수관계인 지분비율)", amount: value, lawRef: GIFT.CONTRIBUTION, note: "§39의3①2호 고가인수" },
  ];
  return {
    type: "contribution",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(출자후평가 30%·3억) 미만",
    legalBasis: GIFT.CONTRIBUTION,
    thresholdEcho: { gain },
  };
}
