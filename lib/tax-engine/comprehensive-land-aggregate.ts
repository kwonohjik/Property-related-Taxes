/**
 * 종합부동산세 종합합산 토지분 계산 모듈 (T-09)
 * 종합부동산세법 §11~§15
 */

import {
  applyRate,
  truncateToTenThousand,
  safeMultiplyThenDivide,
} from "./tax-utils";
import { COMPREHENSIVE_LAND_CONST, PROPERTY_CONST } from "./legal-codes";
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
// 재산세 표준세율 산출세액 계산 (⑥ 계산용)
// ============================================================

/**
 * 종합합산 토지 재산세 표준세율 산출세액 계산 (지방세법 §111①1호 가목)
 *
 * 세율표:
 *   ≤ 5,000만원: 0.2%
 *   ≤ 1억원:     0.3% - 50,000원
 *   > 1억원:     0.5% - 250,000원   ← 종부세 대상 고액은 이 구간
 *
 * ⑥(총표준세율재산세) 계산에 사용 — applyRate()로 분수 정수 연산 보장.
 */
export function calcComprehensiveAggregateLandStdTax(propertyTaxBase: number): number {
  if (propertyTaxBase <= 0) return 0;
  const B1 = PROPERTY_CONST.COMPREHENSIVE_BRACKET_1;  // 5,000만원
  const B2 = PROPERTY_CONST.COMPREHENSIVE_BRACKET_2;  // 1억원
  if (propertyTaxBase <= B1) {
    return applyRate(propertyTaxBase, PROPERTY_CONST.COMPREHENSIVE_RATE_1);
  } else if (propertyTaxBase <= B2) {
    return applyRate(propertyTaxBase, PROPERTY_CONST.COMPREHENSIVE_RATE_2) -
      PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_2;
  } else {
    return applyRate(propertyTaxBase, PROPERTY_CONST.COMPREHENSIVE_RATE_3) -
      PROPERTY_CONST.COMPREHENSIVE_DEDUCTION_3;
  }
}

// ============================================================
// 비율 안분 공제 (종합부동산세법 시행령 §4의3)
// ============================================================

/**
 * 종합합산 토지 재산세 비율 안분 공제 (종합부동산세법 시행령 §4의3)
 *
 * 법정 산식:
 *   공제액 = ⓐ × (⑤ ÷ ⑥)
 *
 *   ⓐ = 재산세 부과세액 (입력 propertyTaxAmount)
 *   ⑤ = 종부세 과세표준 × 재산세 FMR(70%) × 최고세율(0.5%)  [누진공제 없음]
 *       분수 정수: taxBase × 70 × 5 / 100_000
 *       (×0.005 float 직접 곱 시 floor 1원 부족 방지 — feedback_applyrate_fractional)
 *   ⑥ = 재산세 과세표준 전체에 대한 표준세율 산출세액
 *       = calcComprehensiveAggregateLandStdTax(propertyTaxBase)
 *
 * 사례10 (2022) 실측:
 *   ⑤ = 13억 × 70% × 0.5% = 4,550,000
 *   ⑥ = 18억 × 70% × 0.5% − 250,000 = 6,050,000
 *   ⓐ = 5,800,000
 *   공제 = 5,800,000 × 4,550,000 / 6,050,000 = 4,361,983
 *
 * @param propertyTaxAmount  - ⓐ: 실제 부과 재산세 합계
 * @param numeratorStdTaxEq  - ⑤: 종부세 과표분 표준세율 재산세 상당액
 * @param denominatorStdTax  - ⑥: 재산세 과표 전체 표준세율 산출세액
 * @param calculatedTax      - 공제 상한 (산출세액)
 */
function calcLandPropertyTaxCreditProration(
  propertyTaxAmount: number,
  numeratorStdTaxEq: number,
  denominatorStdTax: number,
  calculatedTax: number,
): PropertyTaxCredit {
  if (denominatorStdTax === 0) {
    return {
      totalPropertyTax: propertyTaxAmount,
      propertyTaxBase: 0,
      comprehensiveTaxBase: 0,
      ratio: 0,
      creditAmount: 0,
    };
  }

  const ratio = Math.min(numeratorStdTaxEq / denominatorStdTax, 1.0);
  const creditRaw = Math.floor(
    safeMultiplyThenDivide(propertyTaxAmount, numeratorStdTaxEq, denominatorStdTax),
  );
  const creditAmount = Math.min(creditRaw, calculatedTax);

  return {
    totalPropertyTax: propertyTaxAmount,
    // 하위 호환 필드: 법정 산식 전환 후 의미 변경
    // propertyTaxBase → denominatorStdTax (총 표준세율 재산세 산출세액)
    // comprehensiveTaxBase → numeratorStdTaxEq (종부세 과표분 표준세율 재산세 상당액)
    propertyTaxBase: denominatorStdTax,
    comprehensiveTaxBase: numeratorStdTaxEq,
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
 *
 * @param fairMarketRatio - 종부세 토지 공정시장가액비율 (시행령 §2의4② — 2021=0.95, 2022~=1.00).
 *                          기본값 1.00 → 기존 직접 호출 하위호환.
 */
export function calculateAggregateLandTax(
  input: AggregateLandTaxInput,
  fairMarketRatio: number = COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO,
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
      fairMarketRatio,
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

  const taxBase = calcAggregateLandTaxBase(totalOfficialValue, fairMarketRatio);
  const afterDeduction = Math.max(
    totalOfficialValue - COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
    0,
  );

  const { calculatedTax, appliedRate, progressiveDeduction } =
    calcAggregateLandTaxAmount(taxBase);

  // ── 재산세 비율 안분 공제 (종합부동산세법 시행령 §4의3) ──
  //
  // ⑤ = 종부세 과표 × 재산세FMR(70%) × 종합합산 최고세율(0.5%)  [누진공제 없음]
  //   = taxBase × 70 × 5 / 100_000
  //   (×0.005 float 직접 곱 시 floor 1원 부족 — feedback_applyrate_fractional)
  //
  // ⑥ = 재산세 과표 전체에 대한 종합합산 표준세율 산출세액
  //   = calcComprehensiveAggregateLandStdTax(propertyTaxBase)
  //   (누진공제 포함: 1억 초과 → 과표×0.5% - 250,000)
  const landFMR = PROPERTY_CONST.FAIR_MARKET_RATIO_LAND_BUILDING; // 0.70
  // landFMR = 70/100, 최고세율 = 5/1000 → 합산 분수: ×70×5/100_000
  const numeratorStdTaxEq = Math.floor(
    (taxBase * Math.round(landFMR * 100) * 5) / 100_000,
  );
  const denominatorStdTax = calcComprehensiveAggregateLandStdTax(propertyTaxBase);

  const credit = calcLandPropertyTaxCreditProration(
    propertyTaxAmount,
    numeratorStdTaxEq,
    denominatorStdTax,
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
    fairMarketRatio,
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
