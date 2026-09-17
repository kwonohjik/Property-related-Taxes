/** (Phase 3) 특정법인과의 거래를 통한 이익의 증여 의제 (§45의5 · 시행령 §34의5) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide, truncateToThousand } from "../tax-utils";
import { calcInheritanceGiftTax } from "../inheritance-gift-common";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  DeemedGiftResult,
  SpecificCorpInput,
  SpecificCorpDonee,
  SpecificCorpEligibility,
  SpecificCorpLimitCalc,
} from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000; // §34의5⑤ 증여의제이익 1억원 이상
const FILING_CREDIT_NUMER = 3; // §69 신고세액공제 3%
const FILING_CREDIT_DENOM = 100;
const CONTROLLING_RATIO_NUMER = 30; // §45의5① 100분의 30
const CONTROLLING_RATIO_DENOM = 100;

/**
 * §45의5① ⓐ 「특정법인」 해당성 — 「지배주주등의 주식보유비율이 100분의 30 이상인 법인」.
 *
 * ── 이름이 같은 두 비율을 분리한다 ──
 * - **ⓐ 해당성(법인 단위)**: 법 §45의5① 「지배주주등의 주식보유비율이 100분의 30 이상인 **법인**
 *   (이하 이 조 및 제68조에서 "특정법인"이라 한다)」. 「지배주주등」은 법 §45의4①이
 *   「지배주주와 그 친족(이하 이 조 및 **제45조의5**에서 "지배주주등"이라 한다)」으로 정의한 **집합**이다.
 *   ⇒ 그룹 **합계** 비율이고, 미달이면 §45의5 자체가 성립하지 않는다.
 * - **ⓑ 승수(개인 단위)**: 상증령 §34의5⑨ 「제4항제1호의 금액에 **해당** 지배주주등의 주식보유비율을
 *   곱한 금액을 해당 지배주주등이 **각각** 직접 증여받은 것으로 볼 때의 증여세」 + 동 ⑤ 「증여의제이익이
 *   1억원 이상인 경우로 **한정**」. ⇒ 인별이다.
 *   ⚠️ 두 축을 섞으면 그룹 35%인 특정법인에서 개인 20%를 보유한 수증자의 정당한 과세분이 0원이 된다.
 *   **ⓑ는 이 게이트가 건드리지 않는다.**
 *
 * ── 직접지분 합계는 「하한」이다 ──
 * 「주식보유비율」의 정의는 법 §45의3①이 외부화한다 — 「**직접 또는 간접으로** 보유하는 주식보유비율
 * (이하 이 조, 제45조의4 및 **제45조의5**에서 "주식보유비율"이라 한다)」.
 * 앱은 간접보유를 수집하지 않으므로 roster의 직접지분 합계로는 **충족만 확정**되고 미달은 확정되지 않는다.
 * ⇒ 간접분을 포함한 합계를 사용자가 신고하는 축(`controllingGroupRatio`)을 둔다.
 *
 * ── 미신고 시 두 모드가 갈리는 이유 ──
 * - `roster`: 발행주식 총수 + 주주 전원 명부를 받으므로 「신고된 것이 전부」로 볼 근거가 있다
 *   ⇒ 미신고 = 간접보유 0%로 보고 **판정한다**(사유 문구에 그 전제를 적는다).
 * - `single`: 그룹 명부가 없다. 입력된 비율은 수증자 1인분(ⓑ)이라 그룹의 하한으로 쓰기엔 너무 약하다
 *   ⇒ 미신고 = **판정하지 않고**(`"unknown"`) 결과뷰가 고지한다. 그룹 30%↑인 정상 계산을 죽이지 않기 위함.
 */
function meetsControllingRatio(numer: number, denom: number): boolean {
  // numer/denom ≥ 30/100 ↔ numer×100 ≥ 30×denom (정수 교차곱 — 부동소수 비교 금지)
  return denom > 0 && numer * CONTROLLING_RATIO_DENOM >= CONTROLLING_RATIO_NUMER * denom;
}

function toPct(numer: number, denom: number): number {
  // (numer×100)÷denom 순서 — (numer÷denom)×100은 29%를 28.999999999999996으로 만든다(실측)
  return denom > 0 ? (numer * 100) / denom : 0;
}

export function evaluateSpecificCorpEligibility(
  direct: { numer: number; denom: number },
  declared: { numer: number; denom: number } | undefined,
  mode: "single" | "roster",
): SpecificCorpEligibility {
  const directPct = toPct(direct.numer, direct.denom);
  const declaredPct = declared ? toPct(declared.numer, declared.denom) : undefined;
  const effectivePct = Math.max(directPct, declaredPct ?? 0); // 직접분은 증명된 하한 — 신고값이 더 낮아도 내려가지 않는다
  if (meetsControllingRatio(direct.numer, direct.denom)) {
    return { directPct, declaredPct, effectivePct, met: "yes" };
  }
  if (declared) {
    return {
      directPct,
      declaredPct,
      effectivePct,
      met: meetsControllingRatio(declared.numer, declared.denom) ? "yes" : "no",
    };
  }
  return { directPct, declaredPct, effectivePct, met: mode === "roster" ? "no" : "unknown" };
}

/** ⓐ 미충족 사유 — 간접보유를 0%로 본 전제를 함께 적어 사용자가 되돌릴 수 있게 한다. */
function notSpecificCorpReason(e: SpecificCorpEligibility): string {
  const base = `지배주주등 주식보유비율 ${e.effectivePct.toFixed(1)}% — 100분의 30 미만이라 특정법인이 아닙니다 (§45의5①)`;
  return e.declaredPct === undefined
    ? `${base}. 간접보유분을 0%로 보았습니다 — 간접보유가 있으면 「지배주주등 합계 주식보유비율」에 직접+간접 합계를 입력하십시오.`
    : base;
}

/**
 * 상증령 §34의5④2호 — 법인세 안분 = (산출세액 − 공제감면) × min(거래이익, 소득금액) ÷ 소득금액.
 *
 * **법인 단위 계산이라 주주 명부와 무관하다** — single(지분율 직접)·roster(주주명부) 양쪽이 공유한다.
 * `annualIncome`이 0이면 안분 불가 → 호출자가 직접 넣은 `corporateTax` fallback.
 */
export function apportionCorporateTax(input: SpecificCorpInput): number {
  const annualIncome = input.annualIncome ?? 0;
  const corpTaxNet = Math.max(
    0,
    (input.corporateTaxComputed ?? 0) - (input.corporateTaxCredit ?? 0),
  );
  return annualIncome > 0
    ? safeMultiplyThenDivide(
        corpTaxNet,
        Math.min(input.transactionBenefit, annualIncome),
        annualIncome,
      ) // min으로 비율 1 상한
    : (input.corporateTax ?? 0); // 이월결손금 0 / 직접입력 fallback
}

/**
 * §45의5①: 증여의제이익 = 특정법인의 이익 × 지배주주등 주식보유비율.
 * 시행령 §34의5④: 특정법인의 이익 = 거래이익 − 법인세 상당액.
 * §34의5⑤: 증여의제이익이 1억원 이상인 경우로 한정. (한도 §45의5②는 증여세액 단계 — 별도)
 *
 * single — 지분율은 호출자가 `ownershipRatio`로 전달한다.
 * 법인세는 직접입력(`corporateTax`)이거나, 미전달 시 §34의5④2호 안분(`annualIncome` 등)을 쓴다.
 * 종전에는 안분이 roster 전용이라 UI의 「지분율 직접 + 법인세 자동안분」 조합이 항상 0원이었다.
 */
export function calcSpecificCorpGift(input: SpecificCorpInput): DeemedGiftResult {
  const { transactionBenefit } = input;
  const corporateTax = input.corporateTax ?? apportionCorporateTax(input);
  const ratio = input.ownershipRatio ?? { numer: 0, denom: 1 };
  const corpProfit = transactionBenefit - corporateTax;
  const gain = corpProfit > 0 ? safeMultiplyThenDivide(corpProfit, ratio.numer, ratio.denom) : 0;
  // ⓐ 특정법인 해당성 — single은 그룹 명부가 없어 미신고면 "unknown"(판정 보류)이다.
  const eligibility = evaluateSpecificCorpEligibility(ratio, input.controllingGroupRatio, "single");
  const applied = eligibility.met !== "no" && gain >= ABSOLUTE_THRESHOLD;
  const value = applied ? gain : 0;

  const breakdown: CalculationStep[] = [
    { label: "거래이익 (증여재산·채무면제·시가−대가)", amount: transactionBenefit, lawRef: GIFT.SPECIFIC_CORP },
    { label: "법인세 상당액", amount: corporateTax },
    { label: "특정법인의 이익 (거래이익 − 법인세 상당액)", amount: corpProfit > 0 ? corpProfit : 0 },
    { label: "증여의제이익 (특정법인의 이익 × 지배주주등 지분율)", amount: value, lawRef: GIFT.SPECIFIC_CORP, note: "§45의5 특정법인 (1억원 이상 한정·한도 §45의5② 별도)" },
  ];
  return {
    type: "specific_corp",
    applied,
    deemedGiftValue: value,
    breakdown,
    // ⓐ는 §45의5 성립 자체의 선결 요건이라 ⓑ 임계(1억)보다 먼저 보고한다.
    exclusionReason: applied
      ? undefined
      : eligibility.met === "no"
        ? notSpecificCorpReason(eligibility)
        : "증여의제이익이 1억원 미만 (§34의5⑤)",
    legalBasis: GIFT.SPECIFIC_CORP,
    thresholdEcho: { gain },
    specificCorpEligibility: eligibility,
  };
}

/**
 * §45의5 다주주(roster) 모드 — 시행령 §34의5④ 법인세 안분 + 주주별 안분 + 과세제외 3종 + §45의5② 한도.
 *
 * - 법인세 안분(§34의5④2호) = (산출세액 − 공제감면) × min(거래이익/소득금액, 1).
 * - 특정법인의 이익 = 거래이익 − 법인세 안분.
 * - 주주별 증여의제이익 = 특정법인의 이익 × 보유주식수/총주식수 (각자 독립 floor — 개별 산정, 잔액 흡수 안 함).
 * - 과세제외 3종: ①증여자 본인(donor_self) ②지배주주 친족 아님(non_related) ③1억 미만(below_threshold, §34의5⑤).
 */
export function calcSpecificCorpGiftMulti(input: SpecificCorpInput): DeemedGiftResult {
  const { transactionBenefit } = input;
  const shareholders = input.shareholders ?? [];
  const giftDeduction = input.giftDeduction ?? 0;

  // ── §34의5④2호 법인세 안분 (single과 공용 leaf) ──
  const corpTaxApportioned = apportionCorporateTax(input);

  // ── §34의5④ 특정법인의 이익 = 거래이익 − 법인세 안분 ──
  const corpProfit = Math.max(0, transactionBenefit - corpTaxApportioned);

  // ── ⓐ §45의5① 특정법인 해당성 — 지배주주등(친족 행) 직접지분 합계 + 신고된 간접분 ──
  // 증여자 본인(isDonor) 행도 지배주주등이므로 합계에 **포함**한다. donor_self 제외는
  // 「누가 수증자인가」(ⓑ) 축이지 「이 법인이 특정법인인가」(ⓐ) 축이 아니다 — 두 축을 섞지 말 것.
  const relatedShares = shareholders.reduce((a, sh) => (sh.isRelated ? a + sh.shares : a), 0);
  const gateDenom = shareholders.find((sh) => sh.totalShares > 0)?.totalShares ?? 0;
  const eligibility = evaluateSpecificCorpEligibility(
    { numer: relatedShares, denom: gateDenom },
    input.controllingGroupRatio,
    "roster",
  );
  const notSpecificCorp = eligibility.met === "no";

  // ── 주주별 증여의제이익 + 과세제외 3종 + §45의5② 한도 ──
  const donees: SpecificCorpDonee[] = shareholders.map((sh) => {
    const gain = sh.totalShares > 0 ? safeMultiplyThenDivide(corpProfit, sh.shares, sh.totalShares) : 0;
    const ownershipRatioPct = sh.totalShares > 0 ? (sh.shares / sh.totalShares) * 100 : 0;
    const base: SpecificCorpDonee = {
      name: sh.name,
      relation: sh.relation,
      shares: sh.shares,
      totalShares: sh.totalShares,
      ownershipRatioPct,
      gain,
      isTaxable: false,
    };
    if (notSpecificCorp) return { ...base, nonTaxableReason: "not_specific_corp" }; // ⓐ 법인 단위 선결 요건
    if (sh.isDonor) return { ...base, gain: 0, nonTaxableReason: "donor_self" }; // 증여자 본인(특수관계인)
    if (!sh.isRelated) return { ...base, nonTaxableReason: "non_related" }; // 지배주주 친족 아님(타인)
    if (gain < ABSOLUTE_THRESHOLD) return { ...base, nonTaxableReason: "below_threshold" }; // §34의5⑤ 1억 미만
    // 과세 — §45의5② 한도 계산
    const limitCalc = calcSpecificCorpLimit({
      gain,
      transactionBenefit,
      shares: sh.shares,
      totalShares: sh.totalShares,
      corpTaxApportioned,
      giftDeduction,
    });
    return { ...base, isTaxable: true, limitCalc };
  });

  const taxable = donees.filter((d) => d.isTaxable);
  const deemedGiftValue = taxable.reduce((a, d) => a + d.gain, 0);
  const applied = deemedGiftValue > 0;

  const breakdown: CalculationStep[] = [
    { label: "특정법인의 이익 (거래이익 − 법인세 안분)", amount: corpProfit, lawRef: GIFT.SPECIFIC_CORP },
    {
      label: "증여재산가액 (지배주주등 지분 안분)",
      amount: deemedGiftValue,
      lawRef: GIFT.SPECIFIC_CORP,
      note: `과세 수증자 ${taxable.length}명 (1억원 이상 지배주주등)`,
    },
  ];

  return {
    type: "specific_corp",
    applied,
    deemedGiftValue,
    breakdown,
    exclusionReason: applied
      ? undefined
      : notSpecificCorp
        ? notSpecificCorpReason(eligibility)
        : "과세 지배주주등 없음 (본인증여분·비특수관계인·1억 미만 제외)",
    legalBasis: GIFT.SPECIFIC_CORP,
    specificCorpMulti: { corpProfit, corpTaxApportioned, donees },
    specificCorpEligibility: eligibility,
  };
}

/**
 * §45의5②·시행령 §34의5⑨ — 증여세 한도.
 * ㉮ 일반 산출세액 = 증여세(증여의제이익[법인세 차감 後] − 공제)
 * ㉠ 직접증여 가정 = 증여세(거래이익[법인세 차감 前]×지분율 − 공제)
 * ㉡ 법인세 상당액 × 지분율
 * finalTax = min(㉮, max(0, ㉠ − ㉡)). 과세표준은 천원절사 후 누진세율(§56) 적용.
 */
function calcSpecificCorpLimit(p: {
  gain: number;
  transactionBenefit: number;
  shares: number;
  totalShares: number;
  corpTaxApportioned: number;
  giftDeduction: number;
}): SpecificCorpLimitCalc {
  const computedTax = calcInheritanceGiftTax(truncateToThousand(Math.max(0, p.gain - p.giftDeduction)));
  const directGiftBase = safeMultiplyThenDivide(p.transactionBenefit, p.shares, p.totalShares); // 거래이익(차감 前)×지분
  const directGiftTax = calcInheritanceGiftTax(truncateToThousand(Math.max(0, directGiftBase - p.giftDeduction)));
  const corpTaxShare = safeMultiplyThenDivide(p.corpTaxApportioned, p.shares, p.totalShares);
  const limitAmount = Math.max(0, directGiftTax - corpTaxShare);
  const finalTax = Math.min(computedTax, limitAmount);
  const filingCredit = Math.floor((finalTax * FILING_CREDIT_NUMER) / FILING_CREDIT_DENOM);
  const selfPayTax = finalTax - filingCredit;
  return { computedTax, directGiftTax, corpTaxShare, limitAmount, finalTax, filingCredit, selfPayTax };
}
