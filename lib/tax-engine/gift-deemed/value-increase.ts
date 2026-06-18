/** (Phase 3) 재산 취득 후 재산가치 증가에 따른 이익의 증여 (§42의3 · 시행령 §32의3) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ValueIncreaseInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

/**
 * 시행령 §32의3③: 이익 = 해당 재산가액 − 취득가액 − 통상적 가치상승분 − 가치상승기여분.
 * 기준금액(§32의3②) = MIN((취득가액+통상상승분+기여분) × 30%, 3억). 미만이면 제외.
 */
export function calcValueIncreaseGift(input: ValueIncreaseInput): DeemedGiftResult {
  const { currentValue, acquisitionCost, normalIncrease, contribution } = input;
  const raw = currentValue - acquisitionCost - normalIncrease - contribution;
  const value0 = raw > 0 ? raw : 0;

  const deductSum = acquisitionCost + normalIncrease + contribution;
  const threshold = Math.min(safeMultiplyThenDivide(deductSum > 0 ? deductSum : 0, 30, 100), ABSOLUTE_THRESHOLD);
  const applied = value0 > 0 && value0 >= threshold;
  const value = applied ? value0 : 0;

  const breakdown: CalculationStep[] = [
    { label: "사유발생일 현재 재산가액", amount: currentValue, lawRef: GIFT.VALUE_INCREASE },
    { label: "취득가액", amount: acquisitionCost },
    { label: "통상적인 가치상승분", amount: normalIncrease },
    { label: "가치상승기여분", amount: contribution },
    { label: "이익 (재산가액 − 취득가 − 통상상승 − 기여분)", amount: value0 },
    { label: "기준금액 (차감합계 30%·3억 중 적은 금액)", amount: threshold },
    { label: "증여재산가액", amount: value, lawRef: GIFT.VALUE_INCREASE, note: "§42의3 재산취득 후 가치증가" },
  ];
  return {
    type: "value_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(차감합계 30%·3억 중 적은 금액) 미만",
    legalBasis: GIFT.VALUE_INCREASE,
    thresholdEcho: { gain: value0, threshold },
  };
}
