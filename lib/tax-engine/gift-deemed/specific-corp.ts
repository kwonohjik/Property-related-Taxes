/** (Phase 3) 특정법인과의 거래를 통한 이익의 증여 의제 (§45의5 · 시행령 §34의5) */
import { GIFT } from "../legal-codes";
import { safeMultiplyThenDivide, truncateToThousand } from "../tax-utils";
import { calcInheritanceGiftTax } from "../inheritance-gift-common";
import type { CalculationStep } from "../types/inheritance-gift.types";
import type {
  DeemedGiftResult,
  SpecificCorpInput,
  SpecificCorpDonee,
  SpecificCorpLimitCalc,
} from "./types";

const ABSOLUTE_THRESHOLD = 100_000_000; // §34의5⑤ 증여의제이익 1억원 이상
const FILING_CREDIT_NUMER = 3; // §69 신고세액공제 3%
const FILING_CREDIT_DENOM = 100;

/**
 * §45의5①: 증여의제이익 = 특정법인의 이익 × 지배주주등 주식보유비율.
 * 시행령 §34의5④: 특정법인의 이익 = 거래이익 − 법인세 상당액.
 * §34의5⑤: 증여의제이익이 1억원 이상인 경우로 한정. (한도 §45의5②는 증여세액 단계 — 별도)
 *
 * single(하위호환) — 법인세 안분·지분율은 호출자가 사전 계산해 corporateTax·ownershipRatio로 전달.
 */
export function calcSpecificCorpGift(input: SpecificCorpInput): DeemedGiftResult {
  const { transactionBenefit } = input;
  const corporateTax = input.corporateTax ?? 0;
  const ratio = input.ownershipRatio ?? { numer: 0, denom: 1 };
  const corpProfit = transactionBenefit - corporateTax;
  const gain = corpProfit > 0 ? safeMultiplyThenDivide(corpProfit, ratio.numer, ratio.denom) : 0;
  const applied = gain >= ABSOLUTE_THRESHOLD;
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
    exclusionReason: applied ? undefined : "증여의제이익이 1억원 미만 (§34의5⑤)",
    legalBasis: GIFT.SPECIFIC_CORP,
    thresholdEcho: { gain },
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

  // ── §34의5④2호 법인세 안분 = (산출세액 − 공제감면) × min(거래이익/소득금액, 1) ──
  const annualIncome = input.annualIncome ?? 0;
  const corpTaxNet = Math.max(0, (input.corporateTaxComputed ?? 0) - (input.corporateTaxCredit ?? 0));
  const corpTaxApportioned =
    annualIncome > 0
      ? safeMultiplyThenDivide(corpTaxNet, Math.min(transactionBenefit, annualIncome), annualIncome) // min으로 비율 1 상한
      : (input.corporateTax ?? 0); // 이월결손금 0 / single 직접값 fallback

  // ── §34의5④ 특정법인의 이익 = 거래이익 − 법인세 안분 ──
  const corpProfit = Math.max(0, transactionBenefit - corpTaxApportioned);

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
    exclusionReason: applied ? undefined : "과세 지배주주등 없음 (본인증여분·비특수관계인·1억 미만 제외)",
    legalBasis: GIFT.SPECIFIC_CORP,
    specificCorpMulti: { corpProfit, corpTaxApportioned, donees },
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
