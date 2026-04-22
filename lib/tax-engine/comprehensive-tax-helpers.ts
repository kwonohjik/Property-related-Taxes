/**
 * 종합부동산세 공통 헬퍼 모듈
 *
 * T-06: 1세대1주택 세액공제 (고령자·장기보유)
 * T-07: 주택분 세부담 상한
 * T-08: 재산세 비율 안분 공제
 * 사후관리 위반 추징 (§8③)
 */

import { differenceInYears } from "date-fns";
import { safeMultiplyThenDivide } from "./tax-utils";
import {
  COMPREHENSIVE_CONST,
  COMPREHENSIVE_EXCL_CONST,
} from "./legal-codes";
import type {
  OneHouseDeductionResult,
  TaxCapResult,
  PropertyTaxCredit,
  PostManagementViolationInput,
  PostManagementPenaltyResult,
} from "./types/comprehensive.types";

// ============================================================
// T-06: 1세대1주택 세액공제
// ============================================================

/**
 * 고령자 공제율 반환 (종합부동산세법 §9②1호, 시행령 §4의2)
 * 만 60세~: 20% / 65세~: 30% / 70세~: 40%
 */
export function getSeniorRate(
  birthDate: Date,
  assessmentDate: Date,
): number {
  const age = differenceInYears(assessmentDate, birthDate);
  if (age >= COMPREHENSIVE_CONST.SENIOR_AGE_70) return COMPREHENSIVE_CONST.SENIOR_RATE_70;
  if (age >= COMPREHENSIVE_CONST.SENIOR_AGE_65) return COMPREHENSIVE_CONST.SENIOR_RATE_65;
  if (age >= COMPREHENSIVE_CONST.SENIOR_AGE_MIN) return COMPREHENSIVE_CONST.SENIOR_RATE_60;
  return 0;
}

/**
 * 장기보유 공제율 반환 (종합부동산세법 §9②2호, 시행령 §4의3)
 * 5년~: 20% / 10년~: 40% / 15년~: 50%
 */
export function getLongTermRate(
  acquisitionDate: Date,
  assessmentDate: Date,
): number {
  const years = differenceInYears(assessmentDate, acquisitionDate);
  if (years >= 15) return COMPREHENSIVE_CONST.LONG_TERM_RATE_15Y;
  if (years >= 10) return COMPREHENSIVE_CONST.LONG_TERM_RATE_10Y;
  if (years >= COMPREHENSIVE_CONST.LONG_TERM_MIN_YEARS) return COMPREHENSIVE_CONST.LONG_TERM_RATE_5Y;
  return 0;
}

/**
 * 1세대1주택 세액공제 계산 (T-06) — 합산 최대 80% 상한
 */
export function applyOneHouseDeduction(
  calculatedTax: number,
  birthDate: Date,
  acquisitionDate: Date,
  assessmentDate: Date,
): OneHouseDeductionResult {
  const seniorRate = getSeniorRate(birthDate, assessmentDate);
  const longTermRate = getLongTermRate(acquisitionDate, assessmentDate);
  const combined = seniorRate + longTermRate;
  const combinedRate = Math.min(combined, COMPREHENSIVE_CONST.ONE_HOUSE_MAX_CREDIT_RATE);
  const deductionAmount = Math.floor(calculatedTax * combinedRate);

  return {
    seniorRate,
    longTermRate,
    combinedRate,
    deductionAmount,
    isMaxCapApplied: combined > COMPREHENSIVE_CONST.ONE_HOUSE_MAX_CREDIT_RATE,
  };
}

// ============================================================
// T-07: 주택분 세부담 상한
// ============================================================

/**
 * 주택분 세부담 상한 적용 (T-07) — 종합부동산세법 §10
 *
 * @param comprehensiveTax - 당해연도 종부세액 (재산세 비율안분 공제 후)
 * @param totalPropertyTax - 당해연도 재산세 합계
 * @param previousYearTotalTax - 전년도 총세액 (종부세+재산세, 미입력 시 undefined)
 * @param isMultiHouseInAdjustedArea - 조정대상지역 2주택+ 여부 (현행법 단일상한, 호환성 유지용)
 */
export function applyTaxCap(
  comprehensiveTax: number,
  totalPropertyTax: number,
  previousYearTotalTax: number | undefined,
  isMultiHouseInAdjustedArea: boolean,
): TaxCapResult | undefined {
  if (previousYearTotalTax === undefined) return undefined;

  void isMultiHouseInAdjustedArea; // 현행법상 구분 불필요, 파라미터 호환성 유지
  const capRate = COMPREHENSIVE_CONST.TAX_CAP_RATE_GENERAL;
  const capAmount = Math.floor(previousYearTotalTax * capRate);
  const cappedTax = Math.max(
    Math.min(comprehensiveTax, capAmount - totalPropertyTax),
    0,
  );

  return {
    previousYearTotalTax,
    capRate,
    capAmount,
    cappedTax,
    isApplied: cappedTax < comprehensiveTax,
  };
}

// ============================================================
// T-08: 재산세 비율 안분 공제
// ============================================================

/**
 * 재산세 비율 안분 공제 계산 (T-08)
 * 공제액 = 재산세 부과세액 × (종부세 과세표준 ÷ 재산세 과세표준)
 */
export function calculatePropertyTaxCreditProration(
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
// 사후관리 위반 추징 (종합부동산세법 §8③)
// ============================================================

/**
 * 합산배제 사후관리 위반 추징 계산
 * 의무임대기간 미충족·임대료 5% 초과 등 위반 시 과거 배제세액 + 이자 추징
 */
export function calculatePostManagementPenalty(
  input: PostManagementViolationInput,
): PostManagementPenaltyResult {
  const recoveryPeriodYears = input.annualExcludedTax.length;
  const totalRecoveryTax = input.annualExcludedTax.reduce(
    (sum, tax) => sum + tax,
    0,
  );

  const daysPassed = Math.floor(
    (input.assessmentDate.getTime() - input.exclusionStartDate.getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const interestAmount = Math.floor(
    totalRecoveryTax *
      daysPassed *
      COMPREHENSIVE_EXCL_CONST.DAILY_PENALTY_RATE,
  );

  return {
    totalRecoveryTax,
    interestAmount,
    totalPayable: totalRecoveryTax + interestAmount,
    recoveryPeriodYears,
  };
}
