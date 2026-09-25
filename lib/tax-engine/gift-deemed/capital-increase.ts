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
/**
 * 「상증령」§29③ 시행일 — **〈신설 2016.2.5〉**(본문 실측).
 *
 * 그 전에는 §39①1호 가목 괄호의 「대통령령으로 정하는 경우」가 **공집합**이라
 * 간주모집이어도 제외가 유지된다(비과세). 두 선행 구간의 결론이 같으므로 컷오프 하나로 덮인다:
 *   · 2015-12-31 이전 — 괄호 단서 자체가 없음(대법원 2013두15798: 「모집방법」에 간주모집 포함)
 *   · 2016-01-01 ~ 2016-02-04 — 괄호는 있으나 위임받은 §29③ 부존재
 */
const DEEMED_OFFERING_CANCELS_FROM = Date.UTC(2016, 1, 5);

/** 간주모집이라 제외가 **취소되는가** — 증여일이 §29③ 시행일 이후일 때만 취소된다. */
function deemedOfferingCancelsExclusion(input: CapitalIncreaseInput): boolean {
  if (input.allocationMethod !== "deemed_public_offering" || input.isListed !== true) return false;
  const d = input.giftDate;
  // 미입력 = 시기 판정 불가 ⇒ 종전 동작(취소) 유지. 필수화는 ⑧이 UI 경로에서 이미 하고 있다.
  return d == null || d.getTime() >= DEEMED_OFFERING_CANCELS_FROM;
}

function publicOfferingExcluded(input: CapitalIncreaseInput): boolean {
  if (input.isListed !== true) return false;
  if (input.allocationMethod === "public_offering") return true;
  // 간주모집도 §29③ 시행 전이면 「모집방법 배정」으로 제외된다.
  return input.allocationMethod === "deemed_public_offering" && !deemedOfferingCancelsExclusion(input);
}

/** 간주모집이라 제외가 취소된 경우에만 붙이는 근거 note (감사 추적성 — 세액은 normal과 같다) */
function deemedPublicOfferingNote(input: CapitalIncreaseInput): string | undefined {
  return deemedOfferingCancelsExclusion(input)
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

/**
 * 「상증령」§29②2호 **다목** — 실권주 총수 × 증자후 신주인수자의 지분비율 ×
 * (신주인수자의 특수관계인의 실권주수 ÷ 실권주 총수).
 *
 * 실권주 총수가 약분되므로 **지분비율 × 특수관계인 실권주수**로 계산한다 — 법문 그대로
 * 세 항을 차례로 곱하면 중간 절사가 두 번 일어나 1원 단위가 어긋난다.
 * 두 인자가 **모두** 있을 때만 적용하고, 없으면 종전 동작(원시 실권주수)을 유지한다
 * (계획서 `gift-capital-increase-section39.plan.md:171`의 하위호환 방침).
 */
function danmokShares(input: CapitalIncreaseInput, fallback: number): number {
  const related = input.relatedAcquiredShares;
  const ratio = input.postIssueSubscriberRatio;
  if (related == null || ratio == null || ratio.denom <= 0) return fallback;
  return safeMultiplyThenDivide(related, ratio.numer, ratio.denom);
}

/** ①1호 저가발행 — 가/다/라목(기준금액 없음, §29②1) · 나목(기준 30%·3억, §29②2) */
function increaseLow(input: CapitalIncreaseInput): DeemedGiftResult {
  const { preIssuePrice, preIssueShares, newSharePrice, issuedShares, forfeitedShares } = input;
  const subType = input.subType ?? "forfeited_realloc";
  // 증자 후 1주당 가액 = [(증자전평가×증자전주식수)+(인수가×증자주식수)] ÷ (증자전+증자주식수)
  // §29②2호 가목 — **나목만** 그 수량이 「증자전의 지분비율대로 균등하게 증자하는 경우의
  //   증가주식수」다. 1호 가목(가·다·라목)은 「증자에 의하여 증가한 주식수」(실제)이므로
  //   여기서 갈라야 한다. 미입력은 실제 수량으로 되돌아간다(하위호환).
  const equalIssue = input.equalIssueShares;
  const perShareBasisShares =
    subType === "no_realloc" && equalIssue != null && equalIssue > 0 ? equalIssue : issuedShares;
  const theoretical = computeWeightedPerShare(preIssuePrice, preIssueShares, newSharePrice, perShareBasisShares);
  // §29②1가 단서 — 주권상장법인등은 증자후 평가가 산식값보다 **적으면** 그 평가액(Min)
  const perShareAfter = applyListedPerShareBound(theoretical, input, "min");
  const perShareGain = perShareAfter - newSharePrice; // 저가: 평가 > 인수가
  // 나목만 §29②2호 다목으로 가중한다. 가·다·라목(§29②1호 다목)은 「배정받은 실권주수 또는
  // 신주수」가 그대로 곱셈 인자라 원시 주식수가 맞다 — 같은 「다목」이지만 다른 호의 정의다.
  const attributedShares = subType === "no_realloc" ? danmokShares(input, forfeitedShares) : forfeitedShares;
  const base = perShareGain > 0 ? safeMultiply(perShareGain, attributedShares) : 0;

  let applied: boolean;
  let exclusionReason: string | undefined;
  if (subType === "no_realloc") {
    // §29②2: 차액 ≥ 증자후가 100분의 30 또는 「그 가액에 **다목의 규정에 의한 실권주수**를
    //         곱하여 계산한 가액」 ≥ 3억 ⇒ 3억 arm은 **가중 후** base로 판정한다.
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
    { label: "이익 귀속 주식수", amount: attributedShares,
      note: attributedShares !== forfeitedShares
        ? `§29②2호 다목 가중 — 실권주 ${forfeitedShares}주 × 증자후 지분비율`
        : undefined },
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
    // §29②3호: 기준금액 없음. 다목 = 신주인수를 포기한 주주의 실권주수 ×
    //          (포기 주주의 특수관계인이 인수한 실권주수 ÷ 실권주 총수).
    //          `forfeitedShares`가 첫 항이고 두 인자가 비율을 이룬다. 미입력 = 가중 1.0(종전).
    const numer = input.relatedAcquiredShares;
    const denom = input.ratioDenomShares;
    const weighted =
      numer != null && denom != null && denom > 0
        ? safeMultiplyThenDivide(base, numer, denom)
        : base;
    applied = weighted > 0;
    value = applied ? weighted : 0;
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
