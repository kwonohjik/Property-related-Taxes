/**
 * 종합부동산세 공통 헬퍼 모듈
 *
 * T-06: 1세대1주택 세액공제 (고령자·장기보유)
 * T-07: 주택분 세부담 상한
 * T-08: 재산세 비율 안분 공제
 * 사후관리 위반 추징 (§8③)
 */

import { differenceInYears } from "date-fns";
import { safeMultiplyThenDivide, safeMulDivRound } from "./tax-utils";
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
// 유효계수 헬퍼 (지분율 × 감면 후 계수)
// ============================================================

/**
 * 유효계수 = ownershipRatio × (1 − reductionRate).
 *
 * 지분율과 감면율을 단일 곱으로 통합하는 헬퍼.
 * 두 계수가 동일 위치(공시가격·재산세에 곱셈)에 적용되므로
 * 교환법칙으로 단일 floor로 합산 가능.
 *
 * 기본값:
 *   ownershipRatio ?? 1  → 단독 소유(100%) 그대로 보존 (기존 동작 보존)
 *   reductionRate ?? 0   → 감면 없음 (기존 동작 보존)
 *
 * @param reductionRate  지자체 조례 재산세 감면율 (0~1, 미입력=0)
 * @param ownershipRatio 공유지분율 (0~1, 미입력=1)
 */
export function effectiveFactor(
  reductionRate?: number,
  ownershipRatio?: number,
): number {
  return (ownershipRatio ?? 1) * (1 - (reductionRate ?? 0));
}

/**
 * 공시가격·재산세 base에 결합계수(ownershipRatio × (1 − reductionRate))를 적용해 floor 정수 반환.
 *
 * ★ 부동소수 곱 금지 — 0.7 같은 float는 1,500,000,000 × 0.7 = 1,049,999,999.99 → floor 1원 부족
 *   (memory feedback_applyrate_fractional_rate_one_won_error). 만분율(basis point) 정수 + BigInt로
 *   곱 후 1회 정수 나눗셈(floor). base 2조 등 overflow도 BigInt로 안전.
 *   (effectiveFactor float는 가드 판정 등 비정밀 용도로만 — 금액 곱셈은 반드시 이 함수)
 */
export function applyEffectiveFactor(
  base: number,
  reductionRate?: number,
  ownershipRatio?: number,
): number {
  const ratioBp = BigInt(Math.round((ownershipRatio ?? 1) * 10000));
  const rateBp = BigInt(Math.round((reductionRate ?? 0) * 10000));
  return Number((BigInt(Math.round(base)) * ratioBp * (10000n - rateBp)) / 100000000n);
}

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
 *
 * ★ GAP-1 (§9⑥⑧ 축자): 공제 base는 "제1항·제3항·제4항에 따라 산출된 세액" —
 *   §9③(재산세 비율 안분 공제) 적용 **후** 세액이다. 호출부(comprehensive-tax.ts)가
 *   재산세 안분 공제 후 세액(taxAfterPropertyCredit)을 첫 인자로 전달한다.
 *
 * ★ GAP-2 (§9⑦⑨): §8④ 1세대1주택자 의제 시 각 호 산출세액(공시가격합계액으로 안분)을
 *   base에서 제외 → 공제 = floor(base × main/total × 합산공제율). apportionment 전달 시 적용.
 *   분수 정수 연산: floor(base × round(rate×100) × main / (total × 100)) — 단일 floor (safeMultiplyThenDivide BigInt).
 *
 * @param taxAfterPropertyCredit - 재산세 비율 안분 공제 후 세액 (§9⑥ "제3항에 따라 산출된 세액")
 * @param apportionment          - §8④ 의제 시 §9⑦⑨ 공시가격 안분 (미전달 시 비율 1 — 일반 1세대1주택·부부특례)
 */
export function applyOneHouseDeduction(
  taxAfterPropertyCredit: number,
  birthDate: Date,
  acquisitionDate: Date,
  assessmentDate: Date,
  apportionment?: {
    mainHouseAssessedValue: number;
    totalAssessedValue: number;
  },
): OneHouseDeductionResult {
  const seniorRate = getSeniorRate(birthDate, assessmentDate);
  const longTermRate = getLongTermRate(acquisitionDate, assessmentDate);
  const combined = seniorRate + longTermRate;
  const combinedRate = Math.min(combined, COMPREHENSIVE_CONST.ONE_HOUSE_MAX_CREDIT_RATE);

  let deductionAmount: number;
  let apportionmentRatio: OneHouseDeductionResult["apportionmentRatio"];
  if (apportionment && apportionment.totalAssessedValue > 0) {
    // §9⑦⑨ 안분: floor(base × round(rate×100) × main / (total × 100))
    // base × round(rate×100)은 안전(수백만 × ≤80) → safeMultiplyThenDivide가 main 곱에서 BigInt fallback
    const rateInt = Math.round(combinedRate * 100); // 0.8 → 80, 0.4 → 40
    deductionAmount = safeMultiplyThenDivide(
      taxAfterPropertyCredit * rateInt,
      apportionment.mainHouseAssessedValue,
      apportionment.totalAssessedValue * 100,
    );
    apportionmentRatio = {
      mainHouseAssessedValue: apportionment.mainHouseAssessedValue,
      totalAssessedValue: apportionment.totalAssessedValue,
    };
  } else {
    deductionAmount = Math.floor(taxAfterPropertyCredit * combinedRate);
  }

  // 신고서 ⑦(고령자)·⑧(장기보유) 분리 — 80% 상한 발동 시에도 원 비율(senior:longTerm)로 안분 + 잔액 흡수.
  //   합 = deductionAmount 보장 (feedback_floor_residual_absorption). combined=0이면 둘 다 0.
  const rateSum = seniorRate + longTermRate;
  const seniorAmount =
    rateSum > 0 ? Math.floor((deductionAmount * seniorRate) / rateSum) : 0;
  const longTermAmount = deductionAmount - seniorAmount;

  return {
    seniorRate,
    longTermRate,
    combinedRate,
    deductionAmount,
    seniorAmount,
    longTermAmount,
    isMaxCapApplied: combined > COMPREHENSIVE_CONST.ONE_HOUSE_MAX_CREDIT_RATE,
    apportionmentRatio,
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
 * @param capRate - 세부담 상한율 (기본 1.5). 연도·다주택 분기는 호출부(comprehensive-tax.ts)가 결정
 *                  — 2022 이하 조정다주택/3주택+ 3.0, 그 외 1.5.
 */
export function applyTaxCap(
  comprehensiveTax: number,
  totalPropertyTax: number,
  previousYearTotalTax: number | undefined,
  capRate: number = COMPREHENSIVE_CONST.TAX_CAP_RATE_GENERAL,
): TaxCapResult | undefined {
  if (previousYearTotalTax === undefined) return undefined;

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
 * 재산세 비율 안분 공제 계산 (T-08) — 종합부동산세법 시행령 §4의3
 *
 * 법정 산식:
 *   공제액 = ⓐ × (⑤ ÷ ⑥)
 *
 *   ⓐ = 재산세 부과세액 합계 (특례세율·세부담상한 적용 후 determinedTax 합계)
 *   ⑤ = 종부세 과세표준 × 재산세 공정시장가액비율(60%) × 0.4% (주택 최고세율)
 *       = 종부세 과표분에 대한 일반 표준세율 재산세 상당액 [누진공제 없음]
 *   ⑥ = 재산세 과세표준 합계 × 일반 표준세율 적용 산출세액 합계
 *       (Σ 각 주택별 일반 표준세율 재산세 산출세액 — 특례세율 아님)
 *
 * 분모(⑥) = 0 가드, creditAmount ≤ calculatedTax 상한.
 * ⑤ 계산의 ×0.004는 분수 정수(×4 / 1000) — floor 1원 오차 방지
 *   (memory feedback_applyrate_fractional_rate_one_won_error)
 *
 * 참고: 사례1 (2022, 공시 9.5억, 일반 1주택)
 *   ⑤ = 2.1억 × 60% × 0.4% = 504,000
 *   ⑥ = 1,650,000 (5.7억 × 0.4% − 63만)
 *   ⓐ = 1,650,000
 *   공제 = 1,650,000 × 504,000 / 1,650,000 = 504,000 (국세청 사례집 pdf38 확인)
 *
 * @param propertyTaxAmount     - ⓐ: 재산세 부과세액 합계 (determinedTax 합계)
 * @param numeratorStdTaxEq     - ⑤: 종부세 과표분 표준세율 재산세 상당액
 * @param denominatorStdTaxSum  - ⑥: 총 일반 표준세율 재산세 산출세액 합계
 * @param calculatedTax         - 공제 상한 (1세대1주택 공제 후 산출세액)
 */
export function calculatePropertyTaxCreditProration(
  propertyTaxAmount: number,
  numeratorStdTaxEq: number,
  denominatorStdTaxSum: number,
  calculatedTax: number,
): PropertyTaxCredit {
  if (denominatorStdTaxSum === 0) {
    return {
      totalPropertyTax: propertyTaxAmount,
      propertyTaxBase: 0,
      comprehensiveTaxBase: 0,
      ratio: 0,
      creditAmount: 0,
    };
  }

  const ratio = Math.min(numeratorStdTaxEq / denominatorStdTaxSum, 1.0);
  // ②ⓓ 공제할 재산세액 = round-half-up(ⓐ × ⑤ / ⑥) — §4의3 절사 미규정, 교재·실무 반올림
  const creditRaw = safeMulDivRound(propertyTaxAmount, numeratorStdTaxEq, denominatorStdTaxSum);
  const creditAmount = Math.min(creditRaw, calculatedTax);

  return {
    totalPropertyTax: propertyTaxAmount,
    // 하위 호환용 필드: 법정 산식 전환 후 의미가 변경됨
    // propertyTaxBase → denominatorStdTaxSum (총 일반 표준세율 재산세 합계)
    // comprehensiveTaxBase → numeratorStdTaxEq (종부세 과표분 표준세율 재산세 상당액)
    propertyTaxBase: denominatorStdTaxSum,
    comprehensiveTaxBase: numeratorStdTaxEq,
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
