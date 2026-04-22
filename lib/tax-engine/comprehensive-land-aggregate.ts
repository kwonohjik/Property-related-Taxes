/**
 * 종합부동산세 종합합산 토지분 계산 모듈 (T-09)
 * 종합부동산세법 §11~§15
 */

import {
  applyRate,
  truncateToTenThousand,
  safeMultiplyThenDivide,
} from "./tax-utils";
import { COMPREHENSIVE_LAND_CONST } from "./legal-codes";
import type {
  AggregateLandTaxInput,
  AggregateLandTaxResult,
  TaxCapResult,
  PropertyTaxCredit,
} from "./types/comprehensive.types";

// ============================================================
// 과세표준 산정
// ============================================================

/**
 * 종합합산 토지 과세표준 산정 (종합부동산세법 §12)
 * (합산 - 5억) × 100% → 만원 미만 절사
 */
export function calcAggregateLandTaxBase(
  totalOfficialValue: number,
  fairMarketRatio: number = COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO,
): number {
  const afterDeduction = Math.max(
    totalOfficialValue - COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
    0,
  );
  const raw = Math.floor(afterDeduction * fairMarketRatio);
  return truncateToTenThousand(raw);
}

// ============================================================
// 세율 적용
// ============================================================

/**
 * 종합합산 토지 누진세율 3단계 (종합부동산세법 §13①)
 * 15억 이하 1% / 15억~45억 2% / 45억 초과 3%
 */
export function calcAggregateLandTaxAmount(taxBase: number): {
  calculatedTax: number;
  appliedRate: number;
  progressiveDeduction: number;
} {
  if (taxBase <= 0) return { calculatedTax: 0, appliedRate: 0.01, progressiveDeduction: 0 };

  if (taxBase <= COMPREHENSIVE_LAND_CONST.AGGREGATE_BRACKET_1) {
    const calculatedTax = applyRate(taxBase, COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_1);
    return { calculatedTax, appliedRate: COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_1, progressiveDeduction: 0 };
  }

  if (taxBase <= COMPREHENSIVE_LAND_CONST.AGGREGATE_BRACKET_2) {
    const calculatedTax =
      applyRate(taxBase, COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_2) -
      COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_2;
    return {
      calculatedTax,
      appliedRate: COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_2,
      progressiveDeduction: COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_2,
    };
  }

  const calculatedTax =
    applyRate(taxBase, COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_3) -
    COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_3;
  return {
    calculatedTax,
    appliedRate: COMPREHENSIVE_LAND_CONST.AGGREGATE_RATE_3,
    progressiveDeduction: COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_3,
  };
}

// ============================================================
// 세부담 상한
// ============================================================

/**
 * 종합합산 토지분 세부담 상한 (종합부동산세법 §15) — 150% 단일 상한
 */
export function applyAggregateLandTaxCap(
  comprehensiveTax: number,
  propertyTaxAmount: number,
  previousYearTotalTax: number | undefined,
): TaxCapResult | undefined {
  if (previousYearTotalTax === undefined) return undefined;

  const capAmount = Math.floor(
    previousYearTotalTax * COMPREHENSIVE_LAND_CONST.AGGREGATE_TAX_CAP_RATE,
  );
  const cappedTax = Math.max(
    Math.min(comprehensiveTax, capAmount - propertyTaxAmount),
    0,
  );

  return {
    previousYearTotalTax,
    capRate: COMPREHENSIVE_LAND_CONST.AGGREGATE_TAX_CAP_RATE,
    capAmount,
    cappedTax,
    isApplied: cappedTax < comprehensiveTax,
  };
}

// ============================================================
// 비율 안분 공제 (T-08 공통 헬퍼 — 토지분에서도 사용)
// ============================================================

function calcLandPropertyTaxCreditProration(
  propertyTaxAmount: number,
  comprehensiveTaxBase: number,
  propertyTaxBase: number,
  calculatedTax: number,
): PropertyTaxCredit {
  if (propertyTaxBase === 0) {
    return {
      totalPropertyTax: propertyTaxAmount,
      propertyTaxBase: 0,
      comprehensiveTaxBase,
      ratio: 0,
      creditAmount: 0,
    };
  }

  const ratio = Math.min(comprehensiveTaxBase / propertyTaxBase, 1.0);
  const creditRaw = Math.floor(
    safeMultiplyThenDivide(propertyTaxAmount, comprehensiveTaxBase, propertyTaxBase),
  );
  const creditAmount = Math.min(creditRaw, calculatedTax);

  return {
    totalPropertyTax: propertyTaxAmount,
    propertyTaxBase,
    comprehensiveTaxBase,
    ratio,
    creditAmount,
  };
}

// ============================================================
// 종합합산 토지분 통합 계산 (T-09)
// ============================================================

/**
 * 종합합산 토지분 종합부동산세 계산
 * 전체 흐름: 납세의무 판정 → 과세표준 → 세율 → 비율안분 → 상한 → 농특세
 */
export function calculateAggregateLandTax(
  input: AggregateLandTaxInput,
): AggregateLandTaxResult {
  const {
    totalOfficialValue,
    propertyTaxBase,
    propertyTaxAmount,
    previousYearTotalTax,
  } = input;

  const isSubjectToTax =
    totalOfficialValue > COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT;

  if (!isSubjectToTax) {
    return {
      isSubjectToTax: false,
      totalOfficialValue,
      basicDeduction: COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
      afterDeduction: 0,
      fairMarketRatio: COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO,
      taxBase: 0,
      appliedRate: 0,
      progressiveDeduction: 0,
      calculatedTax: 0,
      propertyTaxCredit: {
        propertyTaxAmount: 0,
        propertyTaxBase: 0,
        comprehensiveTaxBase: 0,
        ratio: 0,
        creditAmount: 0,
      },
      taxCap: undefined,
      determinedTax: 0,
      ruralSpecialTax: 0,
      totalTax: 0,
    };
  }

  const taxBase = calcAggregateLandTaxBase(totalOfficialValue);
  const afterDeduction = Math.max(
    totalOfficialValue - COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
    0,
  );

  const { calculatedTax, appliedRate, progressiveDeduction } =
    calcAggregateLandTaxAmount(taxBase);

  const credit = calcLandPropertyTaxCreditProration(
    propertyTaxAmount,
    taxBase,
    propertyTaxBase,
    calculatedTax,
  );
  const comprehensiveTaxAfterCredit = Math.max(
    calculatedTax - credit.creditAmount,
    0,
  );

  const taxCap = applyAggregateLandTaxCap(
    comprehensiveTaxAfterCredit,
    propertyTaxAmount,
    previousYearTotalTax,
  );

  const determinedTax = taxCap ? taxCap.cappedTax : comprehensiveTaxAfterCredit;

  const ruralSpecialTax = Math.floor(
    determinedTax * COMPREHENSIVE_LAND_CONST.RURAL_SPECIAL_TAX_RATE,
  );

  return {
    isSubjectToTax,
    totalOfficialValue,
    basicDeduction: COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
    afterDeduction,
    fairMarketRatio: COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO,
    taxBase,
    appliedRate,
    progressiveDeduction,
    calculatedTax,
    propertyTaxCredit: {
      propertyTaxAmount: credit.totalPropertyTax,
      propertyTaxBase: credit.propertyTaxBase,
      comprehensiveTaxBase: credit.comprehensiveTaxBase,
      ratio: credit.ratio,
      creditAmount: credit.creditAmount,
    },
    taxCap,
    determinedTax,
    ruralSpecialTax,
    totalTax: determinedTax + ruralSpecialTax,
  };
}
