/**
 * 종합부동산세 별도합산 토지분 계산 엔진 (T-10)
 *
 * 종합부동산세법 §12(별도합산 과세대상)·§14(기본공제·세율·공제) 기반:
 * - 기본공제 80억원
 * - 공정시장가액비율 100% (주택분 60%와 다름!)
 * - 누진세율 3단계: 0.5% / 0.6% / 0.7%
 * - 재산세 비율 안분 공제 (전액 차감 아님)
 * - 농어촌특별세 20%
 * - 세부담 상한 없음 (주택분·종합합산 토지와 다름)
 *
 * 2-레이어 아키텍처 Layer 2:
 *   DB 직접 호출 없음 — 세율 데이터는 내부 상수 사용 (DB fallback 구조)
 */

import { applyRate, truncateToTenThousand, safeMultiplyThenDivide } from "./tax-utils";
import { COMPREHENSIVE_LAND_CONST } from "./legal-codes";
import type {
  SeparateAggregateLandForComprehensive,
  SeparateAggregateLandTaxResult,
} from "./types/comprehensive.types";

// ============================================================
// 세율 적용 함수 (종합부동산세법 §14②)
// ============================================================

/**
 * 별도합산 토지 누진세율 3단계 적용
 *
 * | 구간       | 세율  | 누진공제 |
 * |-----------|-------|---------|
 * | 200억 이하 | 0.5% | —       |
 * | 200억~400억 | 0.6% | 2,000만원 |
 * | 400억 초과 | 0.7% | 6,000만원 |
 */
export function applySeparateAggregateLandRate(taxBase: number): {
  appliedRate: number;
  progressiveDeduction: number;
  calculatedTax: number;
} {
  if (taxBase <= 0) {
    return { appliedRate: COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1, progressiveDeduction: 0, calculatedTax: 0 };
  }

  if (taxBase <= COMPREHENSIVE_LAND_CONST.SEPARATE_BRACKET_1) {
    // 200억 이하: 0.5%
    return {
      appliedRate: COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1,
      progressiveDeduction: 0,
      calculatedTax: applyRate(taxBase, COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1),
    };
  }

  if (taxBase <= COMPREHENSIVE_LAND_CONST.SEPARATE_BRACKET_2) {
    // 200억 초과 ~ 400억 이하: 0.6%, 누진공제 2,000만원
    return {
      appliedRate: COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_2,
      progressiveDeduction: COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_2,
      calculatedTax:
        applyRate(taxBase, COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_2) -
        COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_2,
    };
  }

  // 400억 초과: 0.7%, 누진공제 6,000만원
  return {
    appliedRate: COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_3,
    progressiveDeduction: COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_3,
    calculatedTax:
      applyRate(taxBase, COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_3) -
      COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_3,
  };
}

// ============================================================
// 재산세 비율 안분 공제 (종합부동산세법 시행령 §4의2)
// ============================================================

/**
 * 별도합산 토지 재산세 비율 안분 공제 계산
 *
 * 공제액 = 재산세 별도합산 부과세액 × min(종부세 과세표준 / 재산세 과세표준, 1.0)
 * - 분모 0 방어
 * - 비율 1.0 상한 적용
 * - 공제액 ≤ 산출세액
 */
export function applySeparateLandPropertyTaxCredit(
  calculatedTax: number,
  propertyTaxAmount: number,
  propertyTaxBase: number,
  comprehensiveTaxBase: number,
): {
  propertyTaxAmount: number;
  propertyTaxBase: number;
  comprehensiveTaxBase: number;
  ratio: number;
  creditAmount: number;
} {
  if (propertyTaxBase === 0) {
    return {
      propertyTaxAmount,
      propertyTaxBase: 0,
      comprehensiveTaxBase,
      ratio: 0,
      creditAmount: 0,
    };
  }

  const ratio = Math.min(comprehensiveTaxBase / propertyTaxBase, 1.0);

  // 비율 1.0 상한 적용 후 안분 공제액 계산 (종부세 과세표준 > 재산세 과세표준 시 전액 공제)
  const cappedBase = Math.min(comprehensiveTaxBase, propertyTaxBase);
  const creditRaw = Math.floor(
    safeMultiplyThenDivide(propertyTaxAmount, cappedBase, propertyTaxBase),
  );

  // 산출세액 초과 불가
  const creditAmount = Math.min(creditRaw, calculatedTax);

  return {
    propertyTaxAmount,
    propertyTaxBase,
    comprehensiveTaxBase,
    ratio,
    creditAmount,
  };
}

// ============================================================
// 메인 계산 함수
// ============================================================

/**
 * 별도합산 토지분 종합부동산세 계산 (T-10)
 *
 * 전체 흐름:
 *   납세의무 판정 (80억 초과) → 과세표준 → 세율 → 비율안분 → 농특세
 *   (세부담 상한 없음)
 *
 * @param lands - 별도합산 토지 목록 (개별 공시지가 + 재산세 데이터)
 */
export function calculateSeparateAggregateLandTax(
  lands: SeparateAggregateLandForComprehensive[],
): SeparateAggregateLandTaxResult {
  // 빈 배열 처리
  if (lands.length === 0) {
    return buildZeroResult(0);
  }

  // 인별 합산: 공시지가 합계 + 재산세 과세표준·부과세액 합계
  const totalPublicPrice = lands.reduce((sum, l) => sum + l.publicPrice, 0);
  const totalPropertyTaxBase = lands.reduce((sum, l) => sum + l.propertyTaxBase, 0);
  const totalPropertyTaxAmount = lands.reduce((sum, l) => sum + l.propertyTaxAmount, 0);

  // 납세의무 판정: 80억 초과 여부
  const isSubjectToTax =
    totalPublicPrice > COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT;

  if (!isSubjectToTax) {
    return buildZeroResult(totalPublicPrice);
  }

  // 과세표준: (합산 - 80억) × 100% → 만원 미만 절사
  const afterDeduction =
    totalPublicPrice - COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT;
  // 공정시장가액비율 100% → afterDeduction 그대로, 만원 절사만 수행
  const taxBase = truncateToTenThousand(afterDeduction);

  // 세율 적용
  const { appliedRate, progressiveDeduction, calculatedTax } =
    applySeparateAggregateLandRate(taxBase);

  // 재산세 비율 안분 공제
  const credit = applySeparateLandPropertyTaxCredit(
    calculatedTax,
    totalPropertyTaxAmount,
    totalPropertyTaxBase,
    taxBase,
  );

  // 결정세액 (재산세 공제 후, 음수 방어)
  const determinedTax = Math.max(calculatedTax - credit.creditAmount, 0);

  // 농어촌특별세 (결정세액 × 20%)
  const ruralSpecialTax = Math.floor(
    determinedTax * COMPREHENSIVE_LAND_CONST.RURAL_SPECIAL_TAX_RATE,
  );

  return {
    isSubjectToTax: true,
    totalPublicPrice,
    basicDeduction: COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT,
    afterDeduction,
    fairMarketRatio: COMPREHENSIVE_LAND_CONST.SEPARATE_FAIR_MARKET_RATIO,
    taxBase,
    appliedRate,
    progressiveDeduction,
    calculatedTax,
    propertyTaxCredit: credit,
    determinedTax,
    ruralSpecialTax,
    totalTax: determinedTax + ruralSpecialTax,
  };
}

/** 납세의무 없는 경우 0원 결과 생성 */
function buildZeroResult(
  totalPublicPrice: number,
): SeparateAggregateLandTaxResult {
  return {
    isSubjectToTax: false,
    totalPublicPrice,
    basicDeduction: COMPREHENSIVE_LAND_CONST.SEPARATE_DEDUCTION_AMOUNT,
    afterDeduction: 0,
    fairMarketRatio: COMPREHENSIVE_LAND_CONST.SEPARATE_FAIR_MARKET_RATIO,
    taxBase: 0,
    appliedRate: COMPREHENSIVE_LAND_CONST.SEPARATE_RATE_1,
    progressiveDeduction: 0,
    calculatedTax: 0,
    propertyTaxCredit: {
      propertyTaxAmount: 0,
      propertyTaxBase: 0,
      comprehensiveTaxBase: 0,
      ratio: 0,
      creditAmount: 0,
    },
    determinedTax: 0,
    ruralSpecialTax: 0,
    totalTax: 0,
  };
}
