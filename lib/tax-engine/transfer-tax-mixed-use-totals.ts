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
  /** 기본공제 연간 한도 (DB 세율 basicDeductionRules.annualLimit). 미전달 시 250만원 fallback. */
  basicDeductionLimit = 2_500_000,
): MixedUseTotalTax {
  const BASIC_DEDUCTION = basicDeductionLimit;

  const aggregateIncome = housingIncome + commercialIncome + nonBizIncome;
  const taxBase = Math.max(0, aggregateIncome - BASIC_DEDUCTION);
  const taxByBasicRate = calculateProgressiveTax(taxBase, brackets);
  // 적용된 누진세율 구간 추출 (UI 산식 표시용)
  const applicable = brackets.find((b) => taxBase <= (b.max ?? Infinity)) ?? brackets[brackets.length - 1];
  const appliedRate = taxBase > 0 ? applicable.rate : 0;
  const progressiveDeduction = taxBase > 0 ? applicable.deduction : 0;
  // §104①8호 비사업용 토지 +10%p 중과는 **과세표준**(=양도소득금액−기본공제)에 적용된다(단건 엔진
  // transfer-tax-rate-calc.ts:307-311와 동일 원리). 양도소득기본공제는 세율이 가장 높은 부분(비사업용
  // +10%p)에 전액 귀속(납세자 유리 원칙) → 중과 base = nonBiz의 과세표준 귀속분 = max(0, nonBiz − 적용공제).
  // 적용공제 = aggregateIncome − taxBase (= min(aggregate, 기본공제); nonBiz < 공제면 base 0으로 흡수).
  const appliedDeduction = aggregateIncome - taxBase;
  const nonBizSurchargeBase = Math.max(0, nonBizIncome - appliedDeduction);
  const nonBusinessSurcharge = applyRate(nonBizSurchargeBase, 0.10);
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
