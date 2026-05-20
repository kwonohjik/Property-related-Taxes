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
import { evaluatePresumedInheritance } from "./presumed-inheritance";
import { calcCorporateExemption } from "./inheritance-corporate-exemption";
import { calcHeirAllocation } from "./inheritance-allocation";
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
  //   debtItems 입력 시 우선 적용 (협의분할 가능). 미입력 시 legacy debts·funeralExpense 사용.
  // ─────────────────────────────────────────────
  let funeralDeduction = 0;
  let nonFuneralDebts = 0;

  if (input.debtItems && input.debtItems.length > 0) {
    // 신규 debtItems 경로 — category별 합산 + 장례비 한도 적용
    let funeralMeal = 0; // 식대 한도 1천만
    let funeralBongan = 0; // 봉안 한도 5백만
    for (const di of input.debtItems) {
      if (di.category === "funeral") {
        if (di.isBongan) funeralBongan += di.amount;
        else funeralMeal += di.amount;
      } else {
        nonFuneralDebts += di.amount;
      }
    }
    funeralDeduction = Math.min(funeralMeal, 10_000_000) + Math.min(funeralBongan, 5_000_000);
    allBreakdown.push({
      label: "장례비 (식대 한도 1천만 + 봉안 한도 5백만)",
      amount: -funeralDeduction,
      lawRef: INH.DEBT_DEDUCTION,
      note: `식대 ${funeralMeal.toLocaleString()} → ${Math.min(funeralMeal, 10_000_000).toLocaleString()}, 봉안 ${funeralBongan.toLocaleString()} → ${Math.min(funeralBongan, 5_000_000).toLocaleString()}`,
    });
    allBreakdown.push({
      label: "공과금·채무 차감",
      amount: -nonFuneralDebts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  } else {
    // Legacy 경로 — funeralExpense + debts
    const fd = calcFuneralExpenseDeduction(input.funeralExpense, input.funeralIncludesBongan);
    funeralDeduction = fd.deduction;
    allBreakdown.push(...fd.breakdown);
    nonFuneralDebts = input.debts;
    allBreakdown.push({
      label: "공과금·채무 차감",
      amount: -input.debts,
      lawRef: INH.DEBT_DEDUCTION,
    });
  }
  allLaws.add(INH.DEBT_DEDUCTION);
  const deductedBeforeAggregation = funeralDeduction + nonFuneralDebts;

  // ─────────────────────────────────────────────
  // STEP 3.5: 추정상속재산 §15 (Phase A)
  // ─────────────────────────────────────────────
  let presumedTotal = 0;
  let presumedDetail:
    | { items: ReturnType<typeof evaluatePresumedInheritance>["items"]; total: number }
    | undefined;
  if (input.presumedItems && input.presumedItems.length > 0) {
    const presumedResult = evaluatePresumedInheritance(input.presumedItems);
    presumedTotal = presumedResult.total;
    presumedDetail = presumedResult;
    for (const ir of presumedResult.items) {
      allBreakdown.push(...ir.breakdown);
    }
    allBreakdown.push({
      label: "추정상속재산 §15 합계",
      amount: presumedTotal,
      lawRef: INH.PRESUMPTION,
    });
    allLaws.add(INH.PRESUMPTION);
  }

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
  // STEP 5: 상속세 과세가액 (추정상속재산 §15 포함)
  // ─────────────────────────────────────────────
  const taxableEstateValue = Math.max(
    0,
    grossEstateValue + presumedTotal - exemptAmount - deductedBeforeAggregation + priorGiftAggregated,
  );

  allBreakdown.push({
    label: "상속세 과세가액",
    amount: taxableEstateValue,
    lawRef: INH.TAXABLE_VALUE,
    note: "= 평가액 + 추정상속재산 - 비과세 - 장례·채무 + 사전증여",
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
  // STEP 9: 세대생략 할증 (§27) — 분모 보정 (Phase F)
  //   PDF: 분모 = grossEstateWithGifts − 영리법인 등 사전증여 가액
  // ─────────────────────────────────────────────
  // 상속인·수유자 외 자(영리법인·기타)가 받은 사전증여 가액 합계
  const nonHeirNonLegateeGifts = (input.preGiftsWithin10Years ?? []).reduce(
    (sum, g) => sum + (g.beneficiaryType === "corporate" ? g.giftAmount : 0),
    0,
  );
  // 세대생략 할증 분모 = 상속세 과세가액 (PDF 책 1864 산식)
  const surchargeDenominator = taxableEstateValue;

  const genSkipResult = calcGenerationSkipSurcharge(
    computedTax,
    input.isGenerationSkip ?? false,
    input.isMinorHeir ?? false,
    taxBase,
    "inheritance",
    input.generationSkipAssetAmount,
    surchargeDenominator,
    nonHeirNonLegateeGifts,
  );
  const generationSkipSurcharge = genSkipResult.surchargeAmount;
  if (genSkipResult.breakdown.length > 0) {
    allBreakdown.push(...genSkipResult.breakdown);
    allLaws.add(INH.GENERATION_SKIP);
  }

  // ─────────────────────────────────────────────
  // STEP 10: 영리법인 §3의2② 면제 (Phase B)
  // ─────────────────────────────────────────────
  const corporateGifts = (input.preGiftsWithin10Years ?? []).filter(
    (g) => g.beneficiaryType === "corporate",
  );
  const corporateGiftTaxBase = corporateGifts.reduce(
    (s, g) => s + (g.giftTaxBase ?? g.giftAmount),
    0,
  );
  const corporateGiftComputedTax = corporateGifts.reduce(
    (s, g) => s + (g.corporateGiftComputedTax ?? 0),
    0,
  );

  let corporateExemption:
    | ReturnType<typeof calcCorporateExemption>
    | undefined;
  if (corporateGifts.length > 0 && corporateGiftComputedTax > 0) {
    corporateExemption = calcCorporateExemption({
      corporateGiftComputedTax,
      corporateGiftTaxBase,
      totalComputedTax: computedTax, // 할증 미포함 — PDF 책 1866
      totalTaxBase: taxBase,
    });
    allBreakdown.push(...corporateExemption.breakdown);
    allLaws.add(INH.TAXPAYER);
  }

  // ─────────────────────────────────────────────
  // STEP 11: 세액공제 (§28~§30·§69)
  // ─────────────────────────────────────────────
  const creditResult = calcInheritanceTaxCredits({
    creditInput: input.creditInput,
    computedTax,
    generationSkipSurcharge,
    foreignPropertyRatio: options.foreignPropertyRatio,
    taxableEstateValue,
    taxBase,
    deathDate: input.deathDate,
  });

  const totalTaxCredit = creditResult.totalCredit;
  allBreakdown.push(...creditResult.breakdown);
  for (const law of creditResult.appliedLaws) allLaws.add(law);

  // ─────────────────────────────────────────────
  // STEP 12: 결정세액 (총액)
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

  // ─────────────────────────────────────────────
  // STEP 13: 상속인별 배부 (Phase C) — heirs·doneeId가 제공된 경우만
  // ─────────────────────────────────────────────
  let heirAllocationResult: ReturnType<typeof calcHeirAllocation> | undefined;
  const hasHeirAllocations =
    input.heirs.length > 0 &&
    (input.estateItems.some((e) => e.heirAllocations) ||
      input.preGiftsWithin10Years.some((g) => g.doneeId));

  if (hasHeirAllocations) {
    // 추정상속재산 id→addedAmount Map 작성
    const presumedAddedById = new Map<string, number>();
    if (presumedDetail) {
      for (const ir of presumedDetail.items) {
        presumedAddedById.set(ir.id, ir.addedAmount);
      }
    }

    heirAllocationResult = calcHeirAllocation({
      heirs: input.heirs,
      estateItems: input.estateItems,
      presumedItems: input.presumedItems ?? [],
      debtItems: input.debtItems ?? [],
      priorGifts: input.preGiftsWithin10Years,
      presumedAddedById,
      taxBase,
      computedTax,
      generationSkipSurcharge,
      corporateExemption: corporateExemption?.amount ?? 0,
      corporateGiftTaxBase,
      grossEstateWithGifts: taxableEstateValue,
      isFiledOnTime: input.creditInput.isFiledOnTime,
    });
    allBreakdown.push(...heirAllocationResult.breakdown);
  }

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
    // 종합사례 PDF 확장
    presumedInheritanceDetail: presumedDetail,
    corporateExemption,
    heirAllocationResult,
  };
}
