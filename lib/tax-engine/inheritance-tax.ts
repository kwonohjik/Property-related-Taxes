/**
 * 상속세 메인 계산 엔진 (상증법 §11~§30)
 *
 * 계산 파이프라인:
 *   1. 재산 평가 (property-valuation.ts)
 *   2. 비과세 차감 (exemption-evaluator.ts)
 *   3. 장례비·채무 차감 (§14)
 *   4. 사전증여재산 합산 (§13 — 10년/5년)
 *   5. 상속세 과세가액 확정
 *   6. 상속공제 적용 (§18~§24)
 *   7. 과세표준 = 과세가액 - 공제
 *   8. 산출세액 = 누진세율 (§26)
 *   9. 세대생략 할증 (§27)
 *  10. 세액공제 (§28~§30·§69)
 *  11. 결정세액 = 산출 + 할증 - 공제
 *
 * Pure Engine: DB 호출 없음, 입력 검증 없음 (Orchestrator 담당)
 */

import { INH } from "./legal-codes";
import type {
  InheritanceTaxInput,
  InheritanceTaxResult,
  CalculationStep,
} from "./types/inheritance-gift.types";

import { evaluateAllEstateItems } from "./property-valuation";
import {
  evaluateExemptions,
} from "./exemption-evaluator";
import { calcInheritanceDeductions } from "./deductions/inheritance-deductions";
import {
  DEFAULT_INHERITANCE_GIFT_BRACKETS,
  calcInheritanceGiftTax,
  aggregatePriorGiftsForInheritance,
  calcFuneralExpenseDeduction,
  calcGenerationSkipSurcharge,
} from "./inheritance-gift-common";
import { calcInheritanceTaxCredits } from "./inheritance-gift-tax-credit";
import type { TaxBracket } from "./types";

// ============================================================
// 상속세 메인 계산
// ============================================================

export interface InheritanceTaxEngineOptions {
  /** §26 누진세율 구간 (DB에서 로드; 기본값 사용 시 undefined) */
  brackets?: TaxBracket[];
  /** 국외재산 비율 (외국납부세액공제 한도 계산용) */
  foreignPropertyRatio?: number;
}

/**
 * 상속세 전체 계산
 *
 * @param input 상속세 계산 입력
 * @param options 세율 구간 등 옵션
 */
export function calcInheritanceTax(
  input: InheritanceTaxInput,
  options: InheritanceTaxEngineOptions = {},
): InheritanceTaxResult {
  const brackets = options.brackets ?? DEFAULT_INHERITANCE_GIFT_BRACKETS;
  const appliedLawDate = input.deathDate;
  const allBreakdown: CalculationStep[] = [];
  const allWarnings: string[] = [];
  const allLaws: Set<string> = new Set([INH.TAXABLE_VALUE]);

  // ─────────────────────────────────────────────
  // STEP 1: 재산 평가
  // ─────────────────────────────────────────────
  const valuationResults = evaluateAllEstateItems(input.estateItems);

  const grossEstateValue = valuationResults.reduce(
    (sum, v) => sum + v.valuatedAmount,
    0,
  );

  allBreakdown.push({
    label: "상속재산 평가액 합계",
    amount: grossEstateValue,
    lawRef: INH.TAXABLE_VALUE,
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
      evaluateExemptions(input.exemptions, grossEstateValue);
    exemptAmount = totalExemptAmount;
    allBreakdown.push(...exemptBreakdown);
  }

  // ─────────────────────────────────────────────
  // STEP 3: 장례비·공과금·채무 차감 (§14)
  // ─────────────────────────────────────────────
  const { deduction: funeralDeduction, breakdown: funeralBreakdown } =
    calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);

  allBreakdown.push(...funeralBreakdown);
  allLaws.add(INH.DEBT_DEDUCTION);

  const deductedBeforeAggregation = funeralDeduction + input.debts;

  allBreakdown.push({
    label: "공과금·채무 차감",
    amount: -input.debts,
    lawRef: INH.DEBT_DEDUCTION,
  });

  // ─────────────────────────────────────────────
  // STEP 4: 사전증여재산 합산 (§13)
  // ─────────────────────────────────────────────
  const { totalAmount: priorGiftAggregated, breakdown: priorGiftBreakdown } =
    aggregatePriorGiftsForInheritance(
      input.preGiftsWithin10Years,
      input.deathDate,
    );

  allBreakdown.push(...priorGiftBreakdown);

  // ─────────────────────────────────────────────
  // STEP 5: 상속세 과세가액
  // ─────────────────────────────────────────────
  const taxableEstateValue = Math.max(
    0,
    grossEstateValue - exemptAmount - deductedBeforeAggregation + priorGiftAggregated,
  );

  allBreakdown.push({
    label: "상속세 과세가액",
    amount: taxableEstateValue,
    lawRef: INH.TAXABLE_VALUE,
    note: "= 평가액 - 비과세 - 장례·채무 + 사전증여",
  });

  // ─────────────────────────────────────────────
  // STEP 6: 상속공제 (§18~§24)
  // ─────────────────────────────────────────────
  // §24 종합한도: 과세가액 - 상속인·수유자에 대한 사전증여재산
  // §24 한도 = taxableEstateValue - 상속인에 대한 사전증여재산
  // ※ 수유자(유증 수령인)에 대한 사전증여도 §24 한도 계산에서 제외해야 하나,
  //    현재 엔진은 PriorGift.isHeir로만 구분하므로 수유자는 상속인(isHeir=true)으로
  //    입력해야 올바른 한도가 계산됨. 향후 isLegatee 필드 추가 시 수정 필요.
  // calcInheritanceDeductions가 내부에서 한도를 계산하므로 raw 금액 전달
  const { totalAmount: heirOnlyGifts } = aggregatePriorGiftsForInheritance(
    input.preGiftsWithin10Years,
    input.deathDate,
    true, // 상속인만 (수유자는 isHeir=true로 입력 필요)
  );

  const deductionResult = calcInheritanceDeductions(
    { ...input.deductionInput, deathDate: input.deathDate },
    taxableEstateValue,
    heirOnlyGifts, // priorGiftToHeirTotal: §24 한도는 함수 내부에서 계산
  );

  const totalDeduction = deductionResult.totalDeduction;
  allBreakdown.push(...deductionResult.breakdown);
  for (const law of deductionResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 7: 과세표준 (상증법 §25 — 절사 규정 없음, 원 단위)
  // ─────────────────────────────────────────────
  const taxBase = Math.max(0, taxableEstateValue - totalDeduction);

  allBreakdown.push({
    label: "과세표준",
    amount: taxBase,
    lawRef: INH.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 8: 산출세액 (§26 누진세율)
  // ─────────────────────────────────────────────
  const computedTax = calcInheritanceGiftTax(taxBase, brackets);
  allLaws.add(INH.TAX_RATE);

  allBreakdown.push({
    label: `산출세액 (${INH.TAX_RATE} 누진세율)`,
    amount: computedTax,
    lawRef: INH.TAX_RATE,
  });

  // ─────────────────────────────────────────────
  // STEP 9: 세대생략 할증 (§27)
  // ─────────────────────────────────────────────
  const genSkipResult = calcGenerationSkipSurcharge(
    computedTax,
    input.isGenerationSkip ?? false,
    input.isMinorHeir ?? false,
    taxBase,
    "inheritance",
    input.generationSkipAssetAmount,  // §27 ① 안분용: 세대생략 해당 재산가액
    grossEstateValue,                 // §27 ① 안분용: 전체 상속재산가액
  );
  const generationSkipSurcharge = genSkipResult.surchargeAmount;
  if (genSkipResult.breakdown.length > 0) {
    allBreakdown.push(...genSkipResult.breakdown);
    allLaws.add(INH.GENERATION_SKIP);
  }

  // ─────────────────────────────────────────────
  // STEP 10: 세액공제 (§28~§30·§69)
  // ─────────────────────────────────────────────
  const creditResult = calcInheritanceTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    taxableEstateValue,
    taxBase,       // §28 ① 안분 분모: 과세표준 (법령 준수)
    deathDate: input.deathDate,
  });

  const totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 11: 결정세액
  // ─────────────────────────────────────────────
  const finalTax = Math.max(
    0,
    computedTax + generationSkipSurcharge - totalTaxCredit,
  );

  allBreakdown.push({
    label: "결정세액",
    amount: finalTax,
    note: "= 산출세액 + 세대생략할증 - 세액공제",
  });

  return {
    grossEstateValue,
    exemptAmount,
    deductedBeforeAggregation,
    priorGiftAggregated,
    taxableEstateValue,
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
