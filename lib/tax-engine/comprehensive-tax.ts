/**
 * 종합부동산세 계산 엔진 (Pure Engine)
 *
 * 2-레이어 아키텍처 Layer 2:
 *   DB 직접 호출 없음 — 세율 데이터는 매개변수로 전달
 *
 * 계산 순서 (주택분):
 *   Step 0. applyAggregationExclusion()     — 합산배제 판정
 *   Step 1. 공시가격 합산 (합산배제 후)
 *   Step 2. 기본공제 차감 (9억/12억)
 *   Step 3. 공정시장가액비율 적용 (60%)
 *   Step 4. 과세표준 → 만원 미만 절사
 *   Step 5. 누진세율 7단계 → 산출세액
 *   Step 6. 1세대1주택 세액공제 (고령자 + 장기보유, 최대 80%)
 *   Step 7. 재산세 비율 안분 공제 (핵심!)
 *   Step 8. 세부담 상한 적용
 *   Step 9. 농어촌특별세 (결정세액 × 20%)
 *
 * 종합합산 토지:  calculateAggregateLandTax()
 * 별도합산 토지:  calculateSeparateAggregateLandTax() (comprehensive-separate-land.ts)
 *
 * property-tax.ts를 직접 import하여 개별 주택 재산세 자동 계산 후 비율 안분 공제에 활용.
 */

import { differenceInYears, addYears } from "date-fns";
import {
  applyRate,
  truncateToTenThousand,
  safeMultiplyThenDivide,
} from "./tax-utils";
import {
  COMPREHENSIVE_CONST,
  COMPREHENSIVE_EXCL,
  COMPREHENSIVE_EXCL_CONST,
  COMPREHENSIVE_LAND_CONST,
} from "./legal-codes";
import { calculatePropertyTax } from "./property-tax";
import { calculateSeparateAggregateLandTax } from "./comprehensive-separate-land";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  ComprehensiveTaxInput,
  ComprehensiveTaxResult,
  AggregationExclusionResult,
  ExclusionResult,
  ExclusionValidationResult,
  PropertyForExclusion,
  RentalExclusionInput,
  OtherExclusionInput,
  ExclusionType,
  OneHouseDeductionResult,
  TaxCapResult,
  PropertyTaxCredit,
  AggregateLandTaxInput,
  AggregateLandTaxResult,
  PostManagementViolationInput,
  PostManagementPenaltyResult,
} from "./types/comprehensive.types";

// ============================================================
// 내부 상수 — 주택분 누진세율 7단계 (종합부동산세법 §9①)
// ============================================================

interface ComprehensiveBracket {
  limit: number;       // 과세표준 상한 (초과하면 다음 구간)
  rate: number;        // 세율
  deduction: number;   // 누진공제
}

const HOUSING_BRACKETS: ComprehensiveBracket[] = [
  { limit: 300_000_000,    rate: 0.005, deduction: 0 },           // 3억 이하 0.5%
  { limit: 600_000_000,    rate: 0.007, deduction: 600_000 },     // 3억~6억 0.7%
  { limit: 1_200_000_000,  rate: 0.010, deduction: 2_400_000 },   // 6억~12억 1.0%
  { limit: 2_500_000_000,  rate: 0.013, deduction: 6_000_000 },   // 12억~25억 1.3%
  { limit: 5_000_000_000,  rate: 0.015, deduction: 11_000_000 },  // 25억~50억 1.5%
  { limit: 9_400_000_000,  rate: 0.020, deduction: 36_000_000 },  // 50억~94억 2.0%
  { limit: Infinity,       rate: 0.027, deduction: 101_800_000 }, // 94억 초과 2.7%
];

// ============================================================
// T-05: 합산배제 판정 모듈
// ============================================================

/**
 * 임대주택 합산배제 요건 판정 (종합부동산세법 시행령 §3)
 */
export function validateRentalExclusion(
  input: RentalExclusionInput,
): ExclusionValidationResult {
  const failReasons: string[] = [];

  // 1. 임대등록 여부
  if (!input.rentalRegistrationDate) {
    failReasons.push(COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION);
  }

  // 2. 면적 요건 (85㎡ 이하)
  if (input.area > COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING) {
    failReasons.push(COMPREHENSIVE_EXCL.AREA_EXCEEDED);
  }

  // 3. 가격 요건
  const priceLimit = getPriceLimit(input.registrationType, input.location);
  if (input.assessedValue > priceLimit) {
    failReasons.push(COMPREHENSIVE_EXCL.PRICE_EXCEEDED);
  }

  // 4. 임대료 증가율 5% 이내 검증
  if (!input.isInitialContract && input.previousRent !== undefined) {
    const increaseRate = (input.currentRent - input.previousRent) / input.previousRent;
    if (increaseRate > COMPREHENSIVE_EXCL_CONST.RENT_INCREASE_RATE_LIMIT) {
      failReasons.push(COMPREHENSIVE_EXCL.RENT_INCREASE_EXCEEDED);
    }
  }

  // 5. 임대 개시 여부 (과세기준일 기준)
  if (input.assessmentDate < input.rentalStartDate) {
    failReasons.push(COMPREHENSIVE_EXCL.RENTAL_NOT_STARTED);
  }

  if (failReasons.length > 0) {
    return { isExcluded: false, reason: failReasons[0], failReasons };
  }

  return {
    isExcluded: true,
    reason: getRentalExclusionLegalCode(input.registrationType),
  };
}

/** 유형+지역별 가격 상한 반환 */
function getPriceLimit(
  registrationType: RentalExclusionInput["registrationType"],
  location: "metro" | "non_metro",
): number {
  if (registrationType === "public_support") {
    return location === "metro"
      ? COMPREHENSIVE_EXCL_CONST.PUBLIC_SUPPORT_PRICE_METRO
      : COMPREHENSIVE_EXCL_CONST.PUBLIC_SUPPORT_PRICE_NON_METRO;
  }
  return location === "metro"
    ? COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_METRO
    : COMPREHENSIVE_EXCL_CONST.RENTAL_PRICE_NON_METRO;
}

/** 임대주택 등록 유형별 법령 상수 반환 */
function getRentalExclusionLegalCode(
  registrationType: RentalExclusionInput["registrationType"],
): string {
  switch (registrationType) {
    case "private_construction":   return COMPREHENSIVE_EXCL.PRIVATE_CONSTRUCTION_RENTAL;
    case "private_purchase_long":  return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_LONG;
    case "private_purchase_short": return COMPREHENSIVE_EXCL.PRIVATE_PURCHASE_RENTAL_SHORT;
    case "public_support":         return COMPREHENSIVE_EXCL.PUBLIC_SUPPORT_RENTAL;
    case "public_construction":    return COMPREHENSIVE_EXCL.PUBLIC_CONSTRUCTION_RENTAL;
    case "public_purchase":        return COMPREHENSIVE_EXCL.PUBLIC_PURCHASE_RENTAL;
  }
}

/**
 * 기타 합산배제 주택 요건 판정 (종합부동산세법 시행령 §4)
 */
export function validateOtherExclusion(
  prop: PropertyForExclusion,
  type: ExclusionType,
  info: OtherExclusionInput,
  assessmentDate: Date,
): ExclusionValidationResult {
  switch (type) {
    case "unsold_housing": {
      // 미분양주택: 최초 매각 + 모집공고일 이후 취득 + 5년 이내
      if (!info.isFirstSale) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_NOT_FIRST_SALE };
      }
      if (!info.recruitmentNoticeDate || !info.acquisitionDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const acquisitionDate = new Date(info.acquisitionDate);
      const noticeDate = new Date(info.recruitmentNoticeDate);
      if (acquisitionDate < noticeDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_BEFORE_NOTICE };
      }
      const exclusionEndDate = addYears(
        acquisitionDate,
        COMPREHENSIVE_EXCL_CONST.UNSOLD_EXCLUSION_YEARS,
      );
      if (assessmentDate > exclusionEndDate) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.UNSOLD_PERIOD_EXPIRED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.UNSOLD_HOUSING };
    }

    case "daycare_housing": {
      // 가정어린이집: 인가증 보유 + 실사용
      if (!info.hasDaycarePermit || !info.isActuallyUsedAsDaycare) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DAYCARE_HOUSING };
    }

    case "employee_housing": {
      // 사원용: 종업원 제공 + 임대료율 50% 이하 + 85㎡ 이하
      if (!info.isProvidedToEmployee) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (
        info.rentalFeeRate !== undefined &&
        info.rentalFeeRate > COMPREHENSIVE_EXCL_CONST.EMPLOYEE_HOUSING_RENT_RATE_LIMIT
      ) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
      }
      if (prop.area !== undefined && prop.area > COMPREHENSIVE_EXCL_CONST.AREA_LIMIT_NATIONAL_HOUSING) {
        return { isExcluded: false, reason: COMPREHENSIVE_EXCL.AREA_EXCEEDED };
      }
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.EMPLOYEE_HOUSING };
    }

    case "developer_unsold":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.DEVELOPER_UNSOLD };

    case "cultural_heritage":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.CULTURAL_HERITAGE };

    case "religious":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.RELIGIOUS_HOUSING };

    case "senior_welfare":
      return { isExcluded: true, reason: COMPREHENSIVE_EXCL.SENIOR_WELFARE_HOUSING };

    default:
      return { isExcluded: false, reason: COMPREHENSIVE_EXCL.NOT_APPLIED };
  }
}

/**
 * 합산배제 일괄 판정 (T-05)
 * 각 주택에 대해 유형별 요건 검증 후 결과 집계
 */
export function applyAggregationExclusion(
  properties: PropertyForExclusion[],
  assessmentDate: Date,
): AggregationExclusionResult {
  const results: ExclusionResult[] = properties.map((prop) => {
    if (prop.exclusionType === "none") {
      return {
        propertyId: prop.propertyId,
        isExcluded: false,
        excludedValue: 0,
        exclusionType: "none" as const,
        reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
      };
    }

    // 임대주택 유형 판정
    const rentalTypes: ExclusionType[] = [
      "private_construction_rental",
      "private_purchase_rental_long",
      "private_purchase_rental_short",
      "public_support_rental",
      "public_construction_rental",
      "public_purchase_rental",
    ];

    let validationResult: ExclusionValidationResult;

    if (rentalTypes.includes(prop.exclusionType)) {
      if (!prop.rentalInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NO_RENTAL_REGISTRATION,
        };
      } else {
        validationResult = validateRentalExclusion({
          ...prop.rentalInfo,
          assessmentDate,
        });
      }
    } else {
      if (!prop.otherInfo) {
        validationResult = {
          isExcluded: false,
          reason: COMPREHENSIVE_EXCL.NOT_APPLIED,
        };
      } else {
        validationResult = validateOtherExclusion(
          prop,
          prop.exclusionType,
          prop.otherInfo,
          assessmentDate,
        );
      }
    }

    return {
      propertyId: prop.propertyId,
      isExcluded: validationResult.isExcluded,
      excludedValue: validationResult.isExcluded ? prop.assessedValue : 0,
      exclusionType: prop.exclusionType,
      reason: validationResult.reason,
      failReasons: validationResult.failReasons,
    };
  });

  const { totalExcludedValue, excludedCount } = results.reduce(
    (acc, r) =>
      r.isExcluded
        ? { totalExcludedValue: acc.totalExcludedValue + r.excludedValue, excludedCount: acc.excludedCount + 1 }
        : acc,
    { totalExcludedValue: 0, excludedCount: 0 },
  );

  return {
    propertyResults: results,
    totalExcludedValue,
    excludedCount,
    includedCount: results.length - excludedCount,
  };
}

// ============================================================
// T-06: 주택분 1세대1주택 세액공제
// ============================================================

/**
 * 고령자 공제율 반환 (종합부동산세법 §9②1호, 시행령 §4의2)
 * - 만 60세 이상 ~ 65세 미만: 20%
 * - 만 65세 이상 ~ 70세 미만: 30%
 * - 만 70세 이상: 40%
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
 * - 5년 이상 ~ 10년 미만: 20%
 * - 10년 이상 ~ 15년 미만: 40%
 * - 15년 이상: 50%
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
 * 1세대1주택 세액공제 계산 (T-06)
 * 합산 최대 80% 상한 적용
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
 * 주택분 세부담 상한 적용 (T-07)
 * 종합부동산세법 §10
 *
 * @param comprehensiveTax - 당해연도 종부세액 (재산세 비율안분 공제 후)
 * @param totalPropertyTax - 당해연도 재산세 합계
 * @param previousYearTotalTax - 전년도 총세액 (종부세+재산세, 미입력 시 undefined)
 * @param isMultiHouseInAdjustedArea - 조정대상지역 2주택+ 여부
 */
export function applyTaxCap(
  comprehensiveTax: number,
  totalPropertyTax: number,
  previousYearTotalTax: number | undefined,
  isMultiHouseInAdjustedArea: boolean,
): TaxCapResult | undefined {
  if (previousYearTotalTax === undefined) return undefined;

  // 종합부동산세법 §10: 현행 150% 단일 상한 (구 다주택 300% 조항 삭제됨)
  void isMultiHouseInAdjustedArea; // 현행법상 구분 불필요, 파라미터 호환성 유지
  const capRate = COMPREHENSIVE_CONST.TAX_CAP_RATE_GENERAL;

  const capAmount = Math.floor(previousYearTotalTax * capRate);

  // cappedTax = min(당해 종부세, 상한액 - 당해 재산세), 0 미만 방어
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
// T-08: 비율 안분 공제 공통 함수
// ============================================================

/**
 * 재산세 비율 안분 공제 계산 (T-08)
 * 종합부동산세법 §9③, 시행령 §4의2
 *
 * 공제액 = 재산세 부과세액 × (종부세 과세표준 ÷ 재산세 과세표준)
 * - 분모 0 방어: ratio = 0, creditAmount = 0
 * - 비율 상한 1.0 적용
 * - 공제액 ≤ 산출세액
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
  // 곱셈 먼저 후 나눗셈 (정밀도 유지)
  const creditRaw = Math.floor(
    safeMultiplyThenDivide(propertyTaxAmount, comprehensiveTaxBase, propertyTaxBase),
  );
  // 산출세액 초과 불가
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
// T-09: 종합합산 토지분 계산 모듈
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

/**
 * 종합합산 토지 누진세율 3단계 적용 (종합부동산세법 §13①)
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

/**
 * 종합합산 토지분 세부담 상한 (종합부동산세법 §15)
 * 150% 단일 상한 (다주택 300%는 주택분 전용)
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

/**
 * 종합합산 토지분 종합부동산세 계산 (T-09)
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

  // 납세의무 판정: 5억 초과 여부
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

  // 과세표준 산정
  const taxBase = calcAggregateLandTaxBase(totalOfficialValue);
  const afterDeduction = Math.max(
    totalOfficialValue - COMPREHENSIVE_LAND_CONST.AGGREGATE_DEDUCTION_AMOUNT,
    0,
  );

  // 세율 적용
  const { calculatedTax, appliedRate, progressiveDeduction } =
    calcAggregateLandTaxAmount(taxBase);

  // 재산세 비율 안분 공제
  const credit = calculatePropertyTaxCreditProration(
    propertyTaxAmount,
    taxBase,
    propertyTaxBase,
    calculatedTax,
  );
  const comprehensiveTaxAfterCredit = Math.max(
    calculatedTax - credit.creditAmount,
    0,
  );

  // 세부담 상한
  const taxCap = applyAggregateLandTaxCap(
    comprehensiveTaxAfterCredit,
    propertyTaxAmount,
    previousYearTotalTax,
  );

  const determinedTax = taxCap ? taxCap.cappedTax : comprehensiveTaxAfterCredit;

  // 농어촌특별세 (결정세액 × 20%)
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

// ============================================================
// T-11: 메인 엔진 통합 — calculateComprehensiveTax
// ============================================================

/**
 * 주택분 누진세율 7단계 적용
 */
function calcHousingTaxAmount(taxBase: number): {
  calculatedTax: number;
  appliedRate: number;
  progressiveDeduction: number;
} {
  if (taxBase <= 0) {
    return { calculatedTax: 0, appliedRate: 0.005, progressiveDeduction: 0 };
  }

  for (const bracket of HOUSING_BRACKETS) {
    if (taxBase <= bracket.limit) {
      const calculatedTax = applyRate(taxBase, bracket.rate) - bracket.deduction;
      return {
        calculatedTax: Math.max(calculatedTax, 0),
        appliedRate: bracket.rate,
        progressiveDeduction: bracket.deduction,
      };
    }
  }

  // 마지막 구간 (94억 초과)
  const last = HOUSING_BRACKETS[HOUSING_BRACKETS.length - 1];
  return {
    calculatedTax: Math.max(applyRate(taxBase, last.rate) - last.deduction, 0),
    appliedRate: last.rate,
    progressiveDeduction: last.deduction,
  };
}

/**
 * 종합부동산세 메인 통합 계산 함수 (T-11)
 *
 * 재산세(property-tax.ts) 자동 계산 → 비율 안분 공제 → 1세대1주택 공제 → 세부담 상한 → 농특세
 */
export function calculateComprehensiveTax(
  input: ComprehensiveTaxInput,
  rates?: TaxRatesMap,
): ComprehensiveTaxResult {
  const warnings: string[] = [];

  // 과세기준일 (assessmentYear-06-01)
  const assessmentDateStr = input.targetDate
    ?? `${input.assessmentYear}-06-01`;
  const assessmentDate = new Date(assessmentDateStr);

  // ── Step 0: 합산배제 판정 ──
  const propertiesForExclusion: PropertyForExclusion[] = input.properties.map((p) => ({
    propertyId: p.propertyId,
    assessedValue: p.assessedValue,
    area: p.area ?? 0,
    location: p.location ?? "metro",
    exclusionType: p.exclusionType ?? "none",
    rentalInfo: p.rentalInfo
      ? { ...p.rentalInfo, assessmentDate }
      : undefined,
    otherInfo: p.otherInfo,
  }));

  const aggregationExclusion = applyAggregationExclusion(
    propertiesForExclusion,
    assessmentDate,
  );

  // ── Step 1: 개별 주택 재산세 자동 계산 + 합산배제 결과 기록 ──
  const exclusionMap = new Map(
    aggregationExclusion.propertyResults.map((r) => [r.propertyId, r]),
  );
  const propertyResults: ComprehensiveTaxResult["properties"] = [];
  let totalPropertyTaxAmount = 0;   // 재산세 부과세액 합계 (비율안분 분자)
  let totalPropertyTaxBase = 0;     // 재산세 과세표준 합계 (비율안분 분모)
  let totalAssessedValueFromLoop = 0;

  for (const prop of input.properties) {
    totalAssessedValueFromLoop += prop.assessedValue;
    const exclusionResult = exclusionMap.get(prop.propertyId);
    const isExcluded = exclusionResult?.isExcluded ?? false;

    // 재산세 계산 (합산배제 여부 무관하게 재산세는 모두 계산 — 비율안분에 사용)
    let propTax = 0;
    let propTaxBase = 0;
    try {
      const ptResult = calculatePropertyTax(
        {
          objectType: "housing",
          publishedPrice: prop.assessedValue,
          isOneHousehold: input.isOneHouseOwner && input.properties.length === 1,
          targetDate: assessmentDateStr,
        },
        rates,
      );
      propTax = ptResult.determinedTax;
      propTaxBase = ptResult.taxBase;
    } catch {
      warnings.push(
        `주택(${prop.propertyId}) 재산세 계산 오류 — 비율 안분 공제에서 제외됩니다.`,
      );
    }

    // 합산배제 주택은 재산세 과세표준·부과세액을 비율안분 합계에 포함하지 않음
    if (!isExcluded) {
      totalPropertyTaxAmount += propTax;
      totalPropertyTaxBase += propTaxBase;
    }

    propertyResults.push({
      propertyId: prop.propertyId,
      assessedValue: prop.assessedValue,
      isExcluded,
      propertyTax: propTax,
    });
  }

  // ── Step 2: 합산배제 후 공시가격 합산 ──
  const totalAssessedValue = totalAssessedValueFromLoop;
  const includedAssessedValue = totalAssessedValue - aggregationExclusion.totalExcludedValue;

  // ── Step 3: 기본공제 차감 (9억/12억) ──
  const basicDeduction = input.isOneHouseOwner
    ? COMPREHENSIVE_CONST.BASIC_DEDUCTION_ONE_HOUSE
    : COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL;

  const afterBasicDeduction = Math.max(includedAssessedValue - basicDeduction, 0);

  // ── Step 4: 공정시장가액비율 적용 + 만원 미만 절사 ──
  const fairMarketRatio = COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING;
  const rawTaxBase = Math.floor(afterBasicDeduction * fairMarketRatio);
  const taxBase = truncateToTenThousand(rawTaxBase);

  // 납세의무 판정 (과세표준 > 0)
  const isSubjectToHousingTax = taxBase > 0;

  if (!isSubjectToHousingTax) {
    warnings.push(
      "주택분 종합부동산세 납세의무가 없습니다 (기본공제 이하).",
    );
  }

  // ── Step 5: 누진세율 7단계 → 산출세액 ──
  const { calculatedTax, appliedRate, progressiveDeduction } =
    calcHousingTaxAmount(taxBase);

  // ── Step 6: 1세대1주택 세액공제 ──
  let oneHouseDeduction: OneHouseDeductionResult | undefined = undefined;
  let taxAfterOneHouseDeduction = calculatedTax;

  if (
    input.isOneHouseOwner &&
    isSubjectToHousingTax &&
    input.birthDate &&
    input.acquisitionDate
  ) {
    oneHouseDeduction = applyOneHouseDeduction(
      calculatedTax,
      input.birthDate,
      input.acquisitionDate,
      assessmentDate,
    );
    taxAfterOneHouseDeduction = Math.max(
      calculatedTax - oneHouseDeduction.deductionAmount,
      0,
    );
  }

  // ── Step 7: 재산세 비율 안분 공제 ──
  const propertyTaxCredit = calculatePropertyTaxCreditProration(
    totalPropertyTaxAmount,
    taxBase,
    totalPropertyTaxBase,
    taxAfterOneHouseDeduction,
  );

  const comprehensiveTaxAfterCredit = Math.max(
    taxAfterOneHouseDeduction - propertyTaxCredit.creditAmount,
    0,
  );

  // ── Step 8: 세부담 상한 ──
  const taxCap = applyTaxCap(
    comprehensiveTaxAfterCredit,
    totalPropertyTaxAmount,
    input.previousYearTotalTax,
    input.isMultiHouseInAdjustedArea ?? false,
  );

  if (input.previousYearTotalTax === undefined) {
    warnings.push(
      "전년도 재산세·종부세 고지서의 합계 세액을 입력하시면 세부담 상한이 자동 적용됩니다.",
    );
  }

  const determinedHousingTax = taxCap
    ? taxCap.cappedTax
    : comprehensiveTaxAfterCredit;

  // ── Step 9: 농어촌특별세 (결정세액 × 20%) ──
  const housingRuralSpecialTax = Math.floor(
    determinedHousingTax * COMPREHENSIVE_CONST.RURAL_SPECIAL_TAX_RATE,
  );

  const totalHousingTax = determinedHousingTax + housingRuralSpecialTax;

  // ── Step A: 종합합산 토지분 ──
  let aggregateLandTax: AggregateLandTaxResult | undefined = undefined;
  if (input.landAggregate) {
    aggregateLandTax = calculateAggregateLandTax(input.landAggregate);
  }

  // ── Step B: 별도합산 토지분 ──
  let separateLandTax = undefined;
  if (input.landSeparate && input.landSeparate.length > 0) {
    separateLandTax = calculateSeparateAggregateLandTax(input.landSeparate);
  }

  // ── 최종 합계 ──
  const totalPropertyTaxFinal = propertyResults.reduce(
    (sum, p) => sum + p.propertyTax,
    0,
  );

  const grandTotal =
    totalHousingTax +
    totalPropertyTaxFinal +
    (aggregateLandTax?.totalTax ?? 0) +
    (separateLandTax?.totalTax ?? 0);

  // v1.3 scope 한계 안내
  warnings.push(
    "본 계산은 개인 단독명의 기준입니다. 부부 공동명의 특례·법인 종부세는 세무사 상담을 권장합니다.",
  );

  return {
    aggregationExclusion,
    properties: propertyResults,
    totalAssessedValue,
    includedAssessedValue,
    basicDeduction,
    fairMarketRatio,
    taxBase,
    isSubjectToHousingTax,
    appliedRate,
    progressiveDeduction,
    calculatedTax,
    oneHouseDeduction,
    propertyTaxCredit,
    taxCap,
    determinedHousingTax,
    housingRuralSpecialTax,
    totalHousingTax,
    totalPropertyTax: totalPropertyTaxFinal,
    aggregateLandTax,
    separateLandTax,
    grandTotal,
    assessmentDate: assessmentDateStr,
    isOneHouseOwner: input.isOneHouseOwner,
    warnings,
    appliedLawDate: assessmentDateStr,
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

  // 납부불성실 가산세: 추징세액 × 경과일수 × 0.022%
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
