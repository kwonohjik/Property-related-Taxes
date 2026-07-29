/**
 * 별지 제10호서식 [2020.03.13. 개정] 행 빌더.
 * "증여세과세표준신고 및 자진납부계산서 (기본세율 적용 증여재산 신고용)"
 *
 * 좌측 20행 (⑰~㊱) + 우측 13행 (㊲~㊺ 9 + 납부방법 헤더 1 + ㊻㊼ 2 + 신고납부 도출 1) = 총 33행.
 *
 * 호출처: gift-tax.ts 의 calcGiftTax() 마지막 단계 (엔진 attach).
 * UI 는 result.besshi10Rows 만 읽는다.
 *
 * 디자인 문서: docs/02-design/features/gift-tax-filing-form-besshi-10.engine.design.md
 */

import type {
  FilingFormRow,
  GiftDeductionResult,
  GiftDonorRelation,
  GiftTaxInput,
  GiftTaxResult,
} from "./types/inheritance-gift.types";
import type { TaxBracket } from "./types";

// ============================================================
// donor 그룹 (GiftDonorRelation 실측 8값 — lineal_ascendant 는 enum 에 없음)
// ============================================================

const LINEAL_ASCENDANT_DONORS: GiftDonorRelation[] = [
  "father",
  "mother",
  "grandparent",
];
const LINEAL_DESCENDANT_DONORS: GiftDonorRelation[] = ["lineal_descendant"];
const OTHER_RELATIVE_DONORS: GiftDonorRelation[] = ["sibling", "other_relative"];

// ============================================================
// 도출 헬퍼
// ============================================================

/**
 * 증여재산공제 (㉕·㉖·㉗) 분기.
 * - 배우자 → ㉕ (relationDeduction)
 * - 직계존속(부·모·조부모) → ㉖ (relationDeduction + marriageBirthDeduction[§53의2])
 * - 직계비속 → ㉖ (relationDeduction 만, §53의2 미적용)
 * - 기타 친족(형제자매·기타) → ㉗ (relationDeduction)
 * - 기타(other) → 모두 0
 */
function deriveRelationDeductionSplit(
  donor: GiftDonorRelation,
  d: GiftDeductionResult,
): { spouse: number; lineal: number; other: number } {
  const rel = d.relationDeduction;
  const mb = d.marriageBirthDeduction;
  if (donor === "spouse") return { spouse: rel, lineal: 0, other: 0 };
  if (LINEAL_ASCENDANT_DONORS.includes(donor)) {
    return { spouse: 0, lineal: rel + mb, other: 0 };
  }
  if (LINEAL_DESCENDANT_DONORS.includes(donor)) {
    return { spouse: 0, lineal: rel, other: 0 };
  }
  if (OTHER_RELATIVE_DONORS.includes(donor)) {
    return { spouse: 0, lineal: 0, other: rel };
  }
  return { spouse: 0, lineal: 0, other: 0 };
}

/**
 * ㉓ 증여재산가산액 = 사전증여 합산분 (현재 증여 본체·대납가산분 제외).
 * aggregatedGiftValue = netCurrent + priorGiftSum + donorPaidTaxAddition
 *   netCurrent = grossGiftValue − exemptAmount − debtAssumed
 *   priorGiftSum = aggregatedGiftValue − netCurrent − donorPaidTaxAddition
 *
 * §36 대납분(donorPaidTaxGrossUp.donorPaidTax)은 사전증여가 아니라 재차증여 fold-back.
 * 별지10호 ㉓에 산입하면 과세표준 이중계산 → 명시 차감 필수.
 */
/**
 * 사전증여 가산액(㉓·부표1 ⑭) 단일 산식 — 별지10호·부표1 공유 SSOT(dual-truth 방지, H-48).
 *   netCurrent = max(0, grossGiftValue − exemptAmount − debtAssumed)  (§47① 채무인수 차감)
 *   ㉓/⑭ = max(0, aggregatedGiftValue − netCurrent − donorPaidTax)   (§36 대납가산 제거)
 */
export function computePriorGiftAddition(
  aggregatedGiftValue: number,
  grossGiftValue: number,
  exemptAmount: number,
  debtAssumed: number,
  donorPaidTax: number,
): number {
  const netCurrent = Math.max(0, grossGiftValue - exemptAmount - debtAssumed);
  return Math.max(0, aggregatedGiftValue - netCurrent - donorPaidTax);
}

function derivePriorGiftAddition(
  r: Omit<GiftTaxResult, "besshi10Rows">,
): number {
  return computePriorGiftAddition(
    r.aggregatedGiftValue,
    r.grossGiftValue,
    r.exemptAmount,
    r.debtAssumed ?? 0, // §47① 채무인수 echo
    r.donorPaidTaxGrossUp?.donorPaidTax ?? 0, // §36 대납가산분
  );
}

/**
 * ㉛ 적용 세율 라벨 (예: "40%").
 * brackets: { min, max: number | null, rate, deduction }.
 */
function resolveBracketLabel(
  taxBase: number,
  brackets: TaxBracket[],
): string {
  const b = brackets.find(
    (br) =>
      taxBase >= br.min && (br.max === null || taxBase <= br.max),
  );
  return `${Math.round((b?.rate ?? 0) * 100)}%`;
}

// ============================================================
// 메인 빌더
// ============================================================

export function buildBesshi10Rows(
  input: GiftTaxInput,
  partialResult: Omit<GiftTaxResult, "besshi10Rows">,
  brackets: TaxBracket[],
): FilingFormRow[] {
  const r = partialResult;
  const split = deriveRelationDeductionSplit(input.donor, r.deductionDetail);
  const priorAddition = derivePriorGiftAddition(r);
  // §36 대납 gross-up 재차증여분(D). ㉓ 증여재산가산액은 순수 §47② 합산만 유지(대납 오귀속 방지, C-10),
  // ㉔ 증여세과세가액은 D 포함(aggregatedGiftValue)이므로 D>0이면 ㉔ 산식 라벨에 대납분을 명시해 자기정합 유지.
  const donorPaidTaxAddition = r.donorPaidTaxGrossUp?.donorPaidTax ?? 0;
  const surcharge = r.generationSkipSurchargeDetail?.additionalSurcharge ?? 0;
  const computedTaxTotal = r.computedTax + surcharge;
  const rateLabel = resolveBracketLabel(r.taxBase, brackets);

  const installment = r.installmentPayment ?? 0;
  const cashDef = r.cashDeferred ?? 0;
  const reportPay = Math.max(0, r.finalTax - installment - cashDef);

  // §71 영농자녀 농지 감면세액 — finalTax에서 totalTaxCredit과 별도로 차감되므로(gift-tax.ts),
  // 별지10호에서는 "그 밖의 공제·감면세액(㊶)"·"세액공제 합계(㊲)"에 합산해 ㊺=finalTax 자기정합 (M-11).
  const farmlandReduction = r.farmlandReductionDetail?.reductionAmount ?? 0;

  return [
    // ===== LEFT 20행 (⑰~㊱) =====
    { number: "⑰", column: "left", label: "증여재산가액",                    amount: r.grossGiftValue,                          display: "amount", lawRef: "상증법 §60" },
    { number: "⑱", column: "left", label: "비과세재산가액",                  amount: r.exemptAmount,                            display: "amount", lawRef: "§46·§46의2" },
    { number: "⑲", column: "left", label: "공익법인 출연재산가액 (불산입)",  amount: r.publicInterestExclusion ?? 0,            display: "amount", lawRef: "§48" },
    { number: "⑳", column: "left", label: "공익신탁 재산가액 (불산입)",      amount: r.publicTrustExclusion ?? 0,               display: "amount", lawRef: "§52" },
    { number: "㉑", column: "left", label: "장애인 신탁 재산가액 (불산입)",   amount: r.disabledTrustExclusion ?? 0,             display: "amount", lawRef: "§52의2" },
    { number: "㉒", column: "left", label: "채무액",                          amount: r.debtAssumed ?? 0,                        display: "amount", lawRef: "§47" },
    { number: "㉓", column: "left", label: "증여재산가산액",                  amount: priorAddition,                             display: "amount", formula: "동일인 10년 합산", lawRef: "§47②" },
    { number: "㉔", column: "left", label: "증여세과세가액",                  amount: r.aggregatedGiftValue,                     display: "amount", formula: donorPaidTaxAddition > 0 ? "⑰−⑱−⑲−⑳−㉑−㉒+㉓+대납 재차증여(§36)" : "⑰−⑱−⑲−⑳−㉑−㉒+㉓", lawRef: "§47" },
    { number: "㉕", column: "left", label: "증여재산공제 — 배우자",           amount: split.spouse,                              display: "amount", lawRef: "§53" },
    { number: "㉖", column: "left", label: "증여재산공제 — 직계존비속",       amount: split.lineal,                              display: "amount", lawRef: "§53·§53의2" },
    { number: "㉗", column: "left", label: "증여재산공제 — 그 밖의 친족",     amount: split.other,                               display: "amount", lawRef: "§53" },
    { number: "㉘", column: "left", label: "재해손실공제",                    amount: r.disasterLossDeduction ?? 0,              display: "amount", lawRef: "§54" },
    { number: "㉙", column: "left", label: "감정평가수수료",                  amount: r.appraisalFeeDeduction ?? 0,              display: "amount" },
    { number: "㉚", column: "left", label: "과세표준",                        amount: r.taxBase,                                 display: "amount", formula: "㉔−㉕−㉖−㉗−㉘−㉙", lawRef: "§55" },
    { number: "㉛", column: "left", label: "세율",                            amount: 0,                                         display: "rate",   formula: rateLabel, lawRef: "§56" },
    { number: "㉜", column: "left", label: "산출세액",                        amount: r.computedTax,                             display: "amount", lawRef: "§56" },
    { number: "㉝", column: "left", label: "세대생략가산세",                  amount: surcharge,                                 display: "amount", lawRef: "§57" },
    { number: "㉞", column: "left", label: "산출세액계",                      amount: computedTaxTotal,                          display: "amount", formula: "㉜+㉝" },
    { number: "㉟", column: "left", label: "이자상당액",                      amount: r.interestEquivalent ?? 0,                 display: "amount" },
    { number: "㊱", column: "left", label: "박물관자료 등 징수유예세액",      amount: r.museumDeferredTax ?? 0,                  display: "amount", lawRef: "§75" },

    // ===== RIGHT 13행 (㊲~㊺ 9 + 납부방법 헤더 1 + ㊻ + ㊼ 2 + 신고납부 도출 1) =====
    { number: "㊲", column: "right", label: "세액공제 합계",                  amount: r.totalTaxCredit + farmlandReduction,      display: "amount", formula: "㊳+㊴+㊵+㊶" },
    { number: "㊳", column: "right", label: "기납부세액",                     amount: r.creditDetail.giftTaxCredit,              display: "amount", lawRef: "§58" },
    { number: "㊴", column: "right", label: "외국납부세액공제",               amount: r.creditDetail.foreignTaxCredit,           display: "amount", lawRef: "§59" },
    { number: "㊵", column: "right", label: "신고세액공제",                   amount: r.creditDetail.filingCredit,               display: "amount", lawRef: "§69" },
    { number: "㊶", column: "right", label: "그 밖의 공제·감면세액",          amount: r.creditDetail.specialTreatmentCredit + farmlandReduction, display: "amount", lawRef: "조특법 §30의5·§30의6·§71" },
    { number: "㊷", column: "right", label: "신고불성실가산세",               amount: r.underreportPenalty ?? 0,                 display: "amount", lawRef: "국기법 §47의2·§47의3" },
    { number: "㊸", column: "right", label: "납부지연가산세",                 amount: r.latePaymentPenalty ?? 0,                 display: "amount", lawRef: "국기법 §47의4" },
    { number: "㊹", column: "right", label: "공익법인 등 관련 가산세",        amount: r.publicInterestPenalty ?? 0,              display: "amount", lawRef: "§78" },
    { number: "㊺", column: "right", label: "자진납부할 세액(합계액)",        amount: r.finalTax,                                display: "amount", formula: "㉞+㉟−㊱−㊲+㊷+㊸+㊹" },
    { number: "",   column: "right", label: "납부방법",                       amount: 0,                                         display: "header" },
    { number: "㊻", column: "right", label: "연부연납",                       amount: installment,                               display: "amount", lawRef: "§71" },
    { number: "㊼", column: "right", label: "현금 분납",                      amount: cashDef,                                   display: "amount", lawRef: "§70②" },
    { number: "",   column: "right", label: "신고납부",                       amount: reportPay,                                 display: "amount", formula: "㊺−㊻−㊼" },
  ];
}
