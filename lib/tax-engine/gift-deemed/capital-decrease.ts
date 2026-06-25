/** (9) 감자에 따른 이익의 증여 (§39의2) — 저가소각(①1호) / 고가소각(①2호) */
import { GIFT } from "../legal-codes";
import { applyRate, safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, CapitalDecreaseInput } from "./types";
import { calcCapitalDecreaseMulti } from "./capital-decrease-multi";

const ABSOLUTE_THRESHOLD = 300_000_000;

export function calcCapitalDecreaseGift(input: CapitalDecreaseInput): DeemedGiftResult {
  // 멀티(불균등 감자 N:N) 모드 dispatch — shareholders 존재 시
  if (input.shareholders && input.shareholders.length > 0) return calcCapitalDecreaseMulti(input);
  return (input.caseType ?? "low") === "high" ? decreaseHigh(input) : decreaseLow(input);
}

/** ①1호 저가소각 (시행령 §29의2①1) */
function decreaseLow(input: CapitalDecreaseInput): DeemedGiftResult {
  const { sharePrice } = input;
  const redemptionPrice = input.redemptionPrice ?? 0;
  const totalRedeemedShares = input.totalRedeemedShares ?? 0;
  const majorPostRatio = input.majorPostRatio ?? { numer: 0, denom: 1 };
  const relatedRedeemedShares = input.relatedRedeemedShares ?? 0;

  const diff = sharePrice - redemptionPrice;
  // 이익 = 차액 × 관련감자수 × 감자후지분비율 (총감자 × related/총감자 = related)
  const base = diff > 0 ? safeMultiply(diff, relatedRedeemedShares) : 0;
  const gain = safeMultiplyThenDivide(base, majorPostRatio.numer, majorPostRatio.denom);
  const threshold = diff >= applyRate(sharePrice, 0.3) ? 0 : ABSOLUTE_THRESHOLD;
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "감자주식 1주당 평가액", amount: sharePrice, lawRef: GIFT.CAPITAL_DECREASE },
    { label: "소각 시 지급한 1주당 금액", amount: redemptionPrice },
    { label: "1주당 차액", amount: diff },
    { label: "총감자 주식수", amount: totalRedeemedShares },
    { label: "대주주등 특수관계인 감자 주식수", amount: relatedRedeemedShares },
    { label: "증여재산가액 (차액 × 관련 감자주식수 × 감자후 지분비율)", amount: value, lawRef: GIFT.CAPITAL_DECREASE, note: "§39의2①1호 저가소각" },
  ];
  return {
    type: "capital_decrease",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(3억, 차액 30%↑ 시 0) 미만",
    legalBasis: GIFT.CAPITAL_DECREASE,
    thresholdEcho: { gain, threshold },
  };
}

/** ①2호 고가소각 (시행령 §29의2①2 — 평가액이 액면가 미달 한정) */
function decreaseHigh(input: CapitalDecreaseInput): DeemedGiftResult {
  const { sharePrice } = input;
  const redemptionPrice = input.redemptionPrice ?? 0;
  const ownRedeemedShares = input.ownRedeemedShares ?? 0;

  const diff = redemptionPrice - sharePrice; // 고가: 소각가 > 평가
  const gain = diff > 0 ? safeMultiply(diff, ownRedeemedShares) : 0;
  const threshold = diff >= applyRate(sharePrice, 0.3) ? 0 : ABSOLUTE_THRESHOLD;
  const applied = gain > 0 && gain >= threshold;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "소각 시 지급한 1주당 금액", amount: redemptionPrice, lawRef: GIFT.CAPITAL_DECREASE },
    { label: "감자주식 1주당 평가액", amount: sharePrice },
    { label: "1주당 차액", amount: diff },
    { label: "해당 주주등 감자 주식수", amount: ownRedeemedShares },
    { label: "증여재산가액 (차액 × 해당 감자주식수)", amount: value, lawRef: GIFT.CAPITAL_DECREASE, note: "§39의2①2호 고가소각" },
  ];
  return {
    type: "capital_decrease",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason: applied ? undefined : "이익이 기준금액(3억, 차액 30%↑ 시 0) 미만",
    legalBasis: GIFT.CAPITAL_DECREASE,
    thresholdEcho: { gain, threshold },
  };
}
