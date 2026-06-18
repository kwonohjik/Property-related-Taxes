/** (10) 현물출자에 따른 이익의 증여 (§39의3) — 저가인수 (§39의3①1호, 시행령 §29의3①1 → §29②1가 준용) */
import { GIFT } from "../legal-codes";
import { safeMultiply } from "../tax-utils";
import { computeWeightedPerShare } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ContributionInput } from "./types";

export function calcContributionGift(input: ContributionInput): DeemedGiftResult {
  const { preContribPrice, preContribShares, newSharePrice, contributedShares, allocatedShares } = input;

  // 현물출자 후 1주당 가액 (§29②1가 준용, "증자"→"현물출자")
  const perShareAfter = computeWeightedPerShare(preContribPrice, preContribShares, newSharePrice, contributedShares);
  const perShareGain = perShareAfter - newSharePrice;
  // §39의3①1호(저가인수)는 별도 기준금액 없음
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
