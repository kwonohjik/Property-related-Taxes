/** (8) 증자에 따른 이익의 증여 (§39) — 저가발행(①1호) / 고가발행(①2호) sub-case (시행령 §29②) */
import { GIFT } from "../legal-codes";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import { computeWeightedPerShare } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, CapitalIncreaseInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

const SUBTYPE_NOTE: Record<NonNullable<CapitalIncreaseInput["subType"]>, string> = {
  forfeited_realloc: "실권주 재배정",
  third_party: "제3자 직접배정",
  excess: "초과배정",
  no_realloc: "실권주 미배정·특수관계인 인수",
};

export function calcCapitalIncreaseGift(input: CapitalIncreaseInput): DeemedGiftResult {
  return (input.direction ?? "low") === "high" ? increaseHigh(input) : increaseLow(input);
}

/** ①1호 저가발행 — 가/다/라목(기준금액 없음, §29②1) · 나목(기준 30%·3억, §29②2) */
function increaseLow(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  // 증자 후 1주당 가액 = [(증자전평가×증자전주식수)+(인수가×증자주식수)] ÷ (증자전+증자주식수)
  const perShareAfter = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  const perShareGain = perShareAfter - newSharePrice; // 저가: 평가 > 인수가
  const base = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0;

  let applied: boolean;
  let exclusionReason: string | undefined;
  if (subType === "no_realloc") {
    // §29②2: 차액 ≥ 증자후가 100분의 30 또는 차액×실권주수 ≥ 3억
    const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
    applied = base > 0 && (ratioMet || base >= ABSOLUTE_THRESHOLD);
    exclusionReason = applied ? undefined : "이익이 기준금액(증자후가 30%·3억) 미만";
  } else {
    // §29②1 가·다·라목: 기준금액 없음
    applied = base > 0;
    exclusionReason = applied ? undefined : "증자 후 1주가가 인수가 이하 — 이익 없음";
  }
  const value = applied ? base : 0;

  const breakdown: CalculationStep[] = [
    { label: "증자 후 1주당 가액", amount: perShareAfter, lawRef: GIFT.CAPITAL_INCREASE },
    { label: "신주 1주당 인수가액", amount: newSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "이익 귀속 주식수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①1호 저가발행 — ${SUBTYPE_NOTE[subType]}` },
  ];
  return {
    type: "capital_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value },
  };
}

/** ①2호 고가발행 — 가목(기준금액 없음, §29②3) · 나목(비율·기준 30%·3억, §29②4) · 다·라목(비율, §29②5) */
function increaseHigh(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  const perShareAfter = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  const perShareGain = newSharePrice - perShareAfter; // 고가: 인수가 > 평가
  const base = perShareGain > 0 ? safeMultiply(perShareGain, forfeitedShares) : 0;

  let value: number;
  let applied: boolean;
  let exclusionReason: string | undefined;
  if (subType === "forfeited_realloc") {
    // §29②3: 기준금액 없음
    applied = base > 0;
    value = applied ? base : 0;
    exclusionReason = applied ? undefined : "인수가가 증자후가 이하 — 이익 없음";
  } else {
    // §29②4(나목)·§29②5(다·라목): 특수관계인 비율 가중
    const numer = input.relatedAcquiredShares ?? 0;
    const denom = input.ratioDenomShares ?? 0;
    const weighted = denom > 0 ? safeMultiplyThenDivide(base, numer, denom) : 0;
    if (subType === "no_realloc") {
      // §29②4: 가중이익 ≥ 3억 또는 차액 ≥ 증자후가 100분의 30
      const ratioMet = perShareGain >= safeMultiplyThenDivide(perShareAfter, 30, 100);
      applied = weighted > 0 && (ratioMet || weighted >= ABSOLUTE_THRESHOLD);
      exclusionReason = applied ? undefined : "이익이 기준금액(증자후가 30%·3억) 미만";
    } else {
      // §29②5 다·라목: 기준금액 없음
      applied = weighted > 0;
      exclusionReason = applied ? undefined : "특수관계인 인수 이익 없음";
    }
    value = applied ? weighted : 0;
  }

  const breakdown: CalculationStep[] = [
    { label: "신주 1주당 인수가액", amount: newSharePrice, lawRef: GIFT.CAPITAL_INCREASE },
    { label: "증자 후 1주당 가액", amount: perShareAfter },
    { label: "1주당 차액", amount: perShareGain },
    { label: "이익 귀속 주식수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①2호 고가발행 — ${SUBTYPE_NOTE[subType]}` },
  ];
  return {
    type: "capital_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value },
  };
}
