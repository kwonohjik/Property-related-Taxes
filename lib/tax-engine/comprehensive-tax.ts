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
 * 서브모듈:
 *   합산배제        → comprehensive-exclusion.ts
 *   1세대1주택·상한  → comprehensive-tax-helpers.ts
 *   종합합산 토지    → comprehensive-land-aggregate.ts
 *   별도합산 토지    → comprehensive-separate-land.ts
 */

import { applyRate, truncateToTenThousand } from "./tax-utils";
import { COMPREHENSIVE_CONST } from "./legal-codes";
import { calculatePropertyTax } from "./property-tax";
import { calculateSeparateAggregateLandTax } from "./comprehensive-separate-land";
import {
  applyAggregationExclusion,
  validateRentalExclusion,
  validateOtherExclusion,
} from "./comprehensive-exclusion";
import {
  getSeniorRate,
  getLongTermRate,
  applyOneHouseDeduction,
  applyTaxCap,
  calculatePropertyTaxCreditProration,
  calculatePostManagementPenalty,
} from "./comprehensive-tax-helpers";
import {
  calcAggregateLandTaxBase,
  calcAggregateLandTaxAmount,
  applyAggregateLandTaxCap,
  calculateAggregateLandTax,
} from "./comprehensive-land-aggregate";
import type { TaxRatesMap } from "@/lib/db/tax-rates";
import type {
  ComprehensiveTaxInput,
  ComprehensiveTaxResult,
  OneHouseDeductionResult,
  PropertyForExclusion,
} from "./types/comprehensive.types";

// ============================================================
// 주택분 누진세율 7단계 (종합부동산세법 §9①)
// ============================================================

interface ComprehensiveBracket {
  limit: number;
  rate: number;
  deduction: number;
}

const HOUSING_BRACKETS: ComprehensiveBracket[] = [
  { limit: 300_000_000,    rate: 0.005, deduction: 0 },
  { limit: 600_000_000,    rate: 0.007, deduction: 600_000 },
  { limit: 1_200_000_000,  rate: 0.010, deduction: 2_400_000 },
  { limit: 2_500_000_000,  rate: 0.013, deduction: 6_000_000 },
  { limit: 5_000_000_000,  rate: 0.015, deduction: 11_000_000 },
  { limit: 9_400_000_000,  rate: 0.020, deduction: 36_000_000 },
  { limit: Infinity,       rate: 0.027, deduction: 101_800_000 },
];

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

  const last = HOUSING_BRACKETS[HOUSING_BRACKETS.length - 1];
  return {
    calculatedTax: Math.max(applyRate(taxBase, last.rate) - last.deduction, 0),
    appliedRate: last.rate,
    progressiveDeduction: last.deduction,
  };
}

// ============================================================
// T-11: 메인 통합 계산 함수
// ============================================================

export function calculateComprehensiveTax(
  input: ComprehensiveTaxInput,
  rates?: TaxRatesMap,
): ComprehensiveTaxResult {
  const warnings: string[] = [];

  const assessmentDateStr = input.targetDate ?? `${input.assessmentYear}-06-01`;
  const assessmentDate = new Date(assessmentDateStr);

  // ── Step 0: 합산배제 판정 ──
  const propertiesForExclusion: PropertyForExclusion[] = input.properties.map((p) => ({
    propertyId: p.propertyId,
    assessedValue: p.assessedValue,
    area: p.area ?? 0,
    location: p.location ?? "metro",
    exclusionType: p.exclusionType ?? "none",
    rentalInfo: p.rentalInfo ? { ...p.rentalInfo, assessmentDate } : undefined,
    otherInfo: p.otherInfo,
  }));

  const aggregationExclusion = applyAggregationExclusion(
    propertiesForExclusion,
    assessmentDate,
  );

  // ── Step 1: 개별 주택 재산세 자동 계산 + 합산배제 기록 ──
  const exclusionMap = new Map(
    aggregationExclusion.propertyResults.map((r) => [r.propertyId, r]),
  );
  const propertyResults: ComprehensiveTaxResult["properties"] = [];
  let totalPropertyTaxAmount = 0;
  let totalPropertyTaxBase = 0;
  let totalAssessedValueFromLoop = 0;

  for (const prop of input.properties) {
    totalAssessedValueFromLoop += prop.assessedValue;
    const exclusionResult = exclusionMap.get(prop.propertyId);
    const isExcluded = exclusionResult?.isExcluded ?? false;

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

    // 합산배제 주택은 비율안분 합계에 포함하지 않음
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

  // ── Step 3: 기본공제 차감 ──
  const basicDeduction = input.isOneHouseOwner
    ? COMPREHENSIVE_CONST.BASIC_DEDUCTION_ONE_HOUSE
    : COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL;
  const afterBasicDeduction = Math.max(includedAssessedValue - basicDeduction, 0);

  // ── Step 4: 공정시장가액비율 + 만원 미만 절사 ──
  const fairMarketRatio = COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING;
  const taxBase = truncateToTenThousand(Math.floor(afterBasicDeduction * fairMarketRatio));

  const isSubjectToHousingTax = taxBase > 0;
  if (!isSubjectToHousingTax) {
    warnings.push("주택분 종합부동산세 납세의무가 없습니다 (기본공제 이하).");
  }

  // ── Step 5: 누진세율 7단계 ──
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

  const determinedHousingTax = taxCap ? taxCap.cappedTax : comprehensiveTaxAfterCredit;

  // ── Step 9: 농어촌특별세 ──
  const housingRuralSpecialTax = Math.floor(
    determinedHousingTax * COMPREHENSIVE_CONST.RURAL_SPECIAL_TAX_RATE,
  );
  const totalHousingTax = determinedHousingTax + housingRuralSpecialTax;

  // ── Step A: 종합합산 토지분 ──
  const aggregateLandTax = input.landAggregate
    ? calculateAggregateLandTax(input.landAggregate)
    : undefined;

  // ── Step B: 별도합산 토지분 ──
  const separateLandTax =
    input.landSeparate && input.landSeparate.length > 0
      ? calculateSeparateAggregateLandTax(input.landSeparate)
      : undefined;

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
// 하위 호환 re-export — 기존 import 경로 유지
// ============================================================

export {
  validateRentalExclusion,
  validateOtherExclusion,
  applyAggregationExclusion,
} from "./comprehensive-exclusion";

export {
  getSeniorRate,
  getLongTermRate,
  applyOneHouseDeduction,
  applyTaxCap,
  calculatePropertyTaxCreditProration,
  calculatePostManagementPenalty,
} from "./comprehensive-tax-helpers";

export {
  calcAggregateLandTaxBase,
  calcAggregateLandTaxAmount,
  applyAggregateLandTaxCap,
  calculateAggregateLandTax,
} from "./comprehensive-land-aggregate";
