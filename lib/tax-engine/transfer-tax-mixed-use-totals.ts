/**
 * 겸용주택 비사업용토지 부분 + 합산 세액 조립 헬퍼.
 * transfer-tax-mixed-use-helpers.ts에서 분리 (800줄 정책).
 */

import { applyRate, calculateProgressiveTax } from "./tax-utils";
import { calcLongTermRate, type ExcessLandResult } from "./transfer-tax-mixed-use-helpers";
import type {
  MixedUseHousingPart,
  MixedUseNonBusinessLandPart,
  MixedUseTotalTax,
} from "./types/transfer-mixed-use.types";
import type { TaxBracket } from "./types";

/** 비사업용토지 부분 조립 */
export function buildNonBusinessPart(
  housingPart: MixedUseHousingPart,
  excessResult: ExcessLandResult,
  landHoldingYears: number,
): MixedUseNonBusinessLandPart | null {
  if (excessResult.excessArea <= 0) return null;

  const transferredGain = housingPart.nonBusinessTransferredGain;
  const deductionRate = calcLongTermRate(landHoldingYears, 0, false);
  const longTermDeductionAmount = applyRate(Math.max(transferredGain, 0), deductionRate);

  return {
    excessArea: excessResult.excessArea,
    appliedMultiplier: excessResult.multiplier,
    transferGain: transferredGain,
    longTermDeductionRate: deductionRate,
    longTermDeductionAmount,
    incomeAmount: Math.max(0, transferredGain - longTermDeductionAmount),
    additionalRate: 0.10,
  };
}

/** 합산 세액 조립 */
export function buildTotalTax(
  housingIncome: number,
  commercialIncome: number,
  nonBizIncome: number,
  brackets: TaxBracket[],
): MixedUseTotalTax {
  const BASIC_DEDUCTION = 2_500_000;

  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - BASIC_DEDUCTION);
  const taxByBasicRate = calculateProgressiveTax(taxBase, brackets);
  // 적용된 누진세율 구간 추출 (UI 산식 표시용)
  const applicable = brackets.find((b) => taxBase <= (b.max ?? Infinity)) ?? brackets[brackets.length - 1];
  const appliedRate = taxBase > 0 ? applicable.rate : 0;
  const progressiveDeduction = taxBase > 0 ? applicable.deduction : 0;
  const nonBusinessSurcharge = applyRate(nonBizIncome, 0.10);
  const transferTax = taxByBasicRate + nonBusinessSurcharge;
  const localTax = applyRate(transferTax, 0.10);

  return {
    aggregateIncome,
    basicDeduction: BASIC_DEDUCTION,
    taxBase,
    taxByBasicRate,
    appliedRate,
    progressiveDeduction,
    nonBusinessSurcharge,
    transferTax,
    localTax,
    totalPayable: transferTax + localTax,
  };
}
