/** (11) 전환사채 등의 주식전환 등에 따른 이익의 증여 (§40) — 저가 인수·취득 (§40①1호, 시행령 §30①1·②1) */
import { GIFT } from "../legal-codes";
import { applyRate } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ConvertibleBondInput } from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000;

export function calcConvertibleBondGift(input: ConvertibleBondInput): DeemedGiftResult {
  const { bondMarketValue, acquisitionPrice } = input;

  // 이익 = 전환사채 시가 − 인수·취득가액
  const gain = bondMarketValue - acquisitionPrice;
  // 기준금액(②1) = MIN(전환사채 시가 × 30%, 1억)
  const threshold = Math.min(applyRate(bondMarketValue, 0.3), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "전환사채 시가", amount: bondMarketValue, lawRef: GIFT.CONVERTIBLE_BOND },
    { label: "인수·취득가액", amount: acquisitionPrice },
    { label: "증여재산가액 (시가 − 인수가)", amount: value, lawRef: GIFT.CONVERTIBLE_BOND, note: "§40①1호 저가 인수·취득" },
  ];

  return {
    type: "convertible_bond",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(시가 30%·1억 중 적은 금액) 미만",
    legalBasis: GIFT.CONVERTIBLE_BOND,
    thresholdEcho: { gain, threshold },
  };
}
