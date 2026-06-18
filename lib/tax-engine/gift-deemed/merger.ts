/** (7) 합병에 따른 이익의 증여 (§38) — 주식교부 (대주주등), 시행령 §28③1·④1·⑤ */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, MergerInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcMergerGift(input: MergerInput): DeemedGiftResult {
  const { mergedSharePrice, overvaluedSharePrice, preMergerShares, exchangedShares, majorShares } = input;

  // ㉯ = 과대평가 1주평가 × (합병 전 주식수 ÷ 교부 주식수)
  const adjustedOvervalued =
    exchangedShares > 0
      ? safeMultiplyThenDivide(overvaluedSharePrice, preMergerShares, exchangedShares)
      : 0;
  const perShareGain = mergedSharePrice - adjustedOvervalued;
  const gain = perShareGain > 0 ? safeMultiply(perShareGain, majorShares) : 0;

  // 기준금액(④1) = MIN(합병 후 대주주 주식 평가액 × 30%, 3억)
  const threshold = Math.min(applyRate(safeMultiply(mergedSharePrice, majorShares), 0.3), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "합병 후 1주당 평가가액", amount: mergedSharePrice, lawRef: GIFT.MERGER },
    { label: "과대평가법인 1주당 평가가액 (합병전÷교부 비율 조정)", amount: adjustedOvervalued },
    { label: "1주당 이익", amount: perShareGain },
    { label: "대주주등 교부 주식수", amount: majorShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.MERGER, note: "§38 주식교부" },
  ];

  return {
    type: "merger",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(합병후평가 30%·3억 중 적은 금액) 미만",
    legalBasis: GIFT.MERGER,
    thresholdEcho: { gain, threshold },
  };
}
