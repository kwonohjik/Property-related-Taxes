/** (Phase 3) 주식 상장이익(§41의3) / 합병상장이익(§41의5) — 시행령 §31의3·§31의5 */
import { GIFT } from "../legal-codes";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ListingGainInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

/**
 * 시행령 §31의3①: 이익 = (정산기준일 1주당 평가가액 − 1주당 증여세과세가액/취득가액
 *  − 1주당 기업가치 실질증가이익) × 주식수.
 * 기준금액(§31의3③) = MIN((2호+3호 합계 × 주식수) × 30%, 3억). 정산(§41의3④)은 별도 단계.
 */
export function calcListingGainGift(input: ListingGainInput): DeemedGiftResult {
  const eventType = input.eventType ?? "listing";
  const { settlementPerSharePrice, perShareAcqValue, perShareCorpGrowth, shares } = input;
  const perShareGain = settlementPerSharePrice - perShareAcqValue - perShareCorpGrowth;
  const gain = perShareGain > 0 ? safeMultiply(perShareGain, shares) : 0;

  const deductBase = (perShareAcqValue + perShareCorpGrowth) * shares;
  const base = deductBase > 0 ? deductBase : 0;
  const threshold = Math.min(safeMultiplyThenDivide(base, 30, 100), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const legalBasis = eventType === "merger" ? GIFT.MERGER_LISTING_GAIN : GIFT.LISTING_GAIN;
  const label = eventType === "merger" ? "§41의5 합병상장이익" : "§41의3 상장이익";
  const breakdown: CalculationStep[] = [
    { label: "정산기준일 1주당 평가가액", amount: settlementPerSharePrice, lawRef: legalBasis },
    { label: "1주당 증여세 과세가액(취득가액)", amount: perShareAcqValue },
    { label: "1주당 기업가치 실질증가이익", amount: perShareCorpGrowth },
    { label: "1주당 이익", amount: perShareGain },
    { label: "증여·유상취득 주식수", amount: shares },
    { label: "기준금액 (차감가액합 × 주식수 × 30%·3억 중 적은 금액)", amount: threshold },
    { label: "증여재산가액", amount: value, lawRef: legalBasis, note: `${label} (정산 §41의3④ 별도)` },
  ];
  return {
    type: "listing_gain",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(차감가액합 30%·3억 중 적은 금액) 미만",
    legalBasis,
    thresholdEcho: { gain, threshold },
  };
}
