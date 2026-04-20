/**
 * 증여세 메인 계산 엔진 (상증법 §31~§59)
 *
 * 계산 파이프라인:
 *   1. 재산 평가 (property-valuation.ts)
 *   2. 비과세 차감 (exemption-evaluator.ts)
 *   3. 동일인 10년 이내 사전증여 합산 (§47)
 *   4. 증여재산공제 (§53·§53의2)
 *   5. 과세표준 (50만원 미만이면 0)
 *   6. 산출세액 (§56 = §26 준용)
 *   7. 세대생략 할증 (§57)
 *   8. 세액공제 (§59·§69 + 조특법 §30의5·§30의6)
 *   9. 결정세액
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당)
 */

import { GIFT as GIFT_LAW } from "./legal-codes";
import type {
  GiftTaxInput,
  GiftTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

import { evaluateAllEstateItems } from "./property-valuation";
import { evaluateExemptions } from "./exemption-evaluator";
import { calcGiftDeductions } from "./deductions/gift-deductions";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  calcGenerationSkipSurcharge,
  aggregatePriorGiftsForGift,
} from "./inheritance-gift-common";
import { calcGiftTaxCredits } from "./inheritance-gift-tax-credit";
import type { TaxBracket } from "./types";

// ============================================================
// 증여세 과세표준 최솟값 (§55 단서)
// ============================================================

/** 증여세 과세표준 50만원 미만이면 세금 없음 (§55 단서) */
const TAX_BASE_MIN = 500_000;

// ============================================================
// 증여세 메인 계산
// ============================================================

export interface GiftTaxEngineOptions {
  /** §56·§26 누진세율 구간 (DB에서 로드; 기본값 사용 시 undefined) */
  brackets?: TaxBracket[];
  /** 국외재산 비율 (외국납부세액공제 한도 계산용) */
  foreignPropertyRatio?: number;
}

/**
 * 증여세 전체 계산
 *
 * @param input 증여세 계산 입력
 * @param options 세율 구간 등 옵션
 */
export function calcGiftTax(
  input: GiftTaxInput,
  options: GiftTaxEngineOptions = {},
): GiftTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;
  const appliedLawDate = input.giftDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([GIFT_LAW.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(input.giftItems);

  const grossGiftValue = valuationResults.reduce(
    (sum, v) => sum + v.valuatedAmount,
    0,
  );

  allBreakdown.push({
    label: "증여재산 평가액 합계",
    amount: grossGiftValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
  });

  for (const vr of valuationResults) {
    allWarnings.push(...vr.warnings);
  }

  // ─────────────────────────────────────────────
  // STEP 2: 비과세 차감
  // ─────────────────────────────────────────────
  let exemptAmount = 0;
  if (input.exemptions && input.exemptions.length > 0) {
    const { totalExemptAmount, breakdown: exemptBreakdown } =
      evaluateExemptions(input.exemptions, grossGiftValue);
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // ─────────────────────────────────────────────
  // STEP 3: 동일인 10년 합산 (§47)
  // ─────────────────────────────────────────────
  const {
    totalAmount: priorGiftTotal,
    totalTaxPaid: priorGiftTaxPaid,
    breakdown: priorGiftBreakdown,
  } = aggregatePriorGiftsForGift(input.priorGiftsWithin10Years, input.giftDate);

  allBreakdown.push(...priorGiftBreakdown);

  // 합산 증여가액 = 금번 순수 증여가액 + 과거 10년 증여 합산
  // ※ priorGiftTotal은 §47 합산 기준 총액(공제 전 gross 금액)임.
  //    §53 증여재산공제(배우자 6억·직계 5천만 등)는 10년 누계를 기준으로 1회만 적용하므로
  //    aggregatedGiftValue 전체에 대해 STEP 4에서 일괄 공제한다.
  const netCurrentGiftValue = Math.max(0, grossGiftValue - exemptAmount);
  const aggregatedGiftValue = netCurrentGiftValue + priorGiftTotal;

  allBreakdown.push({
    label: "10년 합산 증여가액",
    amount: aggregatedGiftValue,
    lawRef: GIFT_LAW.TAXABLE_VALUE,
    note: `금번 ${netCurrentGiftValue.toLocaleString()}원 + 기증여 ${priorGiftTotal.toLocaleString()}원`,
  });

  // ─────────────────────────────────────────────
  // STEP 4: 증여재산공제 (§53·§53의2)
  // ─────────────────────────────────────────────
  const deductionResult = calcGiftDeductions(
    input.deductionInput,
    aggregatedGiftValue,
  );

  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 5: 과세표준 (상증법 §55② — 50만원 미만이면 과세 없음, 절사 규정 없음)
  // ─────────────────────────────────────────────
  const rawTaxBase = Math.max(0, aggregatedGiftValue - totalDeduction);
  const taxBase = rawTaxBase < TAX_BASE_MIN ? 0 : rawTaxBase;

  allBreakdown.push({
    label: "증여세 과세표준",
    amount: taxBase,
    lawRef: GIFT_LAW.TAX_BASE,
    note:
      taxBase === 0 && rawTaxBase > 0
        ? `50만원 미만(${rawTaxBase.toLocaleString()}원) — 과세 없음`
        : undefined,
  });

  // ─────────────────────────────────────────────
  // STEP 6: 산출세액 (§56 누진세율)
  // ─────────────────────────────────────────────
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  allLaws.add(GIFT_LAW.TAX_RATE);

  allBreakdown.push({
    label: "증여세 산출세액",
    amount: computedTax,
    lawRef: GIFT_LAW.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 7: 세대생략 할증 (§57)
  // ─────────────────────────────────────────────
  const { surchargeAmount: generationSkipSurcharge, breakdown: surchargeBreakdown } =
    calcGenerationSkipSurcharge(
      computedTax,
      input.isGenerationSkip,
      input.isMinorDonee,
      taxBase,
      "gift",
      undefined,       // generationSkipAssetAmount (증여세 안분 없음)
      undefined,       // totalEstateValue (증여세 안분 없음)
      grossGiftValue,  // §57 ② 40% 판정 기준: 증여재산가액 (과세표준 대신)
    );

  allBreakdown.push(...surchargeBreakdown);
  if (generationSkipSurcharge > 0) allLaws.add(GIFT_LAW.GENERATION_SKIP);

  // ─────────────────────────────────────────────
  // STEP 8: 세액공제 (§59·§69 + 조특법 특례)
  // ─────────────────────────────────────────────
  const creditResult = calcGiftTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    giftAmount: netCurrentGiftValue,
    priorGiftTaxPaid, // §58 기납부세액공제 — 10년 합산 시 이중과세 방지
  });

  const totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 9: 결정세액
  // ─────────────────────────────────────────────
  const finalTax = Math.max(
    0,
    computedTax + generationSkipSurcharge - totalTaxCredit,
  );

  allBreakdown.push({
    label: "증여세 결정세액",
    amount: finalTax,
    note: "= 산출세액 + 세대생략할증 - 세액공제",
  });

  return {
    grossGiftValue,
    exemptAmount,
    aggregatedGiftValue,
    totalDeduction,
    taxBase,
    computedTax,
    generationSkipSurcharge,
    totalTaxCredit,
    finalTax,
    deductionDetail: deductionResult,
    creditDetail: creditResult,
    valuationResults,
    breakdown: allBreakdown,
    appliedLaws: Array.from(allLaws),
    warnings: allWarnings,
    appliedLawDate,
  };
}
