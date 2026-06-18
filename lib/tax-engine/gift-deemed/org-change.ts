/** (Phase 3) 법인의 조직 변경 등에 따른 이익의 증여 (§42의2 · 시행령 §32의2) */
import { GIFT } from "../legal-codes";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, OrgChangeInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

/**
 * 시행령 §32의2①: 소유지분 변동 = (변동후지분 − 변동전지분) × 변동후 1주당가액 /
 *  평가액 변동 = 변동후가액 − 변동전가액.
 * 기준금액(§32의2②) = MIN(변동 전 재산가액 × 30%, 3억). 미만이면 제외.
 */
export function calcOrgChangeGift(input: OrgChangeInput): DeemedGiftResult {
  const { subType, baseValue } = input;

  let raw: number;
  const detail: CalculationStep[] = [];
  if (subType === "share_change") {
    const diff = (input.postShares ?? 0) - (input.preShares ?? 0);
    const perShare = input.postPerSharePrice ?? 0;
    raw = diff > 0 ? safeMultiply(diff, perShare) : 0;
    detail.push(
      { label: "변동 전 지분", amount: input.preShares ?? 0, lawRef: GIFT.ORG_CHANGE },
      { label: "변동 후 지분", amount: input.postShares ?? 0 },
      { label: "변동 후 1주당 가액", amount: perShare },
    );
  } else {
    raw = (input.postValue ?? 0) - (input.preValue ?? 0);
    detail.push(
      { label: "변동 후 가액", amount: input.postValue ?? 0, lawRef: GIFT.ORG_CHANGE },
      { label: "변동 전 가액", amount: input.preValue ?? 0 },
    );
  }
  const gain = raw > 0 ? raw : 0;
  const threshold = Math.min(safeMultiplyThenDivide(baseValue, 30, 100), ABSOLUTE_THRESHOLD);
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    ...detail,
    { label: "이익 (평가차액)", amount: gain },
    { label: "기준금액 (변동전 재산가액 30%·3억 중 적은 금액)", amount: threshold },
    { label: "증여재산가액", amount: value, lawRef: GIFT.ORG_CHANGE, note: subType === "share_change" ? "§42의2 소유지분 변동" : "§42의2 평가액 변동" },
  ];
  return {
    type: "org_change",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(변동전 재산가액 30%·3억 중 적은 금액) 미만",
    legalBasis: GIFT.ORG_CHANGE,
    thresholdEcho: { gain, threshold },
  };
}
