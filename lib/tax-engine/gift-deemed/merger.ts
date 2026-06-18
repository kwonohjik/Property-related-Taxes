/** (7) 합병에 따른 이익의 증여 (§38) — 주식교부(§28③1) / 주식 외 재산 교부(§28③2) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, MergerInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcMergerGift(input: MergerInput): DeemedGiftResult {
  return (input.caseType ?? "stock") === "non_stock" ? mergerNonStock(input) : mergerStock(input);
}

/** §28③1 주식교부 */
function mergerStock(input: MergerInput): DeemedGiftResult {
  const mergedSharePrice = input.mergedSharePrice ?? 0;
  const { overvaluedSharePrice, majorShares } = input;
  const preMergerShares = input.preMergerShares ?? 0;
  const exchangedShares = input.exchangedShares ?? 0;

  // ㉯ = 과대평가 1주평가 × (합병 전 주식수 ÷ 교부 주식수)
  const adjustedOvervalued =
    exchangedShares > 0 ? safeMultiplyThenDivide(overvaluedSharePrice, preMergerShares, exchangedShares) : 0;
  const perShareGain = mergedSharePrice - adjustedOvervalued;
  const gain = perShareGain > 0 ? safeMultiply(perShareGain, majorShares) : 0;
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

/** §28③2 주식 외 재산 교부 (평가액이 액면 미달, 평가 초과 지급 한정) */
function mergerNonStock(input: MergerInput): DeemedGiftResult {
  const face = input.faceValue ?? 0;
  const consideration = input.mergeConsideration ?? face;
  const base = Math.min(face, consideration); // 액면가(대가가 액면 미달 시 대가)
  const { overvaluedSharePrice, majorShares } = input;
  const perShareGain = base - overvaluedSharePrice;
  const gain = perShareGain > 0 ? safeMultiply(perShareGain, majorShares) : 0;
  const threshold = ABSOLUTE_THRESHOLD; // §28④2 = 3억
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "액면가액 (대가가 액면 미달 시 대가)", amount: base, lawRef: GIFT.MERGER },
    { label: "합병당사법인 1주당 평가가액", amount: overvaluedSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "대주주등 주식수", amount: majorShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.MERGER, note: "§38 주식 외 재산 교부 (§28③2)" },
  ];
  return {
    type: "merger",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(3억) 미만",
    legalBasis: GIFT.MERGER,
    thresholdEcho: { gain, threshold },
  };
}
