/** (Phase 3) 재산 취득자금 등의 증여 추정 (§45 · 시행령 §34) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, AcquisitionFundPresumptionInput } from "./types";

const ABSOLUTE_THRESHOLD = 200_000_000; // 시행령 §34① 단서 = 2억원

/**
 * §45①②: 입증액이 취득재산가액(또는 채무상환금액)에 미달하면 그 미입증액을 증여추정.
 * 시행령 §34① 단서: 미입증액 < MIN(취득가액 100분의 20, 2억)이면 제외(전액 입증 의제).
 */
export function calcAcquisitionFundPresumption(input: AcquisitionFundPresumptionInput): DeemedGiftResult {
  const { subType, acquisitionValue, provenAmount } = input;
  const unproven = acquisitionValue - provenAmount;
  // 기준금액 = MIN(취득재산가액 × 20%, 2억)
  const threshold = Math.min(safeMultiplyThenDivide(acquisitionValue, 20, 100), ABSOLUTE_THRESHOLD);
  const applied = unproven > 0 && unproven >= threshold;
  const value = applied ? unproven : 0;

  const baseLabel = subType === "debt_repayment" ? "채무상환금액" : "취득재산가액";
  const breakdown: CalculationStep[] = [
    { label: baseLabel, amount: acquisitionValue, lawRef: GIFT.ACQUISITION_FUND_PRESUMPTION },
    { label: "입증된 금액 (소득·상속수증·처분대가)", amount: provenAmount },
    { label: "미입증액", amount: unproven },
    { label: "기준금액 (취득가액 20%·2억 중 적은 금액)", amount: threshold },
    {
      label: "증여추정가액",
      amount: value,
      lawRef: GIFT.ACQUISITION_FUND_PRESUMPTION,
      note: subType === "debt_repayment" ? "§45② 채무상환자금 증여추정" : "§45① 재산취득자금 증여추정",
    },
  ];
  return {
    type: "acquisition_fund_presumption",
    applied,
    deemedGiftValue: value,
    breakdown,
    // §47① 합산배제증여재산(§45). §55①3호 — 증여재산가액 − 3천만. (H-40·G-4)
    aggregationExcluded: true,
    exclusionReason: applied ? undefined : "미입증액이 기준금액(취득가액 20%·2억 중 적은 금액) 미만 — 증여추정 제외",
    legalBasis: GIFT.ACQUISITION_FUND_PRESUMPTION,
    thresholdEcho: { unproven, threshold },
  };
}
