/** (8) 증자에 따른 이익의 증여 (§39) — 저가발행(①1호) / 고가발행(①2호) sub-case (시행령 §29②) */
import { GIFT } from "../legal-codes";
import { safeMultiply, safeMultiplyThenDivide } from "../tax-utils";
import { computeWeightedPerShare, applyListedPerShareBound } from "./capital-helpers";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type { DeemedGiftResult, CapitalIncreaseInput } from "./types";

const ABSOLUTE_THRESHOLD = 300_000_000;

const SUBTYPE_NOTE: Record<NonNullable<CapitalIncreaseInput["subType"]>, string> = {
  forfeited_realloc: "실권주 재배정",
  third_party: "제3자 직접배정",
  excess: "초과배정",
  no_realloc: "실권주 미배정·특수관계인 인수",
};

/**
 * 「상증법」§39① 괄호 — **주권상장법인이 자본시장법 §9⑦ 모집방법으로 배정하는 경우는 제외**한다.
 * 「이하 이 항에서 같다」이므로 **§39① 전체**(1호 가·나·다·라 + 2호)에 걸린다.
 *
 * ⚠️ **이중부정**: 그 모집이 「상증령」§29③이 가리키는 자본시장법 **시행령 §11③ 간주모집**
 *    (50인 미만이지만 전매기준 해당으로 모집 의제)에 불과하면 **제외가 취소**되어 과세한다.
 *    형식적 간주모집을 통한 회피를 막는 구조다.
 *
 * ⚠️ **「주권상장법인이」는 AND 조건이다** — 법문의 주어가 주권상장법인이므로, 비상장법인이
 *    모집방법으로 배정하더라도 제외되지 않는다. 이 검사를 빠뜨리면 **과소과세**다(PO-9가 고정).
 */
function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
  return input.allocationMethod === "public_offering" && input.isListed === true;
}

/** 간주모집이라 제외가 취소된 경우에만 붙이는 근거 note (감사 추적성 — 세액은 normal과 같다) */
function deemedPublicOfferingNote(input: CapitalIncreaseInput): string | undefined {
  return input.allocationMethod === "deemed_public_offering" && input.isListed === true
    ? `유가증권 모집방법 배정이나 간주모집이라 제외 취소 (${GIFT.CI_DEEMED_PUBLIC_OFFERING})`
    : undefined;
}

/** §39① 적용 제외 결과 — 산식 행은 남겨 「왜 0인지」가 보이게 한다 */
function publicOfferingExcludedResult(breakdown: CalculationStep[]): DeemedGiftResult {
  return {
    type: "capital_increase",
    applied: false,
    deemedGiftValue: 0,
    breakdown,
    exclusionReason: `주권상장법인의 유가증권 모집방법 배정 — §39① 적용 제외 (${GIFT.CI_PUBLIC_OFFERING_EXCLUSION})`,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: 0 },
  };
}

export function calcCapitalIncreaseGift(input: CapitalIncreaseInput): DeemedGiftResult {
  return (input.direction ?? "low") === "high" ? increaseHigh(input) : increaseLow(input);
}

/** ①1호 저가발행 — 가/다/라목(기준금액 없음, §29②1) · 나목(기준 30%·3억, §29②2) */
function increaseLow(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  // 증자 후 1주당 가액 = [(증자전평가×증자전주식수)+(인수가×증자주식수)] ÷ (증자전+증자주식수)
  const theoretical = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  // §29②1가 단서 — 주권상장법인등은 증자후 평가가 산식값보다 **적으면** 그 평가액(Min)
  const perShareAfter = applyListedPerShareBound(theoretical, input, "min");
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

  // §39②: 이익을 증여한 소액주주 2명 이상 → 1인 의제 (저가발행 ①1호 한정, 집계 이익 불변)
  const imputation = input.smallShareholderImputation === true;
  const imputationNote = imputation ? " · §39② 소액주주 1인 의제" : "";

  const breakdown: CalculationStep[] = [
    ...(perShareAfter !== theoretical ? [{ label: "증자 후 1주당 가액 (산식 이론값)", amount: theoretical }] : []),
    { label: "증자 후 1주당 가액", amount: perShareAfter, lawRef: GIFT.CAPITAL_INCREASE,
      note: perShareAfter !== theoretical ? `주권상장법인 평가액 적용 (${GIFT.CONTRIBUTION_LISTED_LOW})` : undefined },
    { label: "신주 1주당 인수가액", amount: newSharePrice },
    { label: "1주당 이익", amount: perShareGain },
    { label: "이익 귀속 주식수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①1호 저가발행 — ${SUBTYPE_NOTE[subType]}${imputationNote}` },
    ...(deemedPublicOfferingNote(input) ? [{ label: "배정 방법", amount: 0, note: deemedPublicOfferingNote(input) }] : []),
  ];
  // §39① 괄호 — 주권상장법인 모집방법 배정은 「배정」에서 제외되어 과세 요건 자체가 성립하지 않는다
  if (publicOfferingExcluded(input)) return publicOfferingExcludedResult(breakdown);
  return {
    type: "capital_increase",
    applied,
    deemedGiftValue: value,
    breakdown,
    exclusionReason,
    legalBasis: GIFT.CAPITAL_INCREASE,
    thresholdEcho: { gain: value, smallShareholderImputation: imputation },
  };
}

/** ①2호 고가발행 — 가목(기준금액 없음, §29②3) · 나목(비율·기준 30%·3억, §29②4) · 다·라목(비율, §29②5) */
function increaseHigh(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  const theoretical = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, issuedShares);
  // §29②3나 단서 — 주권상장법인등은 증자후 평가가 산식값보다 **크면** 그 평가액(Max)
  const perShareAfter = applyListedPerShareBound(theoretical, input, "max");
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
    ...(perShareAfter !== theoretical ? [{ label: "증자 후 1주당 가액 (산식 이론값)", amount: theoretical }] : []),
    { label: "증자 후 1주당 가액", amount: perShareAfter,
      note: perShareAfter !== theoretical ? `주권상장법인 평가액 적용 (${GIFT.CONTRIBUTION_LISTED_HIGH})` : undefined },
    { label: "1주당 차액", amount: perShareGain },
    { label: "이익 귀속 주식수", amount: forfeitedShares },
    { label: "증여재산가액", amount: value, lawRef: GIFT.CAPITAL_INCREASE, note: `§39①2호 고가발행 — ${SUBTYPE_NOTE[subType]}` },
    ...(deemedPublicOfferingNote(input) ? [{ label: "배정 방법", amount: 0, note: deemedPublicOfferingNote(input) }] : []),
  ];
  // §39① 괄호는 「이하 이 항에서 같다」로 **2호(고가)에도** 걸린다
  if (publicOfferingExcluded(input)) return publicOfferingExcludedResult(breakdown);
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
