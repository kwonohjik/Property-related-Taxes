/**
 * 재산세 분리과세대상 판정 및 세액 계산 엔진 (P5-02~08)
 *
 * 지방세법 §106①3호    — 분리과세대상 (종합합산·별도합산 배제)
 * 지방세법 시행령 §102  — 분리과세 대상 범위 (저율·일반·중과)
 * 지방세법 §111①1호 다목 — 분리과세 세율 0.07%/0.2%/4%
 * 지방세법 §113①3호   — 분리과세대상은 해당 토지의 가액만 과세표준(합산 없음)
 * 지방세법 §110①1호   — 그 가액: 시가표준액 × 공정시장가액비율(70%), 천원 절사
 *
 * 분리과세 법적 성격:
 *   - 종합합산·별도합산과 배제: 소유자별 합산 없이 건별 단일세율 과세
 *   - 종합부동산세 배제: 분리과세 토지는 종부세 과세대상 아님 (종부세법 §11)
 *   - 누진세율 미적용: 단일세율 과세
 *
 * 판정 우선순위: 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 */

import { applyRate } from "./tax-utils";
import { getCurrentPropertyRateSet } from "./data/property-rate-history";
import type { PropertyRateSet } from "./data/property-rate-history";
import { classifyHeavy, classifyLowRate, classifyStandard } from "./separate-taxation-classify";
import type { SeparateTaxationInput, SeparateTaxationResult } from "./separate-taxation-classify";

// 타입은 종전 import 경로(`./separate-taxation`) 그대로 쓸 수 있게 재수출한다(leaf 판정은 `separate-taxation-classify.ts`)
export type {
  GolfCourseType,
  SeparateTaxationCategory,
  SeparateTaxationInput,
  SeparateTaxationResult,
} from "./separate-taxation-classify";

// ============================================================
// 내부 상수
// ============================================================

/** 분리과세 공정시장가액비율 (70%) */
const FAIR_MARKET_RATIO = 0.70;
// 분리 세율(저율 0.0007·일반 0.002·중과 0.04)은 역사표 PropertyRateSet.landSeparated*로 이관
// (§111①1호 다목, Track A). 미러 검증: property-rate-history-anchor·sep-rateset-anchor A-4.

// ============================================================
// P5-06: classifySeparateTaxation — 통합 판정
// ============================================================

/**
 * 분리과세 통합 판정 (지방세법 §106①3호)
 *
 * 판정 우선순위 (엄수): 중과(4%) → 저율(0.07%) → 일반(0.2%) → 비해당
 *
 * 분리과세 해당 시 reasoning.excludedFrom에
 * ['comprehensive', 'special_aggregated'] 포함.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 미포함 — 세액 계산은 calculateSeparateTaxationTax)
 */
export function classifySeparateTaxation(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const warnings: string[] = [];

  // 1. 중과(4%) 우선
  const heavyResult = classifyHeavy(input, warnings, rateSet);
  if (heavyResult) return { ...heavyResult, warnings };

  // 2. 저율(0.07%)
  const lowRateResult = classifyLowRate(input, warnings, rateSet);
  if (lowRateResult) return { ...lowRateResult, warnings };

  // 3. 일반(0.2%)
  const standardResult = classifyStandard(input, warnings, rateSet);
  if (standardResult) return { ...standardResult, warnings };

  // 4. 분리과세 비해당
  return {
    isApplicable: false,
    reasoning: {
      legalBasis: "",
      matchedCondition: "분리과세 조건 미충족 — 종합합산 또는 별도합산 판정 필요",
      excludedFrom: [],
    },
    warnings,
  };
}

// ============================================================
// P5-07: calculateSeparateTaxationTax — 세액 계산
// ============================================================

/**
 * 분리과세 토지 세액 계산 (지방세법 §113①3호 · 과세표준 §110①1호)
 *
 * 계산 순서:
 * 1. 과세표준 = 시가표준액(assessedValue) × 공정시장가액비율(70%)
 * 2. 과세표준 → 천원 절사
 * 3. 산출세액 = 과세표준 × 단일세율, 원 미만 절사
 *
 * 오차 보증:
 * - 천원 절사: Math.floor(x / 1000) × 1000
 * - 세액 절사: Math.floor(taxBase × rate)
 *
 * @param classification classifySeparateTaxation(input) 결과
 * @param assessedValue  시가표준액 (원) — input.assessedValue
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTaxationTax(
  classification: SeparateTaxationResult,
  assessedValue: number,
): SeparateTaxationResult {
  if (!classification.isApplicable || classification.appliedRate === undefined) {
    return classification;
  }

  const fairMarketRatio = FAIR_MARKET_RATIO;

  // Step 1·2: 과세표준 = 시가표준액 × 70% (지방세법 §113 — 절사 규정 없음)
  const taxBase = applyRate(assessedValue, fairMarketRatio);

  // Step 3: 세액 = 과세표준 × 단일세율, 원 미만 절사 (P0-2: applyRate 사용)
  const calculatedTax = applyRate(taxBase, classification.appliedRate);

  return {
    ...classification,
    taxBase,
    fairMarketRatio,
    calculatedTax,
  };
}

// ============================================================
// P5-08: 종부세 배제 플래그
// ============================================================

/**
 * 분리과세 토지의 종합부동산세 배제 여부 판정
 *
 * 지방세법상 분리과세 토지(§106①3호)는 종합부동산세 과세대상 아님.
 * (종합부동산세법 §11 — 분리과세 토지는 합산 대상에서 제외)
 *
 * 호출자(comprehensive-tax.ts)에서 이 플래그를 확인하여
 * 분리과세 토지를 종부세 집계에서 제외해야 합니다.
 *
 * @param result classifySeparateTaxation() 또는 calculateSeparateTaxationTax() 결과
 * @returns true이면 종부세 과세 제외 대상
 *
 * @example
 * ```typescript
 * import { classifySeparateTaxation, isExcludedFromComprehensiveTax } from './separate-taxation';
 *
 * const classification = classifySeparateTaxation(input);
 * if (isExcludedFromComprehensiveTax(classification)) {
 *   // 이 토지는 종부세 합산에서 제외
 * }
 * ```
 */
export function isExcludedFromComprehensiveTax(
  result: SeparateTaxationResult,
): boolean {
  return (
    result.isApplicable &&
    result.reasoning.excludedFrom.includes("comprehensive")
  );
}

// ============================================================
// 편의 함수
// ============================================================

/**
 * 분리과세 판정 + 세액 계산 통합
 *
 * classifySeparateTaxation() + calculateSeparateTaxationTax() 순차 실행.
 * 단계 분리 불필요 시 사용.
 *
 * @param input SeparateTaxationInput
 * @returns SeparateTaxationResult (taxBase·calculatedTax 포함)
 */
export function calculateSeparateTax(
  input: SeparateTaxationInput,
  rateSet: PropertyRateSet = getCurrentPropertyRateSet(),
): SeparateTaxationResult {
  const classification = classifySeparateTaxation(input, rateSet);
  // 공장용지 기준면적 초과분은 분리과세에서 빠지므로 **인정분 시가표준액만** 과세표준이 된다
  // (「지방세법 시행령」 §102①1호 "…기준면적 범위의 토지"). 초과분은 종합합산 이관 — 경고로 안내.
  const base =
    classification.factoryAreaCheck?.recognizedAssessedValue ??
    classification.pastureAreaCheck?.recognizedAssessedValue ??
    input.assessedValue;
  return calculateSeparateTaxationTax(classification, base);
}
