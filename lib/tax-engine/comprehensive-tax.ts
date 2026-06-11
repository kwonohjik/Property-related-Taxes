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
import { COMPREHENSIVE_CONST, PROPERTY_CONST } from "./legal-codes";
import {
  getComprehensiveParams,
  isComprehensiveYearSupported,
  isMultiHouseRate,
  COMPREHENSIVE_MIN_SUPPORTED_YEAR,
} from "./data/comprehensive-historical";
import { calculatePropertyTax, calcHousingTax } from "./property-tax";
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
  ComprehensiveBracket,
  ComprehensiveTaxInput,
  ComprehensiveTaxResult,
  OneHouseDeductionResult,
  PropertyForExclusion,
} from "./types/comprehensive.types";

// ============================================================
// 주택분 누진세율 7단계 (종합부동산세법 §9①)
// ============================================================

/**
 * 주택분 누진세율 적용 (종합부동산세법 §9①) — 연도별 세율표를 매개변수로 받음.
 * 세율표는 getComprehensiveParams(year)의 general/multi 중 호출부가 선택해 전달.
 */
function calcHousingTaxAmount(
  taxBase: number,
  brackets: ComprehensiveBracket[],
): {
  calculatedTax: number;
  appliedRate: number;
  progressiveDeduction: number;
} {
  if (taxBase <= 0) {
    return { calculatedTax: 0, appliedRate: brackets[0].rate, progressiveDeduction: 0 };
  }

  // 세율 × 과세표준은 분수 정수 연산. rate(예: 0.036)를 float로 곱하면
  // floor 시 1원 부족(49,679,999.99→49,679,999). rate×1000 정수로 분수 연산.
  // (종부세 주택 세율은 최대 소수 3자리 — 0.006~0.060. memory feedback_applyrate_fractional_rate_one_won_error)
  const taxAtRate = (base: number, rate: number): number =>
    Math.floor((base * Math.round(rate * 1000)) / 1000);

  const target =
    brackets.find((b) => taxBase <= b.limit) ?? brackets[brackets.length - 1];
  return {
    calculatedTax: Math.max(taxAtRate(taxBase, target.rate) - target.deduction, 0),
    appliedRate: target.rate,
    progressiveDeduction: target.deduction,
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

  // 합산배제 의무임대기간 미충족 경고 전파 (시행령 §3① — 사후 추징 위험)
  // 내부 propertyId 노출 금지 → "임대주택 N번째" 순번 접두 부착 (코어 메시지는 ExclusionResult.warnings에 보존)
  aggregationExclusion.propertyResults.forEach((r, idx) => {
    if (r.warnings && r.warnings.length > 0) {
      for (const w of r.warnings) {
        warnings.push(`임대주택 ${idx + 1}번째: ${w}`);
      }
    }
  });

  // ── Step 1: 개별 주택 재산세 자동 계산 + 합산배제 기록 ──
  const exclusionMap = new Map(
    aggregationExclusion.propertyResults.map((r) => [r.propertyId, r]),
  );
  const propertyResults: ComprehensiveTaxResult["properties"] = [];
  let totalPropertyTaxAmount = 0;  // ⓐ: 부과세액 합계 (determinedTax)
  let standardRateTaxSum = 0;      // ⑥: 일반 표준세율 재산세 산출세액 합계 (특례세율 아님, 누진공제 적용)
  let totalAssessedValueFromLoop = 0;

  for (const prop of input.properties) {
    totalAssessedValueFromLoop += prop.assessedValue;
    const exclusionResult = exclusionMap.get(prop.propertyId);
    const isExcluded = exclusionResult?.isExcluded ?? false;

    let propTax = 0;
    let propStandardRateTax = 0;  // ⑥ 누적용: 해당 주택의 일반 표준세율 재산세 산출세액
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

      // ⑥ 계산: 일반 표준세율 강제 (isOneHousehold=false) — 특례세율 배제
      // calcHousingTax(taxBase, publishedPrice, isOneHousehold=false)
      // taxBase = ptResult.taxBase (재산세 과세표준, 재산세 FMR 적용 후)
      propStandardRateTax = calcHousingTax(ptResult.taxBase, prop.assessedValue, false).tax;
    } catch {
      warnings.push(
        `주택(${prop.propertyId}) 재산세 계산 오류 — 비율 안분 공제에서 제외됩니다.`,
      );
    }

    // 합산배제 주택은 비율안분 합계에 포함하지 않음
    if (!isExcluded) {
      totalPropertyTaxAmount += propTax;
      standardRateTaxSum += propStandardRateTax;
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

  // ── 연도별 세법 파라미터 로드 (과세귀속연도 기준) ──
  const yearParams = getComprehensiveParams(input.assessmentYear);
  if (!isComprehensiveYearSupported(input.assessmentYear)) {
    warnings.push(
      `${input.assessmentYear}년 귀속은 미지원 연도입니다 — ${COMPREHENSIVE_MIN_SUPPORTED_YEAR}년 이후 기준으로 계산하세요. (현행 세법으로 계산됨)`,
    );
  }

  // ── Step 3: 기본공제 차감 (연도별 일반/1세대1주택) ──
  const basicDeduction = input.isOneHouseOwner
    ? yearParams.basicDeductionOneHouse
    : yearParams.basicDeductionGeneral;
  const afterBasicDeduction = Math.max(includedAssessedValue - basicDeduction, 0);

  // ── Step 4: 공정시장가액비율 (연도별) + 만원 미만 절사 ──
  const fairMarketRatio = yearParams.fairMarketRatioHousing;
  const taxBase = truncateToTenThousand(Math.floor(afterBasicDeduction * fairMarketRatio));

  const isSubjectToHousingTax = taxBase > 0;
  if (!isSubjectToHousingTax) {
    warnings.push("주택분 종합부동산세 납세의무가 없습니다 (기본공제 이하).");
  }

  // ── Step 5: 누진세율 — 연도별 + 다주택 중과 판정 ──
  //   다주택 = 합산배제 제외 후 과세대상 주택 수 ≥ 3 (≤2022는 조정대상지역 2주택도 포함)
  const useMultiRate = isMultiHouseRate(
    input.assessmentYear,
    aggregationExclusion.includedCount,
    input.isMultiHouseInAdjustedArea ?? false,
  );
  const brackets = useMultiRate
    ? yearParams.housingBracketsMulti
    : yearParams.housingBracketsGeneral;
  const { calculatedTax, appliedRate, progressiveDeduction } =
    calcHousingTaxAmount(taxBase, brackets);

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

  // ── Step 7: 재산세 비율 안분 공제 (종합부동산세법 시행령 §4의3) ──
  //
  // ⑤ = 종부세 과세표준 × 재산세FMR(60%) × 0.4% (주택 최고세율, 누진공제 없음)
  //   = taxBase × PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING × 0.004
  //   분수 정수: taxBase × 60 × 4 / (100 × 1000)  = taxBase × 240 / 100_000
  //   (× 0.004 float 직접 곱 시 floor 1원 부족 — memory feedback_applyrate_fractional_rate_one_won_error)
  const propertyFMR = PROPERTY_CONST.FAIR_MARKET_RATIO_HOUSING; // 0.60
  // 0.004 = 4/1000, propertyFMR = 60/100 → 합산 numerator = taxBase × 60 × 4 / 100_000
  const numeratorStdTaxEq = Math.floor(
    (taxBase * Math.round(propertyFMR * 100) * 4) / 100_000,
  );
  // ⑥ = standardRateTaxSum (Step 1 루프에서 일반 표준세율 산출세액 누적)
  // ⓐ = totalPropertyTaxAmount (부과세액 합계)
  const propertyTaxCredit = calculatePropertyTaxCreditProration(
    totalPropertyTaxAmount,
    numeratorStdTaxEq,
    standardRateTaxSum,
    taxAfterOneHouseDeduction,
  );
  const comprehensiveTaxAfterCredit = Math.max(
    taxAfterOneHouseDeduction - propertyTaxCredit.creditAmount,
    0,
  );

  // ── Step 8: 세부담 상한 (연도별 — ≤2022 다주택 300% / 2023~ 단일 150%) ──
  const capRate =
    useMultiRate && yearParams.taxCapRateMultiHouseAdjusted !== undefined
      ? yearParams.taxCapRateMultiHouseAdjusted
      : yearParams.taxCapRateGeneral;
  const taxCap = applyTaxCap(
    comprehensiveTaxAfterCredit,
    totalPropertyTaxAmount,
    input.previousYearTotalTax,
    capRate,
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
    isMultiHouseRateApplied: useMultiRate,
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
