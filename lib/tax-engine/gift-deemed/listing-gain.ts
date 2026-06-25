/** (Phase 3) 주식 상장이익(§41의3) / 합병상장이익(§41의5) — 시행령 §31의3·§31의5 */
import { GIFT } from "../legal-codes";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, ListingGainInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

/**
 * 시행령 §31의3①: 이익 = (정산기준일 1주당 평가가액 − 1주당 증여세과세가액/취득가액
 *  − 1주당 기업가치 실질증가이익) × 주식수.
 * 기준금액(§31의3③) = MIN((2호+3호 합계 × 주식수) × 30%, 3억).
 * 정산(§41의3④): 본문은 당초 과세가액에 가산하여 정산(과세), 단서·령§31의3⑥은 평가손실 환급.
 *  - direction="taxation": 이익 ≥ 기준 → 증여재산가액
 *  - direction="refund":   손실 ≥ 기준 → refundBase(=(B+C)−A), 당초 납부세액 환급
 *  - direction="none":     이익·손실이 기준 미만
 */
export function calcListingGainGift(input: ListingGainInput): DeemedGiftResult {
  const eventType = input.eventType ?? "listing";
  const { settlementPerSharePrice, perShareAcqValue, perShareCorpGrowth, shares } = input;
  const perShareGain = settlementPerSharePrice - perShareAcqValue - perShareCorpGrowth;
  // 부호 유지 — 음수(손실)는 환급 판정용. safeMultiply는 비음수 입력 전제 → 절댓값 후 부호 복원.
  const absTotal = safeMultiply(Math.abs(perShareGain), shares);
  const totalGain = perShareGain >= 0 ? absTotal : -absTotal;

  // 차감가액합(B+C)×주식수 — absTotal과 동일 자릿수이므로 overflow 가드(safeMultiply) 일관 적용. 음수는 0 클램프.
  const deductBase = safeMultiply(Math.max(0, perShareAcqValue + perShareCorpGrowth), shares);
  const threshold = Math.min(safeMultiplyThenDivide(deductBase, 30, 100), ABSOLUTE_THRESHOLD);

  let direction: "taxation" | "refund" | "none";
  let value: number;
  let refundBase: number;
  if (totalGain > 0 && totalGain >= threshold) {
    direction = "taxation";
    value = totalGain;
    refundBase = 0;
  } else if (totalGain < 0 && -totalGain >= threshold) {
    direction = "refund";
    value = 0;
    refundBase = -totalGain;
  } else {
    direction = "none";
    value = 0;
    refundBase = 0;
  }
  const applied = direction === "taxation";

  const legalBasis = eventType === "merger" ? GIFT.MERGER_LISTING_GAIN : GIFT.LISTING_GAIN;
  const label = eventType === "merger" ? "§41의5 합병상장이익" : "§41의3 상장이익";
  const breakdown: CalculationStep[] = [
    { label: "정산기준일 1주당 평가가액", amount: settlementPerSharePrice, lawRef: legalBasis },
    { label: "1주당 증여세 과세가액(취득가액)", amount: perShareAcqValue },
    { label: "1주당 기업가치 실질증가이익", amount: perShareCorpGrowth },
    { label: "1주당 이익", amount: perShareGain },
    { label: "증여·유상취득 주식수", amount: shares },
    { label: "기준금액 (차감가액합 × 주식수 × 30%·3억 중 적은 금액)", amount: threshold },
    direction === "refund"
      ? {
          label: "평가손실 환급 대상액",
          amount: refundBase,
          lawRef: legalBasis,
          note: `${label} (§41의3④ 단서 — 당초 납부세액 환급)`,
        }
      : {
          label: "증여재산가액",
          amount: value,
          lawRef: legalBasis,
          note: `${label} (정산 §41의3④ 가산)`,
        },
  ];
  return {
    type: "listing_gain",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason:
      direction === "none"
        ? "이익·손실이 기준금액(차감가액합 30%·3억 중 적은 금액) 미만"
        : undefined,
    legalBasis,
    thresholdEcho: { gain: totalGain, threshold },
    aggregationExcluded: true, // §47① 합산배제증여재산 — 본세 §55①3호 스트림 연계
    direction,
    refundBase,
  };
}
